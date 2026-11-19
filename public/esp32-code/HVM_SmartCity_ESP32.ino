/*
  Hariyana Vidya Mandir - Smart City controller (ESP32, Bluetooth Low Energy)

  Works with the "SmartCity Control" web app (Web Bluetooth, Nordic UART service).
  Board in Arduino IDE: "ESP32 Dev Module"  (ESP32 core by Espressif, 2.0.x or 3.x)
  No extra library needed - the BLE library comes with the ESP32 core.

  COMMANDS (text, each ends with a new line):
    SL:1/0  street lights (white LEDs)      BL:1/0  building lights (yellow LEDs)
    GR:1/0  green LEDs                      RD:1/0  red beacons
    WT:1/0  wind turbines (both motor outputs of the L298N together)
    AUTO:1/0  lights follow the LDR         THR:<0-4095>  dark/light threshold
    ALL:0   everything off                  GET     send status now
    SCENE:day|night|eco|show
    SHOW:0  stop the show (the city returns to how it was before the show)

  SHOW: a stage light show that runs on the ESP32 itself (no Bluetooth latency): 128 BPM,
  a new step every half beat (~234 ms), 10 patterns of 2 bars each, looping until stopped.
  The wind turbines spin for the whole show. Any other command ends it and restores the city first.

  PARTY MODE (1-minute song on the buzzer; the lights step through the 10 show patterns
  on every half beat of the song, a new pattern every 2 bars, turbines on):
    MB:<60-180>       start a new song at this tempo (beats per minute)
    MA:<notes>        add up to 15 notes, 4 hex digits each: 2 = MIDI note
                      (00 = rest), 2 = length in 16th notes. e.g. MA:3C044004
    MP:1 / MP:0       start / stop the party (the city returns to how it was)

  STATUS (sent about once a second and after every command):
    ST:SL=1,BL=0,GR=1,RD=0,WT=1,AUTO=1,MU=0,SH=0;LDR=732
    (MU=1 while the party music is playing, SH=1 while the show is running)

  BUZZER: passive buzzer + -> 100 ohm resistor -> GPIO23, buzzer - -> GND.
  (A small speaker also works through an NPN transistor driver.)
*/

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// ---------- BLE (Nordic UART service) ----------
#define SERVICE_UUID "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define RX_UUID      "6e400002-b5a3-f393-e0a9-e50e24dcca9e"   // app -> ESP32
#define TX_UUID      "6e400003-b5a3-f393-e0a9-e50e24dcca9e"   // ESP32 -> app
const char* DEVICE_NAME = "HVM-SmartCity";

// ---------- PIN MAP (change here if you wire differently) ----------
// Pins follow the team's circuit diagram (circuit_diagram.pdf)
const uint8_t PIN_SL = 13;    // street lights   (white LED)
const uint8_t PIN_BL = 12;    // building lights (yellow LED)
const uint8_t PIN_GR = 14;    // green LED
const uint8_t PIN_RD = 15;    // red LED
// The model has wind turbines only (no water turbine). The WT command drives BOTH motor channels
// of the L298N, so the fans spin whichever output (OUT1/OUT2 or OUT3/OUT4) they are wired to.
const uint8_t PIN_M1_A = 27;  // motor driver IN1  -> motor channel 1 (OUT1/OUT2)
const uint8_t PIN_M1_B = 26;  // motor driver IN2
const uint8_t PIN_M2_A = 25;  // motor driver IN3  -> motor channel 2 (OUT3/OUT4)
const uint8_t PIN_M2_B = 33;  // motor driver IN4
const uint8_t PIN_LDR  = 32;  // LDR junction: 3V3 -> LDR -> GPIO32 -> resistor -> GND
const uint8_t PIN_BUZ  = 23;  // passive buzzer (party music)

// ---------- State ----------
enum : uint8_t { B_SL = 1, B_BL = 2, B_GR = 4, B_RD = 8, B_WT = 16 };
uint8_t state = 0;
bool autoMode = false;
int threshold = 1500;      // LDR reading below this = dark
int lastLdr = 0;

// ---------- Party mode (song + lights to the beat) ----------
const uint16_t MAX_NOTES = 400;
uint8_t songNote[MAX_NOTES];   // MIDI note number, 0 = rest
uint8_t songLen[MAX_NOTES];    // length in 16th notes
uint16_t songCount = 0;
uint16_t songBpm = 120;
bool partyOn = false, toneOn = false;
uint16_t partyIdx = 0;
uint32_t partyNoteT = 0, partyNoteMs = 0, partySix = 0, partyNoteSix = 0, partyEighth = 0;
uint8_t partySaved = 0;
bool partySavedAuto = false;

