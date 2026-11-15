/*
  Hariyana Vidya Mandir - Smart City controller (ESP32, Bluetooth Low Energy)

  Works with the "SmartCity Control" web app (Web Bluetooth, Nordic UART service).
  Board in Arduino IDE: "ESP32 Dev Module"  (ESP32 core by Espressif, 2.0.x or 3.x)
  No extra library needed - the BLE library comes with the ESP32 core.

  COMMANDS (text, each ends with a new line):
    SL:1/0  street lights (white LEDs)      BL:1/0  building lights (yellow LEDs)
    GR:1/0  green LEDs                      RD:1/0  red beacons
    WT:1/0  wind turbine motor              HT:1/0  water turbine motor
    AUTO:1/0  lights follow the LDR         THR:<0-4095>  dark/light threshold
    ALL:0   everything off                  GET     send status now
    SCENE:day|night|eco|show

  STATUS (sent about once a second and after every command):
    ST:SL=1,BL=0,GR=1,RD=0,WT=1,HT=0,AUTO=1;LDR=732
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
const uint8_t PIN_WT_A = 27;  // motor driver IN1  -> wind turbine motor (OUT1/OUT2)
const uint8_t PIN_WT_B = 26;  // motor driver IN2
const uint8_t PIN_HT_A = 25;  // motor driver IN3  -> water turbine motor (OUT3/OUT4)
const uint8_t PIN_HT_B = 33;  // motor driver IN4
const uint8_t PIN_LDR  = 32;  // LDR junction: 3V3 -> LDR -> GPIO32 -> resistor -> GND

// ---------- State ----------
enum : uint8_t { B_SL = 1, B_BL = 2, B_GR = 4, B_RD = 8, B_WT = 16, B_HT = 32 };
uint8_t state = 0;
bool autoMode = false;
int threshold = 1500;      // LDR reading below this = dark
int lastLdr = 0;

bool showOn = false;
uint8_t showStep = 0;
uint32_t showT = 0;
const uint8_t SHOW_STEPS[] = {
  B_WT,
  B_WT | B_GR,
  B_WT | B_GR | B_HT,
  B_WT | B_GR | B_HT | B_SL,
  B_WT | B_GR | B_HT | B_SL | B_BL,
  B_WT | B_GR | B_HT | B_SL | B_BL | B_RD
};

BLEServer* pServer = nullptr;
BLECharacteristic* pTx = nullptr;
volatile bool connected = false;
bool wasConnected = false;
bool statusDue = false;
uint32_t statT = 0, autoT = 0;

// small command queue (filled by the BLE callback, used in loop)
String cmdQ[8];
volatile uint8_t qHead = 0, qTail = 0;
String rxBuf = "";

void qPush(const String& s) {
  uint8_t n = (qHead + 1) & 7;
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
  digitalWrite(PIN_WT_A, isOn(B_WT)); digitalWrite(PIN_WT_B, LOW);
  digitalWrite(PIN_HT_A, isOn(B_HT)); digitalWrite(PIN_HT_B, LOW);
}

int readLdr() {
  long s = 0;
  for (int i = 0; i < 8; i++) s += analogRead(PIN_LDR);
  return (int)(s / 8);
}

String statusLine() {
  char b[100];
  snprintf(b, sizeof(b),
           "ST:SL=%d,BL=%d,GR=%d,RD=%d,WT=%d,HT=%d,AUTO=%d;LDR=%d\n",
           isOn(B_SL), isOn(B_BL), isOn(B_GR), isOn(B_RD),
           isOn(B_WT), isOn(B_HT), autoMode ? 1 : 0, lastLdr);
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

void handleCommand(String s) {
  s.trim();
  s.toUpperCase();
  if (s.length() == 0) return;
  if (s == "GET") { statusDue = true; return; }

  int c = s.indexOf(':');
  String k = (c < 0) ? s : s.substring(0, c);
  String v = (c < 0) ? String("") : s.substring(c + 1);
  int n = v.toInt();

  showOn = false;   // any command stops the Show

  if      (k == "SL")   { autoMode = false; setBit(B_SL, n != 0); }
  else if (k == "BL")   { autoMode = false; setBit(B_BL, n != 0); }
  else if (k == "GR")   { setBit(B_GR, n != 0); }
  else if (k == "RD")   { setBit(B_RD, n != 0); }
  else if (k == "WT")   { setBit(B_WT, n != 0); }
  else if (k == "HT")   { setBit(B_HT, n != 0); }
  else if (k == "AUTO") { autoMode = (n != 0); }
  else if (k == "THR")  { threshold = constrain(n, 0, 4095); }
  else if (k == "ALL")  { state = 0; autoMode = false; }
  else if (k == "SCENE") {
    autoMode = false;
    if      (v == "DAY")   state = B_GR | B_WT | B_HT;
    else if (v == "NIGHT") state = B_SL | B_BL | B_RD | B_WT;
    else if (v == "ECO")   state = B_SL | B_GR | B_WT | B_HT;
    else if (v == "SHOW")  { state = 0; showOn = true; showStep = 0; showT = millis() - 900; }
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

  const uint8_t outs[] = { PIN_SL, PIN_BL, PIN_GR, PIN_RD, PIN_WT_A, PIN_WT_B, PIN_HT_A, PIN_HT_B };
  for (uint8_t p : outs) { pinMode(p, OUTPUT); digitalWrite(p, LOW); }
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
    qTail = (qTail + 1) & 7;
    handleCommand(c);
    applyOutputs();
    statusDue = true;
  }

  uint32_t now = millis();

  // 2) Show scene (steps every 0.9 s, then stops)
  if (showOn && now - showT >= 900) {
    showT = now;
    if (showStep < sizeof(SHOW_STEPS)) {
      state = SHOW_STEPS[showStep++];
      applyOutputs();
      statusDue = true;
    } else {
      showOn = false;
    }
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

  // 4) send status
  if (connected && (statusDue || now - statT >= 1000)) {
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
