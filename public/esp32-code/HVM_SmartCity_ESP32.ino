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
  a new step every half beat (~234 ms), 100 patterns of one bar each, looping until stopped.
  The wind turbines spin for the whole show. Any other command ends it and restores the city first.

  PARTY MODE (1-minute song on the buzzer; the lights step through the 100 patterns on every
  half beat of the song, a new pattern every bar, each party continuing where the last ended):
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

// ---------- Light patterns for the Show and Party Mode ----------
// 100 patterns of one bar each (8 half-beat steps). Values are light bits: 1 = white street lights,
// 2 = yellow building lights, 4 = green, 8 = red (15 = all four, 0 = dark). The website's demo mode
// uses the same table (src/lib/show.ts), and a test checks the two are identical.
const uint16_t SHOW_BPM = 128;
const uint32_t SHOW_STEP_MS = 60000UL / SHOW_BPM / 2;   // half a beat: ~234 ms
const uint8_t PATTERN_STEPS = 8;
const uint8_t SHOW_STEPS[] = {
   1,  2,  4,  8,  1,  2,  4,  8,   //   1 chase WYGR
   1,  2,  4,  8,  4,  2,  1,  2,   //   2 bounce WYGR
  15,  0, 15,  0, 15,  0, 15,  0,   //   3 strobe
   1,  3,  7, 15, 15,  0, 15,  0,   //   4 fill WYGR
   3, 12,  3, 12,  3, 12,  3, 12,   //   5 pairs 3/12
   1,  3,  6, 12,  8, 12,  6,  3,   //   6 wave WYGR
   8,  0,  8,  0,  1,  0,  1,  0,   //   7 police red/white
   3,  6, 12,  9,  3,  6, 12,  9,   //   8 double chase WYGR
   1,  0,  1,  0,  1,  0,  1,  0,   //   9 W strobe
  15, 14, 12,  8,  0,  8,  0, 15,   //  10 drain WYGR
   3,  0,  3,  0,  3,  0,  3,  0,   //  11 pair strobe 3
   1,  3,  7, 15,  7,  3,  1,  0,   //  12 rise and fall WYGR
   1,  0,  1,  0,  0,  0,  0,  0,   //  13 heartbeat 1
   1,  0,  2,  0,  4,  0,  8,  0,   //  14 spaced chase WYGR
   3, 14,  5, 15,  9,  6,  6,  8,   //  15 sparkle 1
   1,  2,  3,  4,  5,  6,  7,  8,   //  16 count up
   9,  6, 15,  0,  9,  6, 15,  0,   //  17 converge
   1,  2,  8,  4,  1,  2,  8,  4,   //  18 chase WYRG
   1,  2,  8,  4,  8,  2,  1,  2,   //  19 bounce WYRG
  15, 15,  0,  0, 15, 15,  0,  0,   //  20 double hit
   1,  3, 11, 15, 15,  0, 15,  0,   //  21 fill WYRG
   5, 10,  5, 10,  5, 10,  5, 10,   //  22 pairs 5/10
   1,  3, 10, 12,  4, 12, 10,  3,   //  23 wave WYRG
   8,  1,  8,  1,  8,  1,  8,  1,   //  24 police swap
   3, 10, 12,  5,  3, 10, 12,  5,   //  25 double chase WYRG
   1, 14,  1, 14,  1, 14,  1, 14,   //  26 W against the rest
  15, 14, 12,  4,  0,  4,  0, 15,   //  27 drain WYRG
   5,  0,  5,  0,  5,  0,  5,  0,   //  28 pair strobe 5
   1,  3, 11, 15, 11,  3,  1,  0,   //  29 rise and fall WYRG
   2,  0,  2,  0,  0,  0,  0,  0,   //  30 heartbeat 2
   1,  0,  2,  0,  8,  0,  4,  0,   //  31 spaced chase WYRG
   5,  5,  2,  4, 15,  7,  6, 10,   //  32 sparkle 2
   9, 10, 11, 12, 13, 14, 15,  0,   //  33 count high
   6,  9, 15,  0,  6,  9, 15,  0,   //  34 expand
   1,  4,  2,  8,  1,  4,  2,  8,   //  35 chase WGYR
   1,  4,  2,  8,  2,  4,  1,  4,   //  36 bounce WGYR
  15,  0,  0,  0, 15,  0,  0,  0,   //  37 downbeat
   1,  5,  7, 15, 15,  0, 15,  0,   //  38 fill WGYR
   9,  6,  9,  6,  9,  6,  9,  6,   //  39 pairs 9/6
   1,  5,  6, 10,  8, 10,  6,  5,   //  40 wave WGYR
  10,  0,  5,  0, 10,  0,  5,  0,   //  41 police cross
   5,  6, 10,  9,  5,  6, 10,  9,   //  42 double chase WGYR
   2,  0,  2,  0,  2,  0,  2,  0,   //  43 Y strobe
  15, 14, 10,  8,  0,  8,  0, 15,   //  44 drain WGYR
   9,  0,  9,  0,  9,  0,  9,  0,   //  45 pair strobe 9
   1,  5,  7, 15,  7,  5,  1,  0,   //  46 rise and fall WGYR
   4,  0,  4,  0,  0,  0,  0,  0,   //  47 heartbeat 4
   1,  0,  4,  0,  2,  0,  8,  0,   //  48 spaced chase WGYR
   8,  2, 14,  1,  5, 10, 10, 10,   //  49 sparkle 3
   9,  9,  6,  6, 15, 15,  0,  0,   //  50 outer inner hold
   1,  4,  8,  2,  1,  4,  8,  2,   //  51 chase WGRY
   1,  4,  8,  2,  8,  4,  1,  4,   //  52 bounce WGRY
  15,  0, 15,  0, 15, 15, 15,  0,   //  53 triplet tail
   1,  5, 13, 15, 15,  0, 15,  0,   //  54 fill WGRY
   3,  0, 12,  0,  3,  0, 12,  0,   //  55 pairs gap 3/12
   1,  5, 12, 10,  2, 10, 12,  5,   //  56 wave WGRY
   8,  8,  1,  1,  8,  8,  1,  1,   //  57 police hold
   5, 12, 10,  3,  5, 12, 10,  3,   //  58 double chase WGRY
   2, 13,  2, 13,  2, 13,  2, 13,   //  59 Y against the rest
  15, 14, 10,  2,  0,  2,  0, 15,   //  60 drain WGRY
   6,  0,  6,  0,  6,  0,  6,  0,   //  61 pair strobe 6
   1,  5, 13, 15, 13,  5,  1,  0,   //  62 rise and fall WGRY
   8,  0,  8,  0,  0,  0,  0,  0,   //  63 heartbeat 8
   1,  0,  4,  0,  8,  0,  2,  0,   //  64 spaced chase WGRY
  11, 13,  2, 13, 14, 15, 12,  3,   //  65 sparkle 4
   1,  8,  2,  4,  1,  8,  2,  4,   //  66 chase WRYG
   1,  8,  2,  4,  2,  8,  1,  8,   //  67 bounce WRYG
  15,  0,  0, 15,  0,  0, 15,  0,   //  68 syncopated
   1,  9, 11, 15, 15,  0, 15,  0,   //  69 fill WRYG
   5,  0, 10,  0,  5,  0, 10,  0,   //  70 pairs gap 5/10
   1,  9, 10,  6,  4,  6, 10,  9,   //  71 wave WRYG
   2,  0,  2,  0,  4,  0,  4,  0,   //  72 amber/green
   9, 10,  6,  5,  9, 10,  6,  5,   //  73 double chase WRYG
   4,  0,  4,  0,  4,  0,  4,  0,   //  74 G strobe
  15, 14,  6,  4,  0,  4,  0, 15,   //  75 drain WRYG
  10,  0, 10,  0, 10,  0, 10,  0,   //  76 pair strobe 10
   1,  9, 11, 15, 11,  9,  1,  0,   //  77 rise and fall WRYG
  15,  0, 15,  0,  0,  0,  0,  0,   //  78 heartbeat 15
   1,  0,  8,  0,  2,  0,  4,  0,   //  79 spaced chase WRYG
  11,  9,  4, 15,  7,  6,  5, 10,   //  80 sparkle 5
   1,  8,  4,  2,  1,  8,  4,  2,   //  81 chase WRGY
   1,  8,  4,  2,  4,  8,  1,  8,   //  82 bounce WRGY
  15, 15, 15,  0, 15,  0, 15,  0,   //  83 gallop
   1,  9, 13, 15, 15,  0, 15,  0,   //  84 fill WRGY
   9,  0,  6,  0,  9,  0,  6,  0,   //  85 pairs gap 9/6
   1,  9, 12,  6,  2,  6, 12,  9,   //  86 wave WRGY
   2,  4,  2,  4,  8,  1,  8,  1,   //  87 four-colour flash
   9, 12,  6,  3,  9, 12,  6,  3,   //  88 double chase WRGY
   4, 11,  4, 11,  4, 11,  4, 11,   //  89 G against the rest
  15, 14,  6,  2,  0,  2,  0, 15,   //  90 drain WRGY
  12,  0, 12,  0, 12,  0, 12,  0,   //  91 pair strobe 12
   1,  9, 13, 15, 13,  9,  1,  0,   //  92 rise and fall WRGY
   1,  0,  8,  0,  4,  0,  2,  0,   //  93 spaced chase WRGY
   3,  6, 15, 15, 13,  5,  2,  2,   //  94 sparkle 6
   0, 15,  0, 15, 15,  0, 15, 15,   //  95 offbeat
   3,  3, 12, 12,  3,  3, 12, 12,   //  96 pairs hold 3/12
   8,  0,  8,  0,  8,  0,  8,  0,   //  97 R strobe
  15,  8,  2,  4, 11,  2, 10,  7,   //  98 sparkle 7
  15,  0, 15, 15,  0, 15,  0,  0,   //  99 skip
   5,  5, 10, 10,  5,  5, 10, 10,   // 100 pairs hold 5/10
};
const uint16_t SHOW_LEN = sizeof(SHOW_STEPS);
const uint16_t PATTERN_COUNT = SHOW_LEN / PATTERN_STEPS;   // 100
uint16_t partyPattern = 0;   // each party carries on from where the last one stopped
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
  state = SHOW_STEPS[((uint32_t)partyPattern * PATTERN_STEPS + eighth) % SHOW_LEN] | B_WT;   // turbines keep spinning
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
  // the next party starts on the pattern after the last one this party reached
  partyPattern = (partyPattern + partyEighth / PATTERN_STEPS + 1) % PATTERN_COUNT;
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