// ---------- Show (stage light show) ----------
// W = white street lights, Y = yellow building lights, G = green, R = red, A = all four, 0 = dark.
enum : uint8_t { W_ = B_SL, Y_ = B_BL, G_ = B_GR, R_ = B_RD, A_ = B_SL | B_BL | B_GR | B_RD };
const uint16_t SHOW_BPM = 128;
const uint32_t SHOW_STEP_MS = 60000UL / SHOW_BPM / 2;   // half a beat: ~234 ms
const uint8_t SHOW_STEPS[] = {
  // 1 chase
  W_, Y_, G_, R_, W_, Y_, G_, R_, W_, Y_, G_, R_, W_, Y_, G_, R_,
  // 2 bounce
  W_, Y_, G_, R_, G_, Y_, W_, Y_, G_, R_, G_, Y_, W_, Y_, G_, R_,
  // 3 alternating pairs
  W_|G_, Y_|R_, W_|G_, Y_|R_, W_|G_, Y_|R_, W_|G_, Y_|R_, W_|G_, Y_|R_, W_|G_, Y_|R_, W_|G_, Y_|R_, W_|G_, Y_|R_,
  // 4 build and drop
  W_, W_|Y_, W_|Y_|G_, A_, A_, 0, A_, 0, R_, R_|G_, R_|G_|Y_, A_, A_, 0, A_, 0,
  // 5 strobe
  A_, 0, A_, 0, A_, 0, A_, 0, A_, 0, A_, 0, A_, 0, A_, 0,
  // 6 red and white flash
  R_, 0, R_, 0, W_, 0, W_, 0, R_, 0, R_, 0, W_, 0, W_, 0,
  // 7 fill and drain
  W_, W_|Y_, W_|Y_|G_, A_, Y_|G_|R_, G_|R_, R_, 0, R_, R_|G_, R_|G_|Y_, A_, W_|Y_|G_, W_|Y_, W_, 0,
  // 8 twin flash
  W_|Y_, 0, G_|R_, 0, W_|Y_, 0, G_|R_, 0, W_|R_, 0, Y_|G_, 0, W_|R_, 0, Y_|G_, 0,
  // 9 sparkle
  W_|G_, R_, Y_, W_|R_, G_, Y_|R_, W_, G_|Y_, R_, W_|Y_, G_|R_, W_, Y_|G_, R_, W_|G_|R_, A_,
  // 10 finale
  A_, 0, A_, 0, A_, A_, 0, 0, A_, 0, A_, 0, A_, A_, A_, 0
};
const uint16_t SHOW_LEN = sizeof(SHOW_STEPS);
bool showOn = false, showSavedAuto = false;
uint16_t showStep = 0;
uint32_t showT = 0;
uint8_t showSaved = 0;

BLEServer* pServer = nullptr;
BLECharacteristic* pTx = nullptr;
volatile bool connected = false;
bool wasConnected = false;
bool statusDue = false;
uint32_t statT = 0, autoT = 0;

// command queue (filled by the BLE callback, used in loop); a song upload sends ~20 lines in a row
String cmdQ[32];
volatile uint8_t qHead = 0, qTail = 0;
String rxBuf = "";

void qPush(const String& s) {
  uint8_t n = (qHead + 1) & 31;
  if (n == qTail) return;           // queue full, drop
  cmdQ[qHead] = s;
  qHead = n;
}

bool isOn(uint8_t bit) { return (state & bit) != 0; }
void setBit(uint8_t bit, bool v) { if (v) state |= bit; else state &= (uint8_t)~bit; }

void applyOutputs() {
  digitalWrite(PIN_SL, isOn(B_SL));
  digitalWrite(PIN_BL, isOn(B_BL));
  digitalWrite(PIN_GR, isOn(B_GR));
  digitalWrite(PIN_RD, isOn(B_RD));
  // wind turbines: both motor channels together, always the same direction
  digitalWrite(PIN_M1_A, isOn(B_WT)); digitalWrite(PIN_M1_B, LOW);
  digitalWrite(PIN_M2_A, isOn(B_WT)); digitalWrite(PIN_M2_B, LOW);
}

int readLdr() {
  long s = 0;
  for (int i = 0; i < 8; i++) s += analogRead(PIN_LDR);
  return (int)(s / 8);
}

String statusLine() {
  char b[110];
  snprintf(b, sizeof(b),
           "ST:SL=%d,BL=%d,GR=%d,RD=%d,WT=%d,AUTO=%d,MU=%d,SH=%d;LDR=%d\n",
           isOn(B_SL), isOn(B_BL), isOn(B_GR), isOn(B_RD),
           isOn(B_WT), autoMode ? 1 : 0, partyOn ? 1 : 0, showOn ? 1 : 0, lastLdr);
  return String(b);
}

// BLE notifications are small, so send the line in 20-byte pieces
void notifyLine(const String& s) {
  if (!connected || pTx == nullptr) return;
  for (size_t i = 0; i < s.length(); i += 20) {
    String part = s.substring(i, i + 20);
    pTx->setValue((uint8_t*)part.c_str(), part.length());
    pTx->notify();
    delay(12);
  }
}

int hexByte(const String& v, int i) {
  char t[3] = { v[i], v[i + 1], 0 };
  return (int)strtol(t, nullptr, 16);
}

// Party lights: the show patterns, one step per half beat (two 16th notes) of the song. The step is
// worked out from the song position (notes played + progress through this note), so the lights stay
// locked to the music. Returns true when the lights changed.
bool partyLights(uint32_t now) {
  uint32_t el = now - partyNoteT;
  if (el > partyNoteMs) el = partyNoteMs;
  uint32_t six = partyNoteSix + (partyNoteMs ? el * songLen[partyIdx] / partyNoteMs : 0);
  uint32_t eighth = six / 2;
  if (eighth == partyEighth) return false;
  partyEighth = eighth;
  state = SHOW_STEPS[eighth % SHOW_LEN] | B_WT;   // the wind turbines keep spinning for the whole party
  applyOutputs();
  return true;
}

void playNote(uint16_t i) {
  partyNoteSix = partySix;
  partySix += songLen[i];
  partyNoteMs = (uint32_t)songLen[i] * 15000UL / songBpm;   // 60000 / bpm / 4
  if (songNote[i] > 0) {
    tone(PIN_BUZ, (unsigned int)(440.0f * powf(2.0f, (songNote[i] - 69) / 12.0f)));
    toneOn = true;
  } else if (toneOn) {
    noTone(PIN_BUZ);
    toneOn = false;
  }
}

void showFrame() {
  state = SHOW_STEPS[showStep] | B_WT;   // the wind turbines spin for the whole show
  applyOutputs();
}

void stopShow(bool restore) {
  if (!showOn) return;
  showOn = false;
  if (restore) { state = showSaved; autoMode = showSavedAuto; }
  applyOutputs();
  statusDue = true;
}

void startShow() {
  if (!showOn) { showSaved = state; showSavedAuto = autoMode; }
  autoMode = false;
  showOn = true;
  showStep = 0;
  showT = millis();
  showFrame();
  statusDue = true;
}

void stopParty(bool restore) {
  if (toneOn) { noTone(PIN_BUZ); toneOn = false; }
  if (!partyOn) return;
  partyOn = false;
  if (restore) { state = partySaved; autoMode = partySavedAuto; }
  applyOutputs();
  statusDue = true;
}

void startParty() {
  if (songCount == 0) return;
  stopParty(false);
  stopShow(true);
  partySaved = state;
  partySavedAuto = autoMode;
  autoMode = false;
  partyOn = true;
  partyIdx = 0;
  partySix = 0;
  partyEighth = 0xFFFFFFFFUL;
  partyNoteT = millis();
  playNote(0);
  partyLights(partyNoteT);
  statusDue = true;
}

void handleCommand(String s) {
  s.trim();
  s.toUpperCase();
  if (s.length() == 0) return;
  if (s == "GET") { statusDue = true; return; }

  int c = s.indexOf(':');
  String k = (c < 0) ? s : s.substring(0, c);
  String v = (c < 0) ? String("") : s.substring(c + 1);
  int n = v.toInt();

  // party mode commands
  if (k == "MB") { stopParty(true); songBpm = constrain(n, 60, 180); songCount = 0; return; }
  if (k == "MA") {
    for (int i = 0; i + 3 < (int)v.length() && songCount < MAX_NOTES; i += 4) {
      int len = hexByte(v, i + 2);
      if (len <= 0) continue;
      songNote[songCount] = (uint8_t)hexByte(v, i);
      songLen[songCount] = (uint8_t)len;
      songCount++;
    }
    return;
  }
  if (k == "MP") { if (n != 0) startParty(); else stopParty(true); return; }

  stopParty(true);  // any other command ends the party and gives control back
  if (k == "SCENE" && v == "SHOW") { startShow(); return; }
  if (k == "SHOW") { if (n != 0) startShow(); else stopShow(true); return; }
  stopShow(true);   // any other command ends the show and restores the city first

  if      (k == "SL")   { autoMode = false; setBit(B_SL, n != 0); }
  else if (k == "BL")   { autoMode = false; setBit(B_BL, n != 0); }
  else if (k == "GR")   { setBit(B_GR, n != 0); }
  else if (k == "RD")   { setBit(B_RD, n != 0); }
  else if (k == "WT")   { setBit(B_WT, n != 0); }
  else if (k == "AUTO") { autoMode = (n != 0); }
  else if (k == "THR")  { threshold = constrain(n, 0, 4095); }
  else if (k == "ALL")  { state = 0; autoMode = false; }
  else if (k == "SCENE") {
    autoMode = false;
    if      (v == "DAY")   state = B_GR | B_WT;
    else if (v == "NIGHT") state = B_SL | B_BL | B_RD | B_WT;
    else if (v == "ECO")   state = B_SL | B_GR | B_WT;
  }
  Serial.print("CMD: "); Serial.println(s);
}

class RxCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* ch) override {
    auto v = ch->getValue();
    for (size_t i = 0; i < v.length(); i++) {
      char c = v[i];
      if (c == '\n' || c == '\r') {
        if (rxBuf.length() > 0) { qPush(rxBuf); rxBuf = ""; }
      } else if (rxBuf.length() < 64) {
        rxBuf += c;
      }
    }
  }
};

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer*) override { connected = true; statusDue = true; }
  void onDisconnect(BLEServer*) override { connected = false; }
};

void setup() {
  Serial.begin(115200);

  const uint8_t outs[] = { PIN_SL, PIN_BL, PIN_GR, PIN_RD, PIN_M1_A, PIN_M1_B, PIN_M2_A, PIN_M2_B };
  for (uint8_t p : outs) { pinMode(p, OUTPUT); digitalWrite(p, LOW); }
  pinMode(PIN_BUZ, OUTPUT); digitalWrite(PIN_BUZ, LOW);
  analogSetPinAttenuation(PIN_LDR, ADC_11db);
  applyOutputs();

  BLEDevice::init(DEVICE_NAME);
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new ServerCallbacks());

  BLEService* svc = pServer->createService(SERVICE_UUID);
  pTx = svc->createCharacteristic(TX_UUID, BLECharacteristic::PROPERTY_NOTIFY);
  pTx->addDescriptor(new BLE2902());
  BLECharacteristic* rx = svc->createCharacteristic(
      RX_UUID, BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  rx->setCallbacks(new RxCallbacks());
  svc->start();

  BLEAdvertising* adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(SERVICE_UUID);
  adv->setScanResponse(true);
  BLEDevice::startAdvertising();
  Serial.println("Ready. Advertising as HVM-SmartCity");
}

void loop() {
  // 1) run commands received over Bluetooth
  while (qTail != qHead) {
    String c = cmdQ[qTail];
    qTail = (qTail + 1) & 31;
    handleCommand(c);
    applyOutputs();
    // song lines don't change the city, so skip the status reply and keep the upload fast
    if (!c.substring(0, 3).equalsIgnoreCase("MA:")) statusDue = true;
  }

  uint32_t now = millis();

  // 2) Party: next note when this one ends, with a short gap so repeated notes are heard
  if (partyOn) {
    uint32_t el = now - partyNoteT;
    if (el >= partyNoteMs) {
      partyNoteT += partyNoteMs;   // fixed timeline: short pauses (status replies) never add up to drift
      if (++partyIdx >= songCount) stopParty(true);
      else playNote(partyIdx);
    } else if (toneOn && el >= partyNoteMs - partyNoteMs / 8) {
      noTone(PIN_BUZ);
      toneOn = false;
    }
  }
  bool partyStepped = partyOn && partyLights(now);

  // 2b) Show: next step on a fixed timeline, so status replies never delay or drift the beat
  bool showStepped = false;
  if (showOn && now - showT >= SHOW_STEP_MS) {
    showStepped = true;
    showT += SHOW_STEP_MS;
    if (now - showT >= SHOW_STEP_MS) showT = now;   // after a long stall, carry on instead of racing to catch up
    showStep = (showStep + 1) % SHOW_LEN;
    showFrame();
  }

  // 3) read the LDR, and run Auto mode (works even if the phone disconnects)
  if (now - autoT >= 500) {
    autoT = now;
    lastLdr = readLdr();
    if (autoMode) {
      if (lastLdr < threshold - 100)      { setBit(B_SL, true);  setBit(B_BL, true);  }
      else if (lastLdr > threshold + 100) { setBit(B_SL, false); setBit(B_BL, false); }
      applyOutputs();
    }
  }

  // 4) send status. During the show or a party the regular update goes out right after a light change,
  //    so the time spent sending falls between steps and never delays the next one.
  if (connected && (statusDue || (now - statT >= 1000 && (!(showOn || partyOn) || showStepped || partyStepped)))) {
    statT = now;
    statusDue = false;
    notifyLine(statusLine());
  }

  // 5) keep advertising after a disconnect so the app can reconnect
  if (!connected && wasConnected) {
    delay(300);
    BLEDevice::startAdvertising();
  }
  wasConnected = connected;

  delay(5);
}
