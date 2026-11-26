/*
  Hariyana Vidya Mandir - Smart City controller (ESP32, Bluetooth Low Energy)

  Works with the "SmartCity Control" web app (Web Bluetooth, Nordic UART service).
  Board in Arduino IDE: "ESP32 Dev Module"  (ESP32 core by Espressif, 2.0.x or 3.x)
  No extra library needed - the BLE library comes with the ESP32 core.

  COMMANDS (text, each ends with a new line):
    SL:1/0  street lights (white LEDs)      BL:1/0  building lights (yellow LEDs)
    GR:1/0  green LEDs                      RD:1/0  red beacons
    WT:1/0  wind turbines (both motor outputs of the L298N together)
    AUTO:1/0  street + building lights follow the LDR (Auto is ON when the ESP32 starts;
              switching SL or BL by hand turns Auto off, AUTO:1 turns it back on).
              AUTO:1 also re-learns the room's light level, so send it with the LDR uncovered.
    THR:0       automatic light threshold: adjusts itself to the room (default)
    THR:<1-4095> fixed threshold: lights on below it, off above it
    ALL:0   everything off                  GET     send status now
    SCENE:day|night|eco|show
    SHOW:0  stop the show (the city returns to how it was before the show)

  SHOW: a stage light show that runs on the ESP32 itself (no Bluetooth latency): 128 BPM,
  a new step every half beat (~234 ms), one bar per variation, through 1 lakh (100,000) different
  light variations (about 52 hours), looping until stopped.

  1 LAKH VARIATIONS: the 1000 patterns below, each played with the lights in any of 24 colour
  orders, forwards or backwards, and starting from any of its 8 steps. The ESP32 works each one out
  as it goes (a table of 100,000 would not fit in its memory) and skips any variation that looks the
  same as an earlier one, so all 100,000 are different. Variations 1-1000 are the patterns as written.
  The wind turbines spin for the whole show. Any other command ends it and restores the city first.

  PARTY MODE (the phone plays the 1-minute song; the ESP32 gets the same notes and the lights
  follow the tune: every note the phone plays moves the lights one step on through the variation,
  each note ends with a short blink like the sound does, a rest is dark, and every bar of the song
  gets the next of the 1 lakh variations; each party continues where the last one ended):
    MB:<60-180>       start a new song at this tempo (beats per minute)
    MA:<notes>        add up to 15 notes, 4 hex digits each: 2 = MIDI note
                      (00 = rest), 2 = length in 16th notes. e.g. MA:3C044004
    MP:1 / MP:0       start / stop the party (the city returns to how it was)

  STATUS (sent about once a second, after every command and whenever Auto switches the lights):
    ST:SL=1,BL=0,GR=1,RD=0,WT=1,AUTO=1,MU=0,SH=0,DK=0;LDR=2400,THR=0,LON=1440
    MU=1 while the party song is playing, SH=1 while the show is running,
    DK=1 when the LDR sees dark, LDR = light reading (0 = dark ... 4095 = bright),
    THR = threshold setting (0 = automatic), LON = the lights come on below this reading.

  LIGHT SENSOR (circuit diagram page 4): 3V3 -> LDR -> GPIO32, and GPIO32 -> resistor -> GND.
  More light = higher reading. Automatic threshold: the ESP32 learns the room's normal light
  level (the middle value of the last 2 minutes, so a finger or a torch for under a minute doesn't
  change it), turns the lights on when the reading drops below 70% of it (cover the LDR with a
  finger, or the room goes dark) and off again above 80% of it (uncover it, or shine a light on it).
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

// ---------- State ----------
enum : uint8_t { B_SL = 1, B_BL = 2, B_GR = 4, B_RD = 8, B_WT = 16 };
uint8_t state = 0;
bool autoMode = true;      // street + building lights follow the LDR from power-up
int thrManual = 0;         // 0 = automatic threshold, 1..4095 = fixed threshold (THR command)
int lastLdr = 0;
const uint8_t REF_N = 60;  // room light level: the last 60 readings, one every 2 seconds
int refBuf[REF_N];
bool refReady = false;
uint8_t refPos = 0;
uint32_t refT = 0;
int ldrRef = 0;            // the room's normal light level (median of refBuf)
bool ldrDark = false;      // what the LDR sees right now, with hysteresis
int lightsOnBelow = 0, lightsOffAbove = 0;

// ---------- Party mode (lights to the beat of the song the phone plays) ----------
const uint16_t MAX_NOTES = 400;
uint8_t songNote[MAX_NOTES];   // MIDI note number, 0 = rest
uint8_t songLen[MAX_NOTES];    // length in 16th notes
uint16_t songCount = 0;
uint16_t songBpm = 120;
bool partyOn = false;
uint16_t partyIdx = 0;
uint32_t partyNoteT = 0, partyNoteMs = 0, partySix = 0, partyNoteSix = 0, partyBar = 0;
uint8_t partyHit = 0;          // notes played so far in this bar (the step in its variation)
bool partyGap = false;         // in the short blink at the end of a note
uint8_t partySaved = 0;
bool partySavedAuto = false;

// ---------- Light patterns for the Show and Party Mode ----------
// 1000 different patterns of one bar each (8 half-beat steps), the base of the 1 lakh variations.
// Values are light bits: 1 = white street lights, 2 = yellow building lights, 4 = green, 8 = red
// (15 = all four, 0 = dark). The website's demo mode uses the same table and variations
// (src/lib/show.ts), and a test checks the two are identical.
const uint16_t SHOW_BPM = 128;
const uint32_t SHOW_STEP_MS = 60000UL / SHOW_BPM / 2;   // half a beat: ~234 ms
const uint8_t PATTERN_STEPS = 8;
const uint8_t SHOW_STEPS[] = {
   1,  2,  4,  8,  1,  2,  4,  8,   //    1 chase WYGR
   1,  2,  4,  8,  4,  2,  1,  2,   //    2 bounce WYGR
  15,  0, 15,  0, 15,  0, 15,  0,   //    3 strobe
   1,  3,  7, 15, 15,  0, 15,  0,   //    4 fill WYGR
   3, 12,  3, 12,  3, 12,  3, 12,   //    5 pairs 3/12
   1,  3,  6, 12,  8, 12,  6,  3,   //    6 wave WYGR
   8,  0,  8,  0,  1,  0,  1,  0,   //    7 police red/white
   3,  6, 12,  9,  3,  6, 12,  9,   //    8 double chase WYGR
   1,  0,  1,  0,  1,  0,  1,  0,   //    9 W strobe
  15, 14, 12,  8,  0,  8,  0, 15,   //   10 drain WYGR
   3,  0,  3,  0,  3,  0,  3,  0,   //   11 pair strobe 3
   1,  3,  7, 15,  7,  3,  1,  0,   //   12 rise and fall WYGR
   1,  0,  1,  0,  0,  0,  0,  0,   //   13 heartbeat 1
   1,  0,  2,  0,  4,  0,  8,  0,   //   14 spaced chase WYGR
   3, 14,  5, 15,  9,  6,  6,  8,   //   15 sparkle 1
   1,  2,  3,  4,  5,  6,  7,  8,   //   16 count up
   9,  6, 15,  0,  9,  6, 15,  0,   //   17 converge
   1,  2,  8,  4,  1,  2,  8,  4,   //   18 chase WYRG
   1,  2,  8,  4,  8,  2,  1,  2,   //   19 bounce WYRG
  15, 15,  0,  0, 15, 15,  0,  0,   //   20 double hit
   1,  3, 11, 15, 15,  0, 15,  0,   //   21 fill WYRG
   5, 10,  5, 10,  5, 10,  5, 10,   //   22 pairs 5/10
   1,  3, 10, 12,  4, 12, 10,  3,   //   23 wave WYRG
   8,  1,  8,  1,  8,  1,  8,  1,   //   24 police swap
   3, 10, 12,  5,  3, 10, 12,  5,   //   25 double chase WYRG
   1, 14,  1, 14,  1, 14,  1, 14,   //   26 W against the rest
  15, 14, 12,  4,  0,  4,  0, 15,   //   27 drain WYRG
   5,  0,  5,  0,  5,  0,  5,  0,   //   28 pair strobe 5
   1,  3, 11, 15, 11,  3,  1,  0,   //   29 rise and fall WYRG
   2,  0,  2,  0,  0,  0,  0,  0,   //   30 heartbeat 2
   1,  0,  2,  0,  8,  0,  4,  0,   //   31 spaced chase WYRG
   5,  5,  2,  4, 15,  7,  6, 10,   //   32 sparkle 2
   9, 10, 11, 12, 13, 14, 15,  0,   //   33 count high
   6,  9, 15,  0,  6,  9, 15,  0,   //   34 expand
   1,  4,  2,  8,  1,  4,  2,  8,   //   35 chase WGYR
   1,  4,  2,  8,  2,  4,  1,  4,   //   36 bounce WGYR
  15,  0,  0,  0, 15,  0,  0,  0,   //   37 downbeat
   1,  5,  7, 15, 15,  0, 15,  0,   //   38 fill WGYR
   9,  6,  9,  6,  9,  6,  9,  6,   //   39 pairs 9/6
   1,  5,  6, 10,  8, 10,  6,  5,   //   40 wave WGYR
  10,  0,  5,  0, 10,  0,  5,  0,   //   41 police cross
   5,  6, 10,  9,  5,  6, 10,  9,   //   42 double chase WGYR
   2,  0,  2,  0,  2,  0,  2,  0,   //   43 Y strobe
  15, 14, 10,  8,  0,  8,  0, 15,   //   44 drain WGYR
   9,  0,  9,  0,  9,  0,  9,  0,   //   45 pair strobe 9
   1,  5,  7, 15,  7,  5,  1,  0,   //   46 rise and fall WGYR
   4,  0,  4,  0,  0,  0,  0,  0,   //   47 heartbeat 4
   1,  0,  4,  0,  2,  0,  8,  0,   //   48 spaced chase WGYR
   8,  2, 14,  1,  5, 10, 10, 10,   //   49 sparkle 3
   9,  9,  6,  6, 15, 15,  0,  0,   //   50 outer inner hold
   1,  4,  8,  2,  1,  4,  8,  2,   //   51 chase WGRY
   1,  4,  8,  2,  8,  4,  1,  4,   //   52 bounce WGRY
  15,  0, 15,  0, 15, 15, 15,  0,   //   53 triplet tail
   1,  5, 13, 15, 15,  0, 15,  0,   //   54 fill WGRY
   3,  0, 12,  0,  3,  0, 12,  0,   //   55 pairs gap 3/12
   1,  5, 12, 10,  2, 10, 12,  5,   //   56 wave WGRY
   8,  8,  1,  1,  8,  8,  1,  1,   //   57 police hold
   5, 12, 10,  3,  5, 12, 10,  3,   //   58 double chase WGRY
   2, 13,  2, 13,  2, 13,  2, 13,   //   59 Y against the rest
  15, 14, 10,  2,  0,  2,  0, 15,   //   60 drain WGRY
   6,  0,  6,  0,  6,  0,  6,  0,   //   61 pair strobe 6
   1,  5, 13, 15, 13,  5,  1,  0,   //   62 rise and fall WGRY
   8,  0,  8,  0,  0,  0,  0,  0,   //   63 heartbeat 8
   1,  0,  4,  0,  8,  0,  2,  0,   //   64 spaced chase WGRY
  11, 13,  2, 13, 14, 15, 12,  3,   //   65 sparkle 4
   1,  8,  2,  4,  1,  8,  2,  4,   //   66 chase WRYG
   1,  8,  2,  4,  2,  8,  1,  8,   //   67 bounce WRYG
  15,  0,  0, 15,  0,  0, 15,  0,   //   68 syncopated
   1,  9, 11, 15, 15,  0, 15,  0,   //   69 fill WRYG
   5,  0, 10,  0,  5,  0, 10,  0,   //   70 pairs gap 5/10
   1,  9, 10,  6,  4,  6, 10,  9,   //   71 wave WRYG
   2,  0,  2,  0,  4,  0,  4,  0,   //   72 amber/green
   9, 10,  6,  5,  9, 10,  6,  5,   //   73 double chase WRYG
   4,  0,  4,  0,  4,  0,  4,  0,   //   74 G strobe
  15, 14,  6,  4,  0,  4,  0, 15,   //   75 drain WRYG
  10,  0, 10,  0, 10,  0, 10,  0,   //   76 pair strobe 10
   1,  9, 11, 15, 11,  9,  1,  0,   //   77 rise and fall WRYG
  15,  0, 15,  0,  0,  0,  0,  0,   //   78 heartbeat 15
   1,  0,  8,  0,  2,  0,  4,  0,   //   79 spaced chase WRYG
  11,  9,  4, 15,  7,  6,  5, 10,   //   80 sparkle 5
   1,  8,  4,  2,  1,  8,  4,  2,   //   81 chase WRGY
   1,  8,  4,  2,  4,  8,  1,  8,   //   82 bounce WRGY
  15, 15, 15,  0, 15,  0, 15,  0,   //   83 gallop
   1,  9, 13, 15, 15,  0, 15,  0,   //   84 fill WRGY
   9,  0,  6,  0,  9,  0,  6,  0,   //   85 pairs gap 9/6
   1,  9, 12,  6,  2,  6, 12,  9,   //   86 wave WRGY
   2,  4,  2,  4,  8,  1,  8,  1,   //   87 four-colour flash
   9, 12,  6,  3,  9, 12,  6,  3,   //   88 double chase WRGY
   4, 11,  4, 11,  4, 11,  4, 11,   //   89 G against the rest
  15, 14,  6,  2,  0,  2,  0, 15,   //   90 drain WRGY
  12,  0, 12,  0, 12,  0, 12,  0,   //   91 pair strobe 12
   1,  9, 13, 15, 13,  9,  1,  0,   //   92 rise and fall WRGY
   1,  0,  8,  0,  4,  0,  2,  0,   //   93 spaced chase WRGY
   3,  6, 15, 15, 13,  5,  2,  2,   //   94 sparkle 6
   0, 15,  0, 15, 15,  0, 15, 15,   //   95 offbeat
   3,  3, 12, 12,  3,  3, 12, 12,   //   96 pairs hold 3/12
   8,  0,  8,  0,  8,  0,  8,  0,   //   97 R strobe
  15,  8,  2,  4, 11,  2, 10,  7,   //   98 sparkle 7
  15,  0, 15, 15,  0, 15,  0,  0,   //   99 skip
   5,  5, 10, 10,  5,  5, 10, 10,   //  100 pairs hold 5/10
   5,  0,  0,  5,  0,  0,  5,  0,   //  101 beat 3 WG
   9,  0,  0,  0,  0,  0,  2,  9,   //  102 call 18 WR/Y
   1,  2,  8,  4,  4,  8,  2,  1,   //  103 pingpong WYRG
   1,  8, 14,  5,  5, 14,  8,  1,   //  104 mirror 1
   0,  9, 12,  3,  1, 10,  5,  1,   //  105 sparkle 11
   5,  0,  5,  5,  5,  0,  5,  0,   //  106 beat 16 WG
   0,  1,  0,  6,  0,  1,  0,  6,   //  107 call 2 W/YG
   1, 15,  8, 15,  2, 15,  4, 15,   //  108 flash chase WRYG
   6,  6, 14, 12, 12, 14,  6,  6,   //  109 mirror 2
   0,  6,  2,  8, 11, 13,  8,  1,   //  110 sparkle 12
  12,  0,  0,  0, 12,  0, 12,  0,   //  111 beat 8 GR
   9,  0,  0,  2,  9,  0,  0,  2,   //  112 call 11 WR/Y
  11, 13, 14,  7, 11, 13, 14,  7,   //  113 dark chase GYWR
   7, 10, 13,  8,  8, 13, 10,  7,   //  114 mirror 3
   4, 14,  5, 13,  2,  6,  3,  0,   //  115 sparkle 13
   4,  4,  0,  4,  0,  4,  4,  0,   //  116 beat 15 G
   9,  2,  0,  9,  0,  2,  9,  0,   //  117 call 15 WR/Y
   1,  4,  1,  4,  8,  2,  8,  2,   //  118 half chase WGRY
  13,  7,  8,  2,  2,  8,  7, 13,   //  119 mirror 4
  12,  5, 14, 10, 13,  2,  0,  3,   //  120 sparkle 14
  15,  0, 15, 15,  0, 15, 15,  0,   //  121 beat 6 WYGR
   2,  0, 12,  0,  2, 12,  2, 12,   //  122 call 14 Y/GR
   8,  2,  8,  2,  1,  4,  1,  4,   //  123 half chase RYWG
   8,  8,  6,  8,  8,  6,  8,  8,   //  124 mirror 5
  10,  6,  9, 14,  8,  6,  4,  0,   //  125 sparkle 15
   6,  0,  6,  6,  6,  0,  6,  0,   //  126 beat 16 YG
   3,  0,  4,  0,  3,  0,  4,  0,   //  127 call 1 WY/G
   8,  1,  8,  1,  2,  4,  2,  4,   //  128 half chase RWYG
  14,  3, 13,  1,  1, 13,  3, 14,   //  129 mirror 6
   2, 13,  2, 11,  2,  0,  5,  8,   //  130 sparkle 16
   6,  0,  0,  0,  0,  0,  6,  6,   //  131 beat 18 YG
   2,  0,  9,  0,  2,  9,  2,  9,   //  132 call 14 Y/WR
   2,  0,  2,  1,  0,  1,  8,  4,   //  133 echo YWRG
   7,  9,  8, 12, 12,  8,  9,  7,   //  134 mirror 7
  10,  0, 15, 11, 12,  6,  5, 12,   //  135 sparkle 17
   1,  1,  0,  0,  1,  1,  0,  0,   //  136 beat 10 W
   1,  8,  0,  1,  8,  0,  1,  0,   //  137 call 5 W/R
   8,  4,  2,  1,  1,  2,  4,  8,   //  138 pingpong RGYW
   9,  5,  7, 13, 13,  7,  5,  9,   //  139 mirror 8
   0, 12,  2, 14,  8,  8,  3,  2,   //  140 sparkle 18
   2,  2,  0,  2,  0,  2,  2,  0,   //  141 beat 15 Y
   8,  0,  1,  8,  1,  0,  8,  0,   //  142 call 16 R/W
  11, 13,  7, 14, 11, 13,  7, 14,   //  143 dark chase GYRW
  14, 10,  3,  7,  7,  3, 10, 14,   //  144 mirror 9
  10,  7,  5,  0,  7,  7,  2, 14,   //  145 sparkle 19
   4,  0,  0,  4,  0,  0,  4,  4,   //  146 beat 4 G
   0,  0,  0,  0,  4,  2,  4,  2,   //  147 call 13 G/Y
   8,  8,  1,  1,  2,  2,  4,  4,   //  148 double step RWYG
  11,  6,  2,  5,  5,  2,  6, 11,   //  149 mirror 10
   0, 14, 15, 11, 11, 12, 12,  6,   //  150 sparkle 20
  11,  0, 11, 11, 11,  0, 11,  0,   //  151 beat 16 WYR
   3,  0,  4,  3,  0,  4,  3,  0,   //  152 call 6 WY/G
  12,  6,  3,  9, 12,  6,  3,  9,   //  153 pair walk RGYW
  11, 13, 11, 12, 12, 11, 13, 11,   //  154 mirror 11
   3,  9,  9,  5,  5,  0,  2,  7,   //  155 sparkle 21
  14,  0,  0, 14,  0,  0, 14,  0,   //  156 beat 3 YGR
   6,  0,  0,  8,  6,  0,  0,  8,   //  157 call 11 YG/R
   1,  1,  4,  4,  8,  8,  2,  2,   //  158 double step WGRY
   8,  6, 14,  4,  4, 14,  6,  8,   //  159 mirror 12
  12,  0, 11,  5, 14, 11,  5,  2,   //  160 sparkle 22
   3,  0,  3,  3,  3,  0,  3,  0,   //  161 beat 16 WY
   8,  5,  8,  0,  5,  8,  5,  0,   //  162 call 7 R/WG
   2,  1,  4,  8,  8,  4,  1,  2,   //  163 pingpong YWGR
   2, 10,  5, 13, 13,  5, 10,  2,   //  164 mirror 13
   5,  7, 12, 13,  0, 14,  7,  7,   //  165 sparkle 23
  13,  0,  0, 13,  0,  0, 13,  0,   //  166 beat 3 WGR
   0,  9,  0,  2,  0,  9,  0,  2,   //  167 call 2 WR/Y
   8,  2,  4,  1,  1,  4,  2,  8,   //  168 pingpong RYGW
   5,  8,  7, 14, 14,  7,  8,  5,   //  169 mirror 14
   5, 11,  0, 14,  6,  6, 15,  9,   //  170 sparkle 24
   7,  7,  0,  7,  0,  7,  7,  0,   //  171 beat 15 WYG
   2,  1,  2,  1,  0,  0,  0,  0,   //  172 call 12 Y/W
   1,  1,  8,  8,  4,  4,  2,  2,   //  173 double step WRGY
  11, 15, 14,  5,  5, 14, 15, 11,   //  174 mirror 15
   5,  5,  0, 13,  1, 13,  9, 10,   //  175 sparkle 25
   8,  0,  0,  0,  0,  0,  8,  8,   //  176 beat 18 R
   4,  0,  1,  4,  0,  1,  4,  0,   //  177 call 6 G/W
   2,  2,  1,  1,  8,  8,  4,  4,   //  178 double step YWRG
   8,  3, 13, 14, 14, 13,  3,  8,   //  179 mirror 16
   5, 11,  6,  8,  2,  0, 12,  3,   //  180 sparkle 26
   3,  0,  0,  0,  3,  0,  3,  0,   //  181 beat 8 WY
   0,  8,  1,  0,  0,  8,  1,  0,   //  182 call 17 R/W
   4, 15,  8, 15,  2, 15,  1, 15,   //  183 flash chase GRYW
   5,  7, 13,  4,  4, 13,  7,  5,   //  184 mirror 17
  12, 10,  5, 15,  2,  4,  0,  5,   //  185 sparkle 27
  15, 15, 15, 15,  0,  0,  0,  0,   //  186 beat 12 WYGR
   1,  0, 12,  0,  1,  0, 12,  0,   //  187 call 1 W/GR
   1,  9, 11, 15, 14,  6,  4,  0,   //  188 stack WRYG
  14,  5,  4,  3,  3,  4,  5, 14,   //  189 mirror 18
  10,  8,  3,  6, 15,  2,  6,  0,   //  190 sparkle 28
   6,  0,  6,  0,  6,  0,  0,  6,   //  191 beat 20 YG
   0,  0,  0,  0,  9,  6,  9,  6,   //  192 call 13 WR/YG
   7, 13, 11, 14,  7, 13, 11, 14,   //  193 dark chase RYGW
   9,  8, 11,  9,  9, 11,  8,  9,   //  194 mirror 19
   2,  8,  0,  2,  5, 14,  9,  6,   //  195 sparkle 29
   0,  0,  0,  0,  5,  5,  5,  5,   //  196 beat 13 WG
   8,  0,  2,  0,  8,  0,  0,  2,   //  197 call 20 R/Y
  13, 11,  7, 14, 13, 11,  7, 14,   //  198 dark chase YGRW
  11, 10,  5,  2,  2,  5, 10, 11,   //  199 mirror 20
   7,  8,  6,  1,  0,  8,  5, 15,   //  200 sparkle 30
   0,  0,  0,  0,  4,  4,  4,  4,   //  201 beat 13 G
   0,  0,  0,  0,  2,  5,  2,  5,   //  202 call 13 Y/WG
   2,  4,  1,  8,  8,  1,  4,  2,   //  203 pingpong YGWR
   2,  6,  7, 13, 13,  7,  6,  2,   //  204 mirror 21
   0,  1, 14, 15,  6,  6,  8, 15,   //  205 sparkle 31
   8,  8,  0,  0,  8,  8,  0,  0,   //  206 beat 10 R
  10,  1,  0, 10,  0,  1, 10,  0,   //  207 call 15 YR/W
   8,  8,  1,  1,  4,  4,  2,  2,   //  208 double step RWGY
  11,  1,  7,  8,  8,  7,  1, 11,   //  209 mirror 22
   5, 15,  5,  4,  9,  7,  0,  6,   //  210 sparkle 32
   0, 11, 11,  0,  0, 11, 11,  0,   //  211 beat 17 WYR
  10,  0,  5,  0, 10,  5, 10,  5,   //  212 call 14 YR/WG
   2,  1,  2,  1,  4,  8,  4,  8,   //  213 half chase YWGR
  10, 13,  4,  9,  9,  4, 13, 10,   //  214 mirror 23
   7,  9,  5, 15,  7,  0, 10,  8,   //  215 sparkle 33
   9,  9,  0,  9,  9,  0,  9,  0,   //  216 beat 5 WR
   0,  9,  6,  0,  0,  9,  6,  0,   //  217 call 17 WR/YG
   8, 10, 14, 15,  7,  5,  1,  0,   //  218 stack RYGW
  15,  1,  3,  3,  3,  3,  1, 15,   //  219 mirror 24
  11,  3,  5,  0,  2,  9,  9, 15,   //  220 sparkle 34
  10, 10, 10, 10,  0,  0,  0,  0,   //  221 beat 12 YR
  10,  1, 10,  0,  1, 10,  1,  0,   //  222 call 7 YR/W
   7, 11, 13, 14,  7, 11, 13, 14,   //  223 dark chase RGYW
   1, 14, 12,  7,  7, 12, 14,  1,   //  224 mirror 25
   7, 14, 13,  5, 10,  0, 13, 14,   //  225 sparkle 35
   7,  0,  7,  0,  7,  0,  0,  7,   //  226 beat 20 WYG
   1,  4,  1,  0,  4,  1,  4,  0,   //  227 call 7 W/G
   1,  8,  1,  8,  2,  4,  2,  4,   //  228 half chase WRYG
  12,  3,  9,  1,  1,  9,  3, 12,   //  229 mirror 26
   5,  1,  0,  8,  8,  8, 11,  8,   //  230 sparkle 36
  12,  0,  0, 12,  0,  0, 12,  0,   //  231 beat 3 GR
   4,  2,  0,  4,  0,  2,  4,  0,   //  232 call 15 G/Y
   2,  2,  4,  4,  1,  1,  8,  8,   //  233 double step YGWR
  13,  3, 11,  4,  4, 11,  3, 13,   //  234 mirror 27
   4,  1,  5,  9, 13,  5,  7,  0,   //  235 sparkle 37
  14,  0,  0,  0, 14,  0, 14,  0,   //  236 beat 8 YGR
  10,  5,  0, 10,  0,  5, 10,  0,   //  237 call 15 YR/WG
   8, 15,  4, 15,  1, 15,  2, 15,   //  238 flash chase RGWY
  15, 13,  7,  2,  2,  7, 13, 15,   //  239 mirror 28
   0,  1,  9,  8,  1,  9, 15, 15,   //  240 sparkle 38
  15, 15,  0, 15,  0, 15, 15,  0,   //  241 beat 15 WYGR
   3,  4,  0,  3,  0,  4,  3,  0,   //  242 call 15 WY/G
   2, 15,  4, 15,  8, 15,  1, 15,   //  243 flash chase YGRW
  11, 11, 12,  5,  5, 12, 11, 11,   //  244 mirror 29
   0, 12,  6,  9,  4,  3, 10, 12,   //  245 sparkle 39
   3,  0,  0,  3,  0,  0,  3,  3,   //  246 beat 4 WY
   1,  6,  0,  1,  0,  6,  1,  0,   //  247 call 15 W/YG
   1,  8,  1,  8,  4,  2,  4,  2,   //  248 half chase WRGY
   7, 13, 12,  9,  9, 12, 13,  7,   //  249 mirror 30
   0, 12, 12,  4, 15, 15, 12, 12,   //  250 sparkle 40
   7,  7,  7,  0,  7,  7,  7,  0,   //  251 beat 7 WYG
   6,  9,  0,  6,  9,  0,  6,  0,   //  252 call 5 YG/WR
   8,  9, 13, 15,  7,  6,  2,  0,   //  253 stack RWGY
   9,  6,  2,  4,  4,  2,  6,  9,   //  254 mirror 31
   0, 15, 15,  3,  4, 13, 10,  1,   //  255 sparkle 41
   2,  0,  2,  0,  0,  0,  2,  0,   //  256 beat 9 Y
  12,  2,  0, 12,  2,  0, 12,  0,   //  257 call 5 GR/Y
  14, 11, 13,  7, 14, 11, 13,  7,   //  258 dark chase WGYR
   1,  8, 12,  2,  2, 12,  8,  1,   //  259 mirror 32
  14,  0,  3, 12, 10,  7,  2,  5,   //  260 sparkle 42
  14, 14, 14,  0,  0, 14,  0,  0,   //  261 beat 19 YGR
   2,  5,  0,  2,  0,  5,  2,  0,   //  262 call 15 Y/WG
   4,  2,  8,  1,  1,  8,  2,  4,   //  263 pingpong GYRW
   4, 13,  3,  1,  1,  3, 13,  4,   //  264 mirror 33
   0, 15, 14, 15,  4, 10,  8, 10,   //  265 sparkle 43
  15, 15, 15,  0, 15, 15, 15,  0,   //  266 beat 7 WYGR
   4,  0,  0,  9,  0,  0,  4,  0,   //  267 call 3 G/WR
   1,  0,  1,  4,  0,  4,  8,  2,   //  268 echo WGRY
  14, 14,  5,  5,  5,  5, 14, 14,   //  269 mirror 34
  15, 10, 11,  0,  6,  4,  4,  7,   //  270 sparkle 44
   5,  5,  5,  0,  0,  5,  0,  0,   //  271 beat 19 WG
   2,  8,  0,  2,  8,  0,  2,  0,   //  272 call 5 Y/R
   7, 14, 11, 13,  7, 14, 11, 13,   //  273 dark chase RWGY
   5,  9, 13, 14, 14, 13,  9,  5,   //  274 mirror 35
  12, 15,  8,  4,  2,  2,  6,  0,   //  275 sparkle 45
   7,  0,  7,  7,  0,  7,  7,  0,   //  276 beat 6 WYG
   1,  6,  0,  0,  1,  6,  0,  0,   //  277 call 10 W/YG
   1,  2,  4,  8,  8,  4,  2,  1,   //  278 pingpong WYGR
   2,  9,  7, 15, 15,  7,  9,  2,   //  279 mirror 36
   5,  8,  7,  3, 14,  0, 14,  4,   //  280 sparkle 46
   1,  0,  1,  1,  1,  0,  1,  0,   //  281 beat 16 W
   8,  0,  4,  0,  8,  0,  4,  0,   //  282 call 1 R/G
   4,  8,  2,  1,  1,  2,  8,  4,   //  283 pingpong GRYW
  10,  5, 10,  5,  5, 10,  5, 10,   //  284 mirror 37
  12, 14, 13,  0,  8,  4, 12,  9,   //  285 sparkle 47
   0,  9,  9,  0,  0,  9,  9,  0,   //  286 beat 17 WR
   9,  0,  2,  0,  9,  0,  0,  2,   //  287 call 20 WR/Y
  11, 14, 13,  7, 11, 14, 13,  7,   //  288 dark chase GWYR
   3,  1,  6,  4,  4,  6,  1,  3,   //  289 mirror 38
   8, 11,  7,  5,  3,  0, 10, 15,   //  290 sparkle 48
  11,  0, 11,  0, 11, 11, 11, 11,   //  291 beat 14 WYR
   0,  0,  0,  0,  1,  4,  1,  4,   //  292 call 13 W/G
  14,  7, 13, 11, 14,  7, 13, 11,   //  293 dark chase WRYG
  15,  4,  8,  8,  8,  8,  4, 15,   //  294 mirror 39
   5,  6, 13, 12,  0,  5, 11, 15,   //  295 sparkle 49
  12, 12,  0, 12,  0, 12, 12,  0,   //  296 beat 15 GR
   9,  0,  0,  4,  0,  0,  9,  0,   //  297 call 3 WR/G
   2,  2,  1,  1,  4,  4,  8,  8,   //  298 double step YWGR
   4, 13,  9,  8,  8,  9, 13,  4,   //  299 mirror 40
  10, 13, 15, 14,  6, 11,  1,  0,   //  300 sparkle 50
   2,  0,  0,  2,  2,  0,  0,  2,   //  301 beat 11 Y
   0,  0,  0,  0,  2,  1,  2,  1,   //  302 call 13 Y/W
   4,  0,  4,  2,  0,  2,  8,  1,   //  303 echo GYRW
  10,  7,  2,  4,  4,  2,  7, 10,   //  304 mirror 41
  11, 11,  9,  0,  6,  8,  5,  2,   //  305 sparkle 51
   7,  7,  7,  7,  0,  0,  0,  0,   //  306 beat 12 WYG
   9,  4,  9,  0,  0,  4,  0,  0,   //  307 call 19 WR/G
   2, 15,  4, 15,  1, 15,  8, 15,   //  308 flash chase YGWR
   2,  9, 10,  7,  7, 10,  9,  2,   //  309 mirror 42
  15,  1,  1, 13,  0,  2,  1, 11,   //  310 sparkle 52
   3,  0,  3,  0,  3,  3,  3,  3,   //  311 beat 14 WY
   2,  0,  5,  0,  2,  5,  2,  5,   //  312 call 14 Y/WG
   8,  2,  8,  2,  4,  1,  4,  1,   //  313 half chase RYGW
   6, 12,  1,  1,  1,  1, 12,  6,   //  314 mirror 43
  12,  3,  0,  5,  5, 15, 10,  7,   //  315 sparkle 53
  14,  0,  0, 14,  0,  0, 14, 14,   //  316 beat 4 YGR
   2,  0,  0,  4,  0,  0,  2,  4,   //  317 call 4 Y/G
   1,  9, 13, 15, 14,  6,  2,  0,   //  318 stack WRGY
   1,  1,  5,  1,  1,  5,  1,  1,   //  319 mirror 44
  15,  2,  4,  9, 12,  2, 10,  0,   //  320 sparkle 54
   2,  0,  0,  0,  0,  0,  2,  2,   //  321 beat 18 Y
   4,  0,  8,  0,  0,  0,  4,  0,   //  322 call 9 G/R
  13,  7, 14, 11, 13,  7, 14, 11,   //  323 dark chase YRWG
  10, 15,  9,  1,  1,  9, 15, 10,   //  324 mirror 45
  15, 12,  8,  2, 13,  6,  4,  0,   //  325 sparkle 55
  14, 14,  0,  0, 14, 14,  0,  0,   //  326 beat 10 YGR
  10,  5,  0,  0, 10,  5,  0,  0,   //  327 call 10 YR/WG
   1, 15,  4, 15,  2, 15,  8, 15,   //  328 flash chase WGYR
  10,  5, 12,  3,  3, 12,  5, 10,   //  329 mirror 46
   2,  0,  7,  7,  4,  4,  3,  8,   //  330 sparkle 56
   4,  0,  4,  0,  4,  0,  0,  4,   //  331 beat 20 G
   8,  5,  0,  8,  0,  5,  8,  0,   //  332 call 15 R/WG
   8,  0,  8,  4,  0,  4,  2,  1,   //  333 echo RGYW
  10, 10,  5, 11, 11,  5, 10, 10,   //  334 mirror 47
   7,  8, 13,  0,  7,  2, 12,  7,   //  335 sparkle 57
   2,  2,  0,  2,  2,  0,  2,  0,   //  336 beat 5 Y
   0, 10,  0,  4,  0, 10,  0,  4,   //  337 call 2 YR/G
   8,  8,  4,  4,  2,  2,  1,  1,   //  338 double step RGYW
  10, 11,  3, 14, 14,  3, 11, 10,   //  339 mirror 48
   8,  7, 11, 12, 10,  4, 14,  0,   //  340 sparkle 58
   0, 15,  0, 15,  0, 15,  0, 15,   //  341 beat 2 WYGR
  10,  0,  5,  0, 10,  0,  0,  5,   //  342 call 20 YR/WG
  10,  3,  5, 12, 10,  3,  5, 12,   //  343 pair walk RYWG
   9,  1,  7,  3,  3,  7,  1,  9,   //  344 mirror 49
   5,  4, 11,  2, 14,  0, 15,  7,   //  345 sparkle 59
   1,  0,  1,  0,  1,  1,  1,  1,   //  346 beat 14 W
   3,  4,  0,  0,  3,  4,  0,  0,   //  347 call 10 WY/G
   2,  1,  8,  4,  4,  8,  1,  2,   //  348 pingpong YWRG
   6, 14, 15, 14, 14, 15, 14,  6,   //  349 mirror 50
  10,  6,  0, 10,  2, 10,  2, 13,   //  350 sparkle 60
   9,  0,  0,  9,  0,  0,  9,  9,   //  351 beat 4 WR
   2,  1,  2,  0,  1,  2,  1,  0,   //  352 call 7 Y/W
   2,  4,  2,  4,  1,  8,  1,  8,   //  353 half chase YGWR
   3,  9, 11, 12, 12, 11,  9,  3,   //  354 mirror 51
  12,  0, 14,  2, 15,  8,  9,  9,   //  355 sparkle 61
   8,  0,  0,  8,  8,  0,  0,  8,   //  356 beat 11 R
   1,  0,  2,  1,  2,  0,  1,  0,   //  357 call 16 W/Y
   4,  2,  4,  2,  1,  8,  1,  8,   //  358 half chase GYWR
  14,  2, 11,  2,  2, 11,  2, 14,   //  359 mirror 52
  14,  1, 11, 13, 15,  0,  8, 11,   //  360 sparkle 62
   3,  0,  0,  3,  0,  0,  3,  0,   //  361 beat 3 WY
   1,  0,  0,  0, 12,  0,  1,  0,   //  362 call 8 W/GR
   2,  0,  2,  8,  0,  8,  1,  4,   //  363 echo YRWG
   5,  1,  2, 13, 13,  2,  1,  5,   //  364 mirror 53
  10, 13,  8,  0, 10, 13,  7,  9,   //  365 sparkle 63
   0,  0,  0,  0,  1,  1,  1,  1,   //  366 beat 13 W
   2,  0,  0,  0,  0,  0, 12,  2,   //  367 call 18 Y/GR
   8,  0,  8,  2,  0,  2,  1,  4,   //  368 echo RYWG
  13,  8, 14,  3,  3, 14,  8, 13,   //  369 mirror 54
  11, 12, 13, 11, 14, 12,  6,  0,   //  370 sparkle 64
   7,  7,  7,  0,  0,  7,  0,  0,   //  371 beat 19 WYG
   1,  8,  0,  1,  0,  8,  1,  0,   //  372 call 15 W/R
   8, 12, 14, 15,  7,  3,  1,  0,   //  373 stack RGYW
  11,  9,  5,  1,  1,  5,  9, 11,   //  374 mirror 55
  11,  2,  2,  5,  5,  0,  3,  2,   //  375 sparkle 65
  13,  0,  0, 13, 13,  0,  0, 13,   //  376 beat 11 WGR
   9,  0,  6,  9,  0,  6,  9,  0,   //  377 call 6 WR/YG
  10,  6,  5,  9, 10,  6,  5,  9,   //  378 pair walk RYGW
   2,  3, 10,  3,  3, 10,  3,  2,   //  379 mirror 56
  12,  0,  9,  7,  2,  5, 11,  5,   //  380 sparkle 66
  15,  0,  0, 15, 15,  0,  0, 15,   //  381 beat 11 WYGR
   1,  0,  0,  0,  0,  0,  6,  1,   //  382 call 18 W/YG
  11,  7, 14, 13, 11,  7, 14, 13,   //  383 dark chase GRWY
  10,  2,  8,  4,  4,  8,  2, 10,   //  384 mirror 57
   6, 11, 11, 14,  4,  0, 14,  5,   //  385 sparkle 67
   5,  0,  0,  0,  5,  0,  5,  0,   //  386 beat 8 WG
   9,  0,  0,  6,  0,  0,  9,  0,   //  387 call 3 WR/YG
   8, 15,  2, 15,  4, 15,  1, 15,   //  388 flash chase RYGW
  14, 15, 11,  1,  1, 11, 15, 14,   //  389 mirror 58
   9,  7, 12,  2,  8,  4,  2,  0,   //  390 sparkle 68
   4,  0,  4,  4,  4,  0,  4,  0,   //  391 beat 16 G
   8,  2,  8,  0,  2,  8,  2,  0,   //  392 call 7 R/Y
   8,  4,  8,  4,  2,  1,  2,  1,   //  393 half chase RGYW
  14,  6,  4, 10, 10,  4,  6, 14,   //  394 mirror 59
  10, 12,  2, 10, 14, 11, 15,  0,   //  395 sparkle 69
   0,  3,  0,  3,  0,  3,  0,  3,   //  396 beat 2 WY
   2,  4,  2,  4,  0,  0,  0,  0,   //  397 call 12 Y/G
   1,  4,  2,  8,  8,  2,  4,  1,   //  398 pingpong WGYR
   4, 11,  4,  9,  9,  4, 11,  4,   //  399 mirror 60
   7, 15, 15,  4,  0, 11,  6, 15,   //  400 sparkle 70
  10,  0,  0, 10,  0,  0, 10, 10,   //  401 beat 4 YR
   2,  4,  0,  2,  4,  0,  2,  0,   //  402 call 5 Y/G
   4, 15,  2, 15,  1, 15,  8, 15,   //  403 flash chase GYWR
  13,  9,  6,  1,  1,  6,  9, 13,   //  404 mirror 61
   2,  4,  9,  0, 14,  9,  7,  9,   //  405 sparkle 71
   3,  3,  0,  3,  3,  0,  3,  0,   //  406 beat 5 WY
   8,  0,  4,  0,  0,  0,  8,  0,   //  407 call 9 R/G
   1,  5, 13, 15, 14, 10,  2,  0,   //  408 stack WGRY
  14,  8, 10,  7,  7, 10,  8, 14,   //  409 mirror 62
   8,  5,  3, 13,  0,  6,  5,  3,   //  410 sparkle 72
  14,  0,  0,  0,  0,  0, 14, 14,   //  411 beat 18 YGR
   0,  2,  8,  0,  0,  2,  8,  0,   //  412 call 17 Y/R
   8,  8,  2,  2,  1,  1,  4,  4,   //  413 double step RYWG
  10,  9,  9,  6,  6,  9,  9, 10,   //  414 mirror 63
   1,  1,  1,  1,  5,  0,  7,  9,   //  415 sparkle 73
  12, 12, 12, 12,  0,  0,  0,  0,   //  416 beat 12 GR
   4,  0,  8,  4,  8,  0,  4,  0,   //  417 call 16 G/R
   1, 15,  8, 15,  4, 15,  2, 15,   //  418 flash chase WRGY
  15, 13,  8,  1,  1,  8, 13, 15,   //  419 mirror 64
  13, 11,  6, 13,  2, 11,  0,  6,   //  420 sparkle 74
   5,  0,  5,  0,  0,  0,  5,  0,   //  421 beat 9 WG
   9,  0,  0,  6,  0,  0,  9,  6,   //  422 call 4 WR/YG
  13, 11, 14,  7, 13, 11, 14,  7,   //  423 dark chase YGWR
  12,  8, 13, 15, 15, 13,  8, 12,   //  424 mirror 65
   4,  7,  5,  0,  8,  9,  2, 11,   //  425 sparkle 75
  11,  0, 11, 11,  0, 11, 11,  0,   //  426 beat 6 WYR
   5,  0,  8,  0,  5,  0,  8,  0,   //  427 call 1 WG/R
   2,  8,  1,  4,  4,  1,  8,  2,   //  428 pingpong YRWG
  10, 10,  2,  1,  1,  2, 10, 10,   //  429 mirror 66
   5,  0, 14,  1,  1,  3, 14,  5,   //  430 sparkle 76
  13, 13,  0, 13, 13,  0, 13,  0,   //  431 beat 5 WGR
   0,  1,  0,  8,  0,  1,  0,  8,   //  432 call 2 W/R
   4, 15,  1, 15,  2, 15,  8, 15,   //  433 flash chase GWYR
   9, 14,  5,  4,  4,  5, 14,  9,   //  434 mirror 67
   0,  8, 13,  5,  9, 14, 13, 14,   //  435 sparkle 77
   0, 15, 15,  0,  0, 15, 15,  0,   //  436 beat 17 WYGR
   2,  0, 12,  0,  2,  0, 12,  0,   //  437 call 1 Y/GR
   4,  1,  8,  2,  2,  8,  1,  4,   //  438 pingpong GWRY
  10, 15,  1,  8,  8,  1, 15, 10,   //  439 mirror 68
  12, 14,  6,  0,  9, 11, 14, 13,   //  440 sparkle 78
   6,  6,  6,  0,  0,  6,  0,  0,   //  441 beat 19 YG
   0, 10,  5,  0,  0, 10,  5,  0,   //  442 call 17 YR/WG
   1,  8,  2,  4,  4,  2,  8,  1,   //  443 pingpong WRYG
  12,  9,  5, 10, 10,  5,  9, 12,   //  444 mirror 69
  15, 10,  9,  3,  0,  6,  2,  4,   //  445 sparkle 79
   2,  0,  2,  2,  2,  0,  2,  0,   //  446 beat 16 Y
   2,  0,  8,  0,  2,  0,  0,  8,   //  447 call 20 Y/R
  14, 13,  7, 11, 14, 13,  7, 11,   //  448 dark chase WYRG
  11, 10, 11,  2,  2, 11, 10, 11,   //  449 mirror 70
  13,  3,  0,  9, 10,  4, 15, 12,   //  450 sparkle 80
   4,  0,  0,  4,  0,  0,  4,  0,   //  451 beat 3 G
   1,  0, 10,  0,  1,  0, 10,  0,   //  452 call 1 W/YR
  14, 11,  7, 13, 14, 11,  7, 13,   //  453 dark chase WGRY
  15,  2,  8, 10, 10,  8,  2, 15,   //  454 mirror 71
   6,  2,  4,  0, 10,  2,  6, 11,   //  455 sparkle 81
   9,  9,  9,  0,  0,  9,  0,  0,   //  456 beat 19 WR
   4,  9,  0,  4,  0,  9,  4,  0,   //  457 call 15 G/WR
   3,  9, 12,  6,  3,  9, 12,  6,   //  458 pair walk YWRG
   8, 11, 10, 12, 12, 10, 11,  8,   //  459 mirror 72
   4, 12,  3,  0,  4, 14, 12,  8,   //  460 sparkle 82
   6,  6,  6,  6,  0,  0,  0,  0,   //  461 beat 12 YG
   2, 12,  2,  0,  0, 12,  0,  0,   //  462 call 19 Y/GR
   1, 15,  4, 15,  8, 15,  2, 15,   //  463 flash chase WGRY
  12,  9, 13, 15, 15, 13,  9, 12,   //  464 mirror 73
  15,  9,  0,  6, 10,  7,  7,  7,   //  465 sparkle 83
   3,  0,  0,  0,  0,  0,  3,  3,   //  466 beat 18 WY
   4,  0,  0,  0,  0,  0,  9,  4,   //  467 call 18 G/WR
   8,  0,  8,  1,  0,  1,  2,  4,   //  468 echo RWYG
  12, 13,  4, 13, 13,  4, 13, 12,   //  469 mirror 74
  15,  0,  2, 12, 15,  7,  7,  5,   //  470 sparkle 84
   0,  1,  1,  0,  0,  1,  1,  0,   //  471 beat 17 W
   4,  0,  0,  9,  0,  0,  4,  9,   //  472 call 4 G/WR
   1,  1,  2,  2,  8,  8,  4,  4,   //  473 double step WYRG
   3,  5,  1, 10, 10,  1,  5,  3,   //  474 mirror 75
  14, 11,  4,  6,  3, 11,  0,  8,   //  475 sparkle 85
  13,  0,  0,  0,  0,  0, 13, 13,   //  476 beat 18 WGR
   0,  8,  4,  0,  0,  8,  4,  0,   //  477 call 17 R/G
   4,  1,  2,  8,  8,  2,  1,  4,   //  478 pingpong GWYR
  13,  3,  1, 13, 13,  1,  3, 13,   //  479 mirror 76
   3,  6,  4,  0,  5,  8, 14,  6,   //  480 sparkle 86
  11, 11, 11,  0, 11, 11, 11,  0,   //  481 beat 7 WYR
  10,  0,  5, 10,  5,  0, 10,  0,   //  482 call 16 YR/WG
   2,  6, 14, 15, 13,  9,  1,  0,   //  483 stack YGRW
   5, 15,  6, 14, 14,  6, 15,  5,   //  484 mirror 77
   3, 11, 14,  9, 13,  0, 15, 15,   //  485 sparkle 87
  12,  0, 12,  0, 12, 12, 12, 12,   //  486 beat 14 GR
   2,  0,  8,  2,  8,  0,  2,  0,   //  487 call 16 Y/R
   2, 10, 11, 15, 13,  5,  4,  0,   //  488 stack YRWG
   4,  8,  8, 13, 13,  8,  8,  4,   //  489 mirror 78
   5,  6, 13,  0, 13, 11, 12, 10,   //  490 sparkle 88
   5,  5,  0,  5,  0,  5,  5,  0,   //  491 beat 15 WG
   8,  0,  0,  3,  0,  0,  8,  0,   //  492 call 3 R/WY
   4,  1,  4,  1,  2,  8,  2,  8,   //  493 half chase GWYR
   8,  4, 12,  8,  8, 12,  4,  8,   //  494 mirror 79
   3,  3,  8, 15,  2,  0,  5,  8,   //  495 sparkle 89
  10,  0, 10,  0, 10, 10, 10, 10,   //  496 beat 14 YR
   5,  0,  2,  0,  5,  0,  0,  2,   //  497 call 20 WG/Y
   4,  4,  1,  1,  8,  8,  2,  2,   //  498 double step GWRY
   8, 14,  7, 10, 10,  7, 14,  8,   //  499 mirror 80
  15,  0, 15,  8,  9, 15,  5,  4,   //  500 sparkle 90
   6,  6,  0,  6,  0,  6,  6,  0,   //  501 beat 15 YG
   0,  6,  0,  1,  0,  6,  0,  1,   //  502 call 2 YG/W
   1,  0,  1,  2,  0,  2,  8,  4,   //  503 echo WYRG
  12,  2,  1, 10, 10,  1,  2, 12,   //  504 mirror 81
   0, 12,  1,  5,  2,  6,  9,  2,   //  505 sparkle 91
  15,  0, 15,  0,  0,  0, 15,  0,   //  506 beat 9 WYGR
   4,  9,  4,  0,  0,  9,  0,  0,   //  507 call 19 G/WR
   4, 15,  2, 15,  8, 15,  1, 15,   //  508 flash chase GYRW
  12, 12, 11,  1,  1, 11, 12, 12,   //  509 mirror 82
  10, 13, 13,  0,  1, 12,  3,  6,   //  510 sparkle 92
  12,  0,  0, 12, 12,  0,  0, 12,   //  511 beat 11 GR
   3,  4,  0,  3,  4,  0,  3,  0,   //  512 call 5 WY/G
   2,  4,  8,  1,  1,  8,  4,  2,   //  513 pingpong YGRW
   4, 11,  4,  2,  2,  4, 11,  4,   //  514 mirror 83
  13,  0,  8,  1,  5,  8,  9, 13,   //  515 sparkle 93
   2,  0,  0,  2,  0,  0,  2,  2,   //  516 beat 4 Y
   4,  0,  0,  0,  8,  0,  4,  0,   //  517 call 8 G/R
   4,  0,  4,  8,  0,  8,  2,  1,   //  518 echo GRYW
   5,  3,  4,  9,  9,  4,  3,  5,   //  519 mirror 84
   3,  4, 15,  8,  7, 14,  3,  0,   //  520 sparkle 94
  14,  0, 14,  0,  0,  0, 14,  0,   //  521 beat 9 YGR
   4,  0,  2,  0,  0,  0,  4,  0,   //  522 call 9 G/Y
   2,  3, 11, 15, 13, 12,  4,  0,   //  523 stack YWRG
  10,  4,  9,  8,  8,  9,  4, 10,   //  524 mirror 85
   2, 10,  7, 13,  1,  0, 13, 12,   //  525 sparkle 95
   9,  9,  0,  9,  0,  9,  9,  0,   //  526 beat 15 WR
   2,  0,  1,  0,  2,  0,  0,  1,   //  527 call 20 Y/W
   4, 12, 13, 15, 11,  3,  2,  0,   //  528 stack GRWY
  12,  2, 10, 14, 14, 10,  2, 12,   //  529 mirror 86
  10, 13,  9,  0,  1, 14,  3, 15,   //  530 sparkle 96
   8,  0,  0,  8,  0,  0,  8,  8,   //  531 beat 4 R
   0,  0,  0,  0,  4,  9,  4,  9,   //  532 call 13 G/WR
   1,  1,  4,  4,  2,  2,  8,  8,   //  533 double step WGYR
   2,  7,  2,  5,  5,  2,  7,  2,   //  534 mirror 87
   4, 13,  8,  0, 10,  1, 12, 12,   //  535 sparkle 97
   4,  0,  4,  0,  0,  0,  4,  0,   //  536 beat 9 G
   6,  8,  6,  0,  8,  6,  8,  0,   //  537 call 7 YG/R
   6, 12,  9,  3,  6, 12,  9,  3,   //  538 pair walk YGRW
  10,  6,  1,  2,  2,  1,  6, 10,   //  539 mirror 88
   8,  4, 11,  7, 13,  2,  0,  6,   //  540 sparkle 98
  13, 13, 13,  0, 13, 13, 13,  0,   //  541 beat 7 WGR
   1, 12,  0,  1, 12,  0,  1,  0,   //  542 call 5 W/GR
   2,  0,  2,  4,  0,  4,  8,  1,   //  543 echo YGRW
  15,  5,  4, 10, 10,  4,  5, 15,   //  544 mirror 89
   6,  4,  0, 11,  3,  4,  7,  6,   //  545 sparkle 99
  13,  0, 13,  0, 13, 13, 13, 13,   //  546 beat 14 WGR
   4,  8,  0,  0,  4,  8,  0,  0,   //  547 call 10 G/R
   8,  2,  1,  4,  4,  1,  2,  8,   //  548 pingpong RYWG
   3,  5,  3, 12, 12,  3,  5,  3,   //  549 mirror 90
   9,  3,  0, 10,  1,  7,  1, 11,   //  550 sparkle 100
   0, 14, 14,  0,  0, 14, 14,  0,   //  551 beat 17 YGR
   6,  0,  0,  0,  0,  0,  1,  6,   //  552 call 18 YG/W
   1,  4,  8,  2,  2,  8,  4,  1,   //  553 pingpong WGRY
  10, 13,  2, 13, 13,  2, 13, 10,   //  554 mirror 91
   6, 12,  6,  6,  0,  5, 12,  3,   //  555 sparkle 101
  13,  0,  0,  0, 13,  0, 13,  0,   //  556 beat 8 WGR
   4,  0,  0,  0, 10,  0,  4,  0,   //  557 call 8 G/YR
   2,  2,  8,  8,  4,  4,  1,  1,   //  558 double step YRGW
   3,  5,  3,  5,  5,  3,  5,  3,   //  559 mirror 92
   2,  4,  9, 12,  9, 10,  0,  1,   //  560 sparkle 102
   1,  0,  1,  1,  0,  1,  1,  0,   //  561 beat 6 W
   8,  0,  3,  8,  0,  3,  8,  0,   //  562 call 6 R/WY
   6, 10,  9,  5,  6, 10,  9,  5,   //  563 pair walk GYRW
   1,  6,  3,  3,  3,  3,  6,  1,   //  564 mirror 93
  13,  0, 11,  4, 11,  3, 12,  2,   //  565 sparkle 103
  11,  0, 11,  0,  0,  0, 11,  0,   //  566 beat 9 WYR
   4,  1,  4,  1,  0,  0,  0,  0,   //  567 call 12 G/W
   2,  2,  4,  4,  8,  8,  1,  1,   //  568 double step YGRW
   8,  1, 15, 12, 12, 15,  1,  8,   //  569 mirror 94
  10, 12,  3,  6,  2,  6,  0, 13,   //  570 sparkle 104
   8,  8,  8,  0,  0,  8,  0,  0,   //  571 beat 19 R
   6,  0,  8,  0,  6,  0,  8,  0,   //  572 call 1 YG/R
  12,  5,  3, 10, 12,  5,  3, 10,   //  573 pair walk RGWY
   3, 12,  9, 14, 14,  9, 12,  3,   //  574 mirror 95
   6,  5,  9, 14,  6,  8, 10,  0,   //  575 sparkle 105
   3,  0,  3,  3,  0,  3,  3,  0,   //  576 beat 6 WY
   8,  1,  8,  0,  0,  1,  0,  0,   //  577 call 19 R/W
   1,  3,  7, 15, 14, 12,  8,  0,   //  578 stack WYGR
  10,  2,  8,  1,  1,  8,  2, 10,   //  579 mirror 96
   2,  6,  0, 13,  6,  5, 14,  1,   //  580 sparkle 106
  15,  0,  0, 15,  0,  0, 15, 15,   //  581 beat 4 WYGR
   4,  2,  4,  2,  0,  0,  0,  0,   //  582 call 12 G/Y
   8, 15,  4, 15,  2, 15,  1, 15,   //  583 flash chase RGYW
   6,  5, 15,  1,  1, 15,  5,  6,   //  584 mirror 97
  13, 10,  0, 12,  9,  3, 15,  7,   //  585 sparkle 107
  15, 15,  0, 15, 15,  0, 15,  0,   //  586 beat 5 WYGR
   0,  1,  4,  0,  0,  1,  4,  0,   //  587 call 17 W/G
   4,  4,  2,  2,  1,  1,  8,  8,   //  588 double step GYWR
  12, 15,  2, 12, 12,  2, 15, 12,   //  589 mirror 98
   4,  9,  0,  1, 15,  3, 12,  3,   //  590 sparkle 108
   0, 10, 10,  0,  0, 10, 10,  0,   //  591 beat 17 YR
   5, 10,  5,  0,  0, 10,  0,  0,   //  592 call 19 WG/YR
   1, 15,  2, 15,  4, 15,  8, 15,   //  593 flash chase WYGR
  15,  5,  8, 11, 11,  8,  5, 15,   //  594 mirror 99
   8, 12,  7,  1,  4,  8,  9,  0,   //  595 sparkle 109
   3,  0,  0,  3,  3,  0,  0,  3,   //  596 beat 11 WY
   2,  1,  0,  2,  1,  0,  2,  0,   //  597 call 5 Y/W
   4,  8,  4,  8,  1,  2,  1,  2,   //  598 half chase GRWY
   4,  1,  3, 13, 13,  3,  1,  4,   //  599 mirror 100
   9,  0, 11, 11,  6, 15,  2, 15,   //  600 sparkle 110
  11,  0, 11,  0, 11,  0, 11,  0,   //  601 beat 1 WYR
   4,  9,  4,  9,  0,  0,  0,  0,   //  602 call 12 G/WR
   3,  5, 12, 10,  3,  5, 12, 10,   //  603 pair walk YWGR
  13,  6,  4, 13, 13,  4,  6, 13,   //  604 mirror 101
   7, 15,  0,  8,  6,  7, 10, 10,   //  605 sparkle 111
   5,  5,  5,  5,  0,  0,  0,  0,   //  606 beat 12 WG
   4,  0,  8,  0,  4,  0,  0,  8,   //  607 call 20 G/R
   8,  1,  8,  1,  4,  2,  4,  2,   //  608 half chase RWGY
   9,  2,  5, 12, 12,  5,  2,  9,   //  609 mirror 102
   1, 13, 15,  0,  9,  8, 11,  7,   //  610 sparkle 112
  13,  0, 13,  0, 13,  0,  0, 13,   //  611 beat 20 WGR
  10,  0,  0,  1,  0,  0, 10,  0,   //  612 call 3 YR/W
  13,  7, 11, 14, 13,  7, 11, 14,   //  613 dark chase YRGW
  15,  7,  8, 11, 11,  8,  7, 15,   //  614 mirror 103
   0, 13,  4,  8,  3, 15,  6,  5,   //  615 sparkle 113
   9,  0,  9,  0,  9,  0,  0,  9,   //  616 beat 20 WR
   2,  4,  0,  2,  0,  4,  2,  0,   //  617 call 15 Y/G
  13, 14, 11,  7, 13, 14, 11,  7,   //  618 dark chase YWGR
   1, 11,  5,  4,  4,  5, 11,  1,   //  619 mirror 104
  13,  1, 10,  7, 11,  9,  0,  7,   //  620 sparkle 114
   8,  0,  8,  8,  0,  8,  8,  0,   //  621 beat 6 R
   4,  0,  0,  0,  0,  0,  2,  4,   //  622 call 18 G/Y
   8,  9, 11, 15,  7,  6,  4,  0,   //  623 stack RWYG
   4, 13,  5,  1,  1,  5, 13,  4,   //  624 mirror 105
   0,  3,  7, 15,  9, 10,  9,  9,   //  625 sparkle 115
   8,  0,  8,  0,  8,  0,  0,  8,   //  626 beat 20 R
   3,  0,  0,  0,  0,  0, 12,  3,   //  627 call 18 WY/GR
   1,  2,  1,  2,  4,  8,  4,  8,   //  628 half chase WYGR
  11,  2,  7,  7,  7,  7,  2, 11,   //  629 mirror 106
  15,  8, 15,  9,  8,  0,  8, 15,   //  630 sparkle 116
  13,  0, 13, 13, 13,  0, 13,  0,   //  631 beat 16 WGR
   5,  0, 10,  0,  5,  0,  0, 10,   //  632 call 20 WG/YR
   4, 12, 14, 15, 11,  3,  1,  0,   //  633 stack GRYW
  12, 11,  3,  2,  2,  3, 11, 12,   //  634 mirror 107
  11, 15,  0, 13,  9, 15,  3,  5,   //  635 sparkle 117
   3,  3,  3,  0,  3,  3,  3,  0,   //  636 beat 7 WY
   0,  9,  2,  0,  0,  9,  2,  0,   //  637 call 17 WR/Y
   9,  3,  6, 12,  9,  3,  6, 12,   //  638 pair walk RWYG
  12, 15,  8,  7,  7,  8, 15, 12,   //  639 mirror 108
  13,  0, 10, 10,  7, 10,  2,  7,   //  640 sparkle 118
  14, 14,  0, 14,  0, 14, 14,  0,   //  641 beat 15 YGR
   0,  2,  0,  5,  0,  2,  0,  5,   //  642 call 2 Y/WG
   7, 13, 14, 11,  7, 13, 14, 11,   //  643 dark chase RYWG
   6,  6,  3, 11, 11,  3,  6,  6,   //  644 mirror 109
  11, 15, 11,  0,  1,  3,  8,  3,   //  645 sparkle 119
   0,  0,  0,  0,  6,  6,  6,  6,   //  646 beat 13 YG
  10,  0,  1,  0, 10,  0,  0,  1,   //  647 call 20 YR/W
   4,  0,  4,  2,  0,  2,  1,  8,   //  648 echo GYWR
   7, 10, 10, 14, 14, 10, 10,  7,   //  649 mirror 110
   4,  6, 14,  8,  7,  0, 15, 12,   //  650 sparkle 120
  14, 14,  0, 14, 14,  0, 14,  0,   //  651 beat 5 YGR
   8,  0,  4,  8,  0,  4,  8,  0,   //  652 call 6 R/G
   8, 10, 11, 15,  7,  5,  4,  0,   //  653 stack RYWG
  12, 14, 11,  4,  4, 11, 14, 12,   //  654 mirror 111
   3,  0,  4,  6,  3,  6,  9,  5,   //  655 sparkle 121
   0,  8,  0,  8,  0,  8,  0,  8,   //  656 beat 2 R
   0,  2,  1,  0,  0,  2,  1,  0,   //  657 call 17 Y/W
  14,  7, 11, 13, 14,  7, 11, 13,   //  658 dark chase WRGY
   4, 10,  6, 12, 12,  6, 10,  4,   //  659 mirror 112
   2, 11,  0,  1,  1,  7,  1, 11,   //  660 sparkle 122
   8,  8,  8,  0,  8,  8,  8,  0,   //  661 beat 7 R
   2,  0,  9,  0,  2,  0,  9,  0,   //  662 call 1 Y/WR
   2,  8,  2,  8,  1,  4,  1,  4,   //  663 half chase YRWG
   7, 11,  8, 14, 14,  8, 11,  7,   //  664 mirror 113
  14, 15,  7, 11, 13,  0,  9, 14,   //  665 sparkle 123
   0,  0,  0,  0,  9,  9,  9,  9,   //  666 beat 13 WR
   0,  0,  0,  0,  4,  3,  4,  3,   //  667 call 13 G/WY
   2, 15,  8, 15,  1, 15,  4, 15,   //  668 flash chase YRWG
   9, 14,  9, 13, 13,  9, 14,  9,   //  669 mirror 114
   0, 15, 11,  3,  8,  3, 15,  4,   //  670 sparkle 124
   0,  0,  0,  0, 12, 12, 12, 12,   //  671 beat 13 GR
   1,  4,  0,  1,  4,  0,  1,  0,   //  672 call 5 W/G
   8,  0,  8,  2,  0,  2,  4,  1,   //  673 echo RYGW
  11, 12,  4,  8,  8,  4, 12, 11,   //  674 mirror 115
  15,  8,  7, 13, 10,  0,  4, 14,   //  675 sparkle 125
   0,  6,  0,  6,  0,  6,  0,  6,   //  676 beat 2 YG
  12,  0,  2,  0, 12,  0,  0,  2,   //  677 call 20 GR/Y
   2,  8,  2,  8,  4,  1,  4,  1,   //  678 half chase YRGW
  15,  8, 12, 10, 10, 12,  8, 15,   //  679 mirror 116
   3,  8,  2,  2,  3,  0, 14,  8,   //  680 sparkle 126
  12,  0, 12, 12, 12,  0, 12,  0,   //  681 beat 16 GR
   2,  0,  4,  2,  0,  4,  2,  0,   //  682 call 6 Y/G
  14, 13, 11,  7, 14, 13, 11,  7,   //  683 dark chase WYGR
   2, 13, 10, 12, 12, 10, 13,  2,   //  684 mirror 117
   3,  3,  5,  5,  0, 12, 10, 11,   //  685 sparkle 127
  11,  0,  0, 11, 11,  0,  0, 11,   //  686 beat 11 WYR
   8,  3,  8,  3,  0,  0,  0,  0,   //  687 call 12 R/WY
   4,  4,  8,  8,  2,  2,  1,  1,   //  688 double step GRYW
  11,  4, 14,  9,  9, 14,  4, 11,   //  689 mirror 118
  15, 15,  0,  2, 12, 10,  9,  9,   //  690 sparkle 128
   7,  0,  7,  7,  7,  0,  7,  0,   //  691 beat 16 WYG
  10,  0,  0,  5,  0,  0, 10,  5,   //  692 call 4 YR/WG
   4, 15,  8, 15,  1, 15,  2, 15,   //  693 flash chase GRWY
  10, 12,  6,  1,  1,  6, 12, 10,   //  694 mirror 119
   2, 12,  1,  8,  3,  8,  0,  4,   //  695 sparkle 129
   9,  0,  9,  9,  9,  0,  9,  0,   //  696 beat 16 WR
   4,  0,  9,  4,  0,  9,  4,  0,   //  697 call 6 G/WR
   4,  4,  2,  2,  8,  8,  1,  1,   //  698 double step GYRW
  14, 11,  8,  6,  6,  8, 11, 14,   //  699 mirror 120
  12,  6, 10,  2,  0, 12,  5,  3,   //  700 sparkle 130
  11,  0,  0, 11,  0,  0, 11,  0,   //  701 beat 3 WYR
   8,  0,  4,  8,  4,  0,  8,  0,   //  702 call 16 R/G
   2, 10, 14, 15, 13,  5,  1,  0,   //  703 stack YRGW
   1, 11, 11,  3,  3, 11, 11,  1,   //  704 mirror 121
  13, 15,  9,  5, 12,  4,  0, 11,   //  705 sparkle 131
  12,  0,  0,  0,  0,  0, 12, 12,   //  706 beat 18 GR
   4,  0, 10,  4, 10,  0,  4,  0,   //  707 call 16 G/YR
   2,  0,  2,  4,  0,  4,  1,  8,   //  708 echo YGWR
  11, 15,  1,  2,  2,  1, 15, 11,   //  709 mirror 122
   9, 12,  0,  4, 10,  7, 11,  7,   //  710 sparkle 132
   2,  0,  0,  2,  0,  0,  2,  0,   //  711 beat 3 Y
   9,  0,  2,  0,  9,  0,  2,  0,   //  712 call 1 WR/Y
   1,  0,  1,  2,  0,  2,  4,  8,   //  713 echo WYGR
   5, 13, 13, 15, 15, 13, 13,  5,   //  714 mirror 123
  10,  7,  2,  6, 12, 11,  0,  2,   //  715 sparkle 133
  10,  0,  0,  0,  0,  0, 10, 10,   //  716 beat 18 YR
   5,  0,  0, 10,  0,  0,  5, 10,   //  717 call 4 WG/YR
   8,  8,  2,  2,  4,  4,  1,  1,   //  718 double step RYGW
  14,  5,  8,  1,  1,  8,  5, 14,   //  719 mirror 124
  10,  2,  4,  9, 12,  0,  6, 15,   //  720 sparkle 134
   8,  8,  0,  8,  0,  8,  8,  0,   //  721 beat 15 R
   0,  4,  0,  2,  0,  4,  0,  2,   //  722 call 2 G/Y
   4,  5, 13, 15, 11, 10,  2,  0,   //  723 stack GWRY
  14, 12, 11,  7,  7, 11, 12, 14,   //  724 mirror 125
   0, 15, 15,  8,  2,  4, 13,  9,   //  725 sparkle 135
   5,  0,  0,  5,  0,  0,  5,  5,   //  726 beat 4 WG
   3,  0, 12,  0,  3,  0,  0, 12,   //  727 call 20 WY/GR
   5,  3, 10, 12,  5,  3, 10, 12,   //  728 pair walk GWYR
   8, 12, 10,  1,  1, 10, 12,  8,   //  729 mirror 126
   2, 11,  9,  8,  0,  5, 15,  5,   //  730 sparkle 136
   1,  1,  1,  0,  0,  1,  0,  0,   //  731 beat 19 W
   2,  0,  4,  0,  2,  4,  2,  4,   //  732 call 14 Y/G
   7, 11, 14, 13,  7, 11, 14, 13,   //  733 dark chase RGWY
   4,  7,  5,  3,  3,  5,  7,  4,   //  734 mirror 127
  11, 11,  1,  5,  7,  7,  0, 15,   //  735 sparkle 137
  15, 15, 15,  0,  0, 15,  0,  0,   //  736 beat 19 WYGR
   1,  0,  0, 10,  0,  0,  1, 10,   //  737 call 4 W/YR
   4,  6,  7, 15, 11,  9,  8,  0,   //  738 stack GYWR
   4, 10, 14,  1,  1, 14, 10,  4,   //  739 mirror 128
  15,  5,  0,  1,  4,  6, 10,  5,   //  740 sparkle 138
  12,  0,  0, 12,  0,  0, 12, 12,   //  741 beat 4 GR
   0,  0,  0,  0,  1,  6,  1,  6,   //  742 call 13 W/YG
   4,  4,  1,  1,  2,  2,  8,  8,   //  743 double step GWYR
   6,  5,  4,  9,  9,  4,  5,  6,   //  744 mirror 129
   9,  6, 15,  6, 15,  0,  4,  1,   //  745 sparkle 139
  10, 10, 10,  0, 10, 10, 10,  0,   //  746 beat 7 YR
   8,  0,  6,  0,  8,  0,  6,  0,   //  747 call 1 R/YG
  11, 14,  7, 13, 11, 14,  7, 13,   //  748 dark chase GWRY
   3, 13,  3, 14, 14,  3, 13,  3,   //  749 mirror 130
   7,  1, 15,  6,  0,  1, 14,  1,   //  750 sparkle 140
  10, 10,  0,  0, 10, 10,  0,  0,   //  751 beat 10 YR
   2,  0, 12,  0,  2,  0,  0, 12,   //  752 call 20 Y/GR
   8,  0,  8,  1,  0,  1,  4,  2,   //  753 echo RWGY
   7, 13, 13, 13, 13, 13, 13,  7,   //  754 mirror 131
   7,  5, 11,  6,  9,  0,  8,  8,   //  755 sparkle 141
   4,  0,  0,  0,  0,  0,  4,  4,   //  756 beat 18 G
   4,  8,  4,  0,  8,  4,  8,  0,   //  757 call 7 G/R
   2,  6,  7, 15, 13,  9,  8,  0,   //  758 stack YGWR
  14,  4,  2, 10, 10,  2,  4, 14,   //  759 mirror 132
   7,  3, 10, 13,  8, 13,  0,  1,   //  760 sparkle 142
   0,  0,  0,  0,  7,  7,  7,  7,   //  761 beat 13 WYG
  12,  3,  0, 12,  3,  0, 12,  0,   //  762 call 5 GR/WY
   8,  0,  8,  4,  0,  4,  1,  2,   //  763 echo RGWY
  15, 10, 10,  8,  8, 10, 10, 15,   //  764 mirror 133
  15, 15,  9,  0,  8,  9, 11,  9,   //  765 sparkle 143
  13, 13,  0,  0, 13, 13,  0,  0,   //  766 beat 10 WGR
   0,  4,  0,  3,  0,  4,  0,  3,   //  767 call 2 G/WY
   1, 15,  2, 15,  8, 15,  4, 15,   //  768 flash chase WYRG
  10, 10, 15,  7,  7, 15, 10, 10,   //  769 mirror 134
   0,  3, 12, 10,  7,  7, 14,  9,   //  770 sparkle 144
   2,  0,  2,  2,  0,  2,  2,  0,   //  771 beat 6 Y
   0,  0,  0,  0,  8,  4,  8,  4,   //  772 call 13 R/G
   2,  3,  7, 15, 13, 12,  8,  0,   //  773 stack YWGR
   3, 15, 11,  8,  8, 11, 15,  3,   //  774 mirror 135
   2,  5, 11,  7,  0, 11,  1, 12,   //  775 sparkle 145
   1,  1,  0,  1,  1,  0,  1,  0,   //  776 beat 5 W
   4,  0,  8,  4,  0,  8,  4,  0,   //  777 call 6 G/R
   1,  3, 11, 15, 14, 12,  4,  0,   //  778 stack WYRG
  11, 13, 10, 15, 15, 10, 13, 11,   //  779 mirror 136
   4,  3,  3,  1, 11,  6,  0, 11,   //  780 sparkle 146
  13,  0,  0, 13,  0,  0, 13, 13,   //  781 beat 4 WGR
   0,  2, 12,  0,  0,  2, 12,  0,   //  782 call 17 Y/GR
   8,  8,  4,  4,  1,  1,  2,  2,   //  783 double step RGWY
   3, 15,  6,  3,  3,  6, 15,  3,   //  784 mirror 137
   6,  4,  3, 14,  0,  4,  1,  2,   //  785 sparkle 147
  13,  0, 13, 13,  0, 13, 13,  0,   //  786 beat 6 WGR
   2,  0,  0,  0,  4,  0,  2,  0,   //  787 call 8 Y/G
   2,  0,  2,  1,  0,  1,  4,  8,   //  788 echo YWGR
   9,  7, 11, 10, 10, 11,  7,  9,   //  789 mirror 138
  13,  7,  0, 12,  9,  6,  8,  1,   //  790 sparkle 148
   0, 10,  0, 10,  0, 10,  0, 10,   //  791 beat 2 YR
   9,  0,  6,  0,  9,  0,  0,  6,   //  792 call 20 WR/YG
   4,  8,  1,  2,  2,  1,  8,  4,   //  793 pingpong GRWY
  11, 15,  5, 14, 14,  5, 15, 11,   //  794 mirror 139
   5,  3,  7, 14,  1,  0,  4, 12,   //  795 sparkle 149
  12, 12,  0,  0, 12, 12,  0,  0,   //  796 beat 10 GR
   4,  1,  4,  0,  0,  1,  0,  0,   //  797 call 19 G/W
   2,  8,  4,  1,  1,  4,  8,  2,   //  798 pingpong YRGW
   1,  2, 10,  2,  2, 10,  2,  1,   //  799 mirror 140
  10, 11,  4, 14,  8, 11,  0, 12,   //  800 sparkle 150
   3,  3,  0,  0,  3,  3,  0,  0,   //  801 beat 10 WY
   2,  0,  0,  1,  0,  0,  2,  1,   //  802 call 4 Y/W
   9,  5,  6, 10,  9,  5,  6, 10,   //  803 pair walk RWGY
  14, 13, 12, 13, 13, 12, 13, 14,   //  804 mirror 141
  14,  2, 15,  2, 12,  0,  1,  5,   //  805 sparkle 151
   7,  0,  0,  7,  7,  0,  0,  7,   //  806 beat 11 WYG
   4,  1,  4,  0,  1,  4,  1,  0,   //  807 call 7 G/W
   4,  4,  8,  8,  1,  1,  2,  2,   //  808 double step GRWY
   1, 12,  2, 14, 14,  2, 12,  1,   //  809 mirror 142
   4, 14, 10,  0,  6, 10,  5,  6,   //  810 sparkle 152
   2,  0,  0,  0,  2,  0,  2,  0,   //  811 beat 8 Y
   4,  9,  0,  0,  4,  9,  0,  0,   //  812 call 10 G/WR
   4,  0,  4,  8,  0,  8,  1,  2,   //  813 echo GRWY
  15,  1, 12, 10, 10, 12,  1, 15,   //  814 mirror 143
   0,  5, 12, 13,  7, 14,  6, 13,   //  815 sparkle 153
  10, 10, 10,  0,  0, 10,  0,  0,   //  816 beat 19 YR
   3,  8,  3,  0,  0,  8,  0,  0,   //  817 call 19 WY/R
   1,  0,  1,  4,  0,  4,  2,  8,   //  818 echo WGYR
  15, 11, 13, 13, 13, 13, 11, 15,   //  819 mirror 144
   1, 12, 11, 10, 14,  6,  0,  4,   //  820 sparkle 154
  15,  0, 15,  0, 15,  0,  0, 15,   //  821 beat 20 WYGR
  10,  0,  0,  1, 10,  0,  0,  1,   //  822 call 11 YR/W
   4,  2,  4,  2,  8,  1,  8,  1,   //  823 half chase GYRW
   7, 12,  9,  9,  9,  9, 12,  7,   //  824 mirror 145
   1,  0,  9,  8,  9,  4,  7,  6,   //  825 sparkle 155
  14,  0, 14,  0, 14,  0, 14,  0,   //  826 beat 1 YGR
  10,  0,  0,  0,  0,  0,  1, 10,   //  827 call 18 YR/W
   1,  1,  8,  8,  2,  2,  4,  4,   //  828 double step WRYG
   9, 13,  5, 11, 11,  5, 13,  9,   //  829 mirror 146
  10,  0, 11,  7,  8, 12, 12,  2,   //  830 sparkle 156
   3,  3,  3,  3,  0,  0,  0,  0,   //  831 beat 12 WY
   6,  8,  0,  6,  0,  8,  6,  0,   //  832 call 15 YG/R
   2,  1,  2,  1,  8,  4,  8,  4,   //  833 half chase YWRG
  11, 12, 14,  9,  9, 14, 12, 11,   //  834 mirror 147
  13,  0,  2,  2,  4,  2, 11,  9,   //  835 sparkle 157
   0,  0,  0,  0, 11, 11, 11, 11,   //  836 beat 13 WYR
   1,  0, 10,  0,  1,  0,  0, 10,   //  837 call 20 W/YR
   1,  5,  7, 15, 14, 10,  8,  0,   //  838 stack WGYR
   7, 14,  6,  3,  3,  6, 14,  7,   //  839 mirror 148
   6,  9,  6,  8,  2, 11,  6,  0,   //  840 sparkle 158
  11,  0,  0,  0,  0,  0, 11, 11,   //  841 beat 18 WYR
   6,  0,  1,  0,  6,  1,  6,  1,   //  842 call 14 YG/W
   2, 15,  8, 15,  4, 15,  1, 15,   //  843 flash chase YRGW
   4, 15,  4,  2,  2,  4, 15,  4,   //  844 mirror 149
   8, 14,  9, 15,  0,  7,  8,  7,   //  845 sparkle 159
   5,  0,  5,  5,  0,  5,  5,  0,   //  846 beat 6 WG
   5,  8,  0,  5,  0,  8,  5,  0,   //  847 call 15 WG/R
  10,  9,  5,  6, 10,  9,  5,  6,   //  848 pair walk YRWG
   5,  3,  1,  1,  1,  1,  3,  5,   //  849 mirror 150
   5,  6,  4,  3,  0,  2,  5,  8,   //  850 sparkle 160
   2,  2,  2,  2,  0,  0,  0,  0,   //  851 beat 12 Y
   3,  4,  3,  4,  0,  0,  0,  0,   //  852 call 12 WY/G
  12,  9,  3,  6, 12,  9,  3,  6,   //  853 pair walk GRWY
  12, 14,  2,  2,  2,  2, 14, 12,   //  854 mirror 151
   6,  0,  6,  2,  6, 13,  5, 10,   //  855 sparkle 161
  12, 12, 12,  0, 12, 12, 12,  0,   //  856 beat 7 GR
  10,  5, 10,  5,  0,  0,  0,  0,   //  857 call 12 YR/WG
   8, 15,  2, 15,  1, 15,  4, 15,   //  858 flash chase RYWG
   6, 15,  7,  7,  7,  7, 15,  6,   //  859 mirror 152
   5,  8, 11, 10,  3,  0, 13,  2,   //  860 sparkle 162
   9,  0,  9,  0,  9,  9,  9,  9,   //  861 beat 14 WR
  10,  1, 10,  1,  0,  0,  0,  0,   //  862 call 12 YR/W
   2, 15,  1, 15,  8, 15,  4, 15,   //  863 flash chase YWRG
  11,  2, 14, 15, 15, 14,  2, 11,   //  864 mirror 153
   0, 10,  4,  5, 11, 14, 11,  1,   //  865 sparkle 163
   4,  4,  4,  0,  4,  4,  4,  0,   //  866 beat 7 G
   3,  0,  0,  0,  4,  0,  3,  0,   //  867 call 8 WY/G
   4,  2,  1,  8,  8,  1,  2,  4,   //  868 pingpong GYWR
   4,  1, 11,  8,  8, 11,  1,  4,   //  869 mirror 154
   4, 15,  4, 11,  4,  0, 10, 10,   //  870 sparkle 164
   6,  6,  0,  0,  6,  6,  0,  0,   //  871 beat 10 YG
  12,  3, 12,  0,  0,  3,  0,  0,   //  872 call 19 GR/WY
   4,  8,  4,  8,  2,  1,  2,  1,   //  873 half chase GRYW
   9,  3,  3, 14, 14,  3,  3,  9,   //  874 mirror 155
  12,  9,  7,  8, 10,  5,  0, 14,   //  875 sparkle 165
  12, 12,  0, 12, 12,  0, 12,  0,   //  876 beat 5 GR
   4,  0,  0,  0,  0,  0,  1,  4,   //  877 call 18 G/W
   8,  4,  8,  4,  1,  2,  1,  2,   //  878 half chase RGWY
   6,  6, 15,  5,  5, 15,  6,  6,   //  879 mirror 156
   0,  8, 11,  3,  2,  1,  2, 12,   //  880 sparkle 166
  12,  0, 12,  0, 12,  0,  0, 12,   //  881 beat 20 GR
   6,  9,  6,  0,  9,  6,  9,  0,   //  882 call 7 YG/WR
   6,  5,  9, 10,  6,  5,  9, 10,   //  883 pair walk YGWR
   2,  7,  6, 12, 12,  6,  7,  2,   //  884 mirror 157
  14,  6, 12, 14,  5, 15,  0, 14,   //  885 sparkle 167
   0,  6,  6,  0,  0,  6,  6,  0,   //  886 beat 17 YG
  10,  0,  0,  0,  5,  0, 10,  0,   //  887 call 8 YR/WG
   4,  1,  4,  1,  8,  2,  8,  2,   //  888 half chase GWRY
  10,  9, 14,  2,  2, 14,  9, 10,   //  889 mirror 158
   3,  4,  6,  0,  6,  8,  8,  1,   //  890 sparkle 168
   4,  4,  0,  0,  4,  4,  0,  0,   //  891 beat 10 G
  12,  3, 12,  3,  0,  0,  0,  0,   //  892 call 12 GR/WY
  11,  7, 13, 14, 11,  7, 13, 14,   //  893 dark chase GRYW
  11,  9, 10, 13, 13, 10,  9, 11,   //  894 mirror 159
   7, 12,  8,  5,  8,  0, 11,  2,   //  895 sparkle 169
   1,  0,  0,  1,  0,  0,  1,  0,   //  896 beat 3 W
  10,  0,  4,  0, 10,  0,  0,  4,   //  897 call 20 YR/G
   4,  0,  4,  1,  0,  1,  2,  8,   //  898 echo GWYR
  13, 13, 10,  6,  6, 10, 13, 13,   //  899 mirror 160
  15,  6,  9, 14,  1,  3,  0,  4,   //  900 sparkle 170
   6,  6,  0,  6,  6,  0,  6,  0,   //  901 beat 5 YG
   8,  0,  0,  1,  0,  0,  8,  1,   //  902 call 4 R/W
  10, 12,  5,  3, 10, 12,  5,  3,   //  903 pair walk YRGW
   7,  5,  9,  7,  7,  9,  5,  7,   //  904 mirror 161
  11,  3,  0,  7,  9,  3,  9,  1,   //  905 sparkle 171
   9,  0,  0,  0,  0,  0,  9,  9,   //  906 beat 18 WR
   2,  0,  0,  4,  0,  0,  2,  0,   //  907 call 3 Y/G
   2,  0,  2,  8,  0,  8,  4,  1,   //  908 echo YRGW
  15,  6,  2, 12, 12,  2,  6, 15,   //  909 mirror 162
   5, 11, 10,  0, 13, 15,  6, 13,   //  910 sparkle 172
  14,  0, 14,  0, 14, 14, 14, 14,   //  911 beat 14 YGR
   4,  0,  9,  4,  9,  0,  4,  0,   //  912 call 16 G/WR
   4,  6, 14, 15, 11,  9,  1,  0,   //  913 stack GYRW
  15,  8,  2, 13, 13,  2,  8, 15,   //  914 mirror 163
  14,  1, 11, 14,  4,  4,  0,  6,   //  915 sparkle 173
  11,  0,  0, 11,  0,  0, 11, 11,   //  916 beat 4 WYR
   0,  3,  4,  0,  0,  3,  4,  0,   //  917 call 17 WY/G
   1,  0,  1,  8,  0,  8,  2,  4,   //  918 echo WRYG
   9,  3,  8,  5,  5,  8,  3,  9,   //  919 mirror 164
  14, 11, 14, 11, 10,  0, 15, 10,   //  920 sparkle 174
   6,  0,  6,  0,  6,  6,  6,  6,   //  921 beat 14 YG
   0,  4,  2,  0,  0,  4,  2,  0,   //  922 call 17 G/Y
   8,  1,  2,  4,  4,  2,  1,  8,   //  923 pingpong RWYG
   3, 12,  6, 15, 15,  6, 12,  3,   //  924 mirror 165
   0, 10,  3, 15,  9, 14,  6, 11,   //  925 sparkle 175
  10,  0,  0, 10,  0,  0, 10,  0,   //  926 beat 3 YR
   9,  4,  0,  9,  4,  0,  9,  0,   //  927 call 5 WR/G
   1,  0,  1,  8,  0,  8,  4,  2,   //  928 echo WRGY
   6, 15,  6,  4,  4,  6, 15,  6,   //  929 mirror 166
   4, 14, 14,  0,  8, 15,  4,  9,   //  930 sparkle 176
  15,  0, 15, 15, 15,  0, 15,  0,   //  931 beat 16 WYGR
   6,  0,  0,  9,  0,  0,  6,  0,   //  932 call 3 YG/WR
   1,  2,  1,  2,  8,  4,  8,  4,   //  933 half chase WYRG
   3,  5, 13,  8,  8, 13,  5,  3,   //  934 mirror 167
   5,  7,  3, 13,  3, 10,  0,  8,   //  935 sparkle 177
  14,  0, 14, 14,  0, 14, 14,  0,   //  936 beat 6 YGR
   2,  0,  0,  5,  2,  0,  0,  5,   //  937 call 11 Y/WG
   1,  4,  1,  4,  2,  8,  2,  8,   //  938 half chase WGYR
   6, 15,  6,  2,  2,  6, 15,  6,   //  939 mirror 168
  13,  0,  3,  6,  5,  8,  6, 10,   //  940 sparkle 178
   0, 13, 13,  0,  0, 13, 13,  0,   //  941 beat 17 WGR
   0,  8,  5,  0,  0,  8,  5,  0,   //  942 call 17 R/WG
   4,  5,  7, 15, 11, 10,  8,  0,   //  943 stack GWYR
   1,  4, 14, 12, 12, 14,  4,  1,   //  944 mirror 169
  10, 14,  3, 15,  0, 15,  4,  1,   //  945 sparkle 179
   7,  0,  0,  7,  0,  0,  7,  7,   //  946 beat 4 WYG
  12,  0,  0,  0,  0,  0,  3, 12,   //  947 call 18 GR/WY
   4,  0,  4,  1,  0,  1,  8,  2,   //  948 echo GWRY
  13, 14, 14,  5,  5, 14, 14, 13,   //  949 mirror 170
   3, 14,  6,  0,  8,  3, 14, 15,   //  950 sparkle 180
  13,  0, 13,  0, 13,  0, 13,  0,   //  951 beat 1 WGR
   1,  0, 10,  0,  1, 10,  1, 10,   //  952 call 14 W/YR
   8,  1,  4,  2,  2,  4,  1,  8,   //  953 pingpong RWGY
   9,  1, 10, 13, 13, 10,  1,  9,   //  954 mirror 171
  13,  0,  5,  8,  4,  8, 14,  5,   //  955 sparkle 181
   5,  0,  5,  0,  5,  5,  5,  5,   //  956 beat 14 WG
   1,  0,  2,  0,  0,  0,  1,  0,   //  957 call 9 W/Y
   8, 12, 13, 15,  7,  3,  2,  0,   //  958 stack RGWY
   2,  6, 12,  7,  7, 12,  6,  2,   //  959 mirror 172
   4,  2,  6,  4,  5,  2,  1,  0,   //  960 sparkle 182
   4,  4,  4,  0,  0,  4,  0,  0,   //  961 beat 19 G
   5,  8,  5,  0,  8,  5,  8,  0,   //  962 call 7 WG/R
   1,  8,  4,  2,  2,  4,  8,  1,   //  963 pingpong WRGY
  14,  9,  2,  8,  8,  2,  9, 14,   //  964 mirror 173
   5,  2,  3,  5,  9,  7,  0, 12,   //  965 sparkle 183
  10, 10,  0, 10, 10,  0, 10,  0,   //  966 beat 5 YR
   4, 10,  4,  0,  0, 10,  0,  0,   //  967 call 19 G/YR
   7, 14, 13, 11,  7, 14, 13, 11,   //  968 dark chase RWYG
   9, 10,  6, 13, 13,  6, 10,  9,   //  969 mirror 174
   2, 13,  2, 13,  0,  7, 12,  9,   //  970 sparkle 184
   8,  8,  8,  8,  0,  0,  0,  0,   //  971 beat 12 R
   2,  0,  9,  2,  9,  0,  2,  0,   //  972 call 16 Y/WR
  13, 14,  7, 11, 13, 14,  7, 11,   //  973 dark chase YWRG
  14,  8,  1, 10, 10,  1,  8, 14,   //  974 mirror 175
  14,  3,  0,  2,  1,  4,  4,  4,   //  975 sparkle 185
   5,  5,  0,  5,  5,  0,  5,  0,   //  976 beat 5 WG
   0,  6,  0,  8,  0,  6,  0,  8,   //  977 call 2 YG/R
   8,  4,  1,  2,  2,  1,  4,  8,   //  978 pingpong RGWY
  15,  1,  1, 14, 14,  1,  1, 15,   //  979 mirror 176
   7,  6,  5,  6, 11, 10,  0,  2,   //  980 sparkle 186
   0,  8,  8,  0,  0,  8,  8,  0,   //  981 beat 17 R
   3,  8,  3,  8,  0,  0,  0,  0,   //  982 call 12 WY/R
   8, 15,  1, 15,  2, 15,  4, 15,   //  983 flash chase RWYG
  10,  2, 13, 12, 12, 13,  2, 10,   //  984 mirror 177
   6,  0,  9,  8,  6, 15,  7,  9,   //  985 sparkle 187
   3,  0,  3,  0,  0,  0,  3,  0,   //  986 beat 9 WY
   2,  0,  0, 12,  0,  0,  2, 12,   //  987 call 4 Y/GR
   5,  9, 10,  6,  5,  9, 10,  6,   //  988 pair walk GWRY
   7, 15,  5,  7,  7,  5, 15,  7,   //  989 mirror 178
  15, 13,  5,  7,  4,  0, 11,  6,   //  990 sparkle 188
   0, 12,  0, 12,  0, 12,  0, 12,   //  991 beat 2 GR
   9,  0,  2,  0,  9,  2,  9,  2,   //  992 call 14 WR/Y
   2, 15,  1, 15,  4, 15,  8, 15,   //  993 flash chase YWGR
  13, 15, 15, 15, 15, 15, 15, 13,   //  994 mirror 179
   4,  0,  2, 11, 12,  1,  1,  6,   //  995 sparkle 189
  13, 13,  0, 13,  0, 13, 13,  0,   //  996 beat 15 WGR
   1, 10,  1,  0, 10,  1, 10,  0,   //  997 call 7 W/YR
   8, 15,  1, 15,  4, 15,  2, 15,   //  998 flash chase RWGY
   8,  4, 15, 11, 11, 15,  4,  8,   //  999 mirror 180
   0, 14,  1,  1, 11, 10, 14, 10,   // 1000 sparkle 190
};
const uint16_t SHOW_LEN = sizeof(SHOW_STEPS);
const uint16_t PATTERN_COUNT = SHOW_LEN / PATTERN_STEPS;   // 1000

// ---------- 1 lakh variations ----------
const uint32_t VARIATION_COUNT = 100000;
// The 24 orders of the four lights: in order k, the street lights' part is played by
// LIGHT_ORDERS[k][0], the building lights' part by [1], green's by [2], red's by [3].
const uint8_t LIGHT_ORDERS[24][4] = {
  {1, 2, 4, 8}, {1, 2, 8, 4}, {1, 4, 2, 8}, {1, 4, 8, 2}, {1, 8, 2, 4}, {1, 8, 4, 2},
  {2, 1, 4, 8}, {2, 1, 8, 4}, {2, 4, 1, 8}, {2, 4, 8, 1}, {2, 8, 1, 4}, {2, 8, 4, 1},
  {4, 1, 2, 8}, {4, 1, 8, 2}, {4, 2, 1, 8}, {4, 2, 8, 1}, {4, 8, 1, 2}, {4, 8, 2, 1},
  {8, 1, 2, 4}, {8, 1, 4, 2}, {8, 2, 1, 4}, {8, 2, 4, 1}, {8, 4, 1, 2}, {8, 4, 2, 1},
};
// Candidate c = transform t (c / 1000) applied to pattern b (c % 1000). Transform t: colour order
// t % 24, backwards if (t / 24) is odd, starting at step (t / 48) % 8. 384 transforms x 1000.
const uint16_t TRANSFORMS = 384;
uint8_t remapTo[24][16], remapFrom[24][16];   // light set -> recoloured set, and back
uint32_t baseKeys[PATTERN_COUNT];             // the 1000 patterns packed into 32 bits, sorted

struct Variation { uint32_t cand; uint32_t num; uint8_t steps[PATTERN_STEPS]; };
Variation showVar, partyVar;

uint8_t stepIndex(uint16_t t, uint8_t k) {     // which step of the pattern plays at step k
  uint8_t j = (k + (t / 48) % 8) % PATTERN_STEPS;
  return ((t / 24) % 2) ? PATTERN_STEPS - 1 - j : j;
}

int cmpKey(const void* a, const void* b) {
  uint32_t x = *(const uint32_t*)a, y = *(const uint32_t*)b;
  return x < y ? -1 : (x > y ? 1 : 0);
}

void setupVariations() {
  for (uint8_t o = 0; o < 24; o++)
    for (uint8_t m = 0; m < 16; m++) {
      uint8_t r = 0;
      for (uint8_t i = 0; i < 4; i++) if (m & (1 << i)) r |= LIGHT_ORDERS[o][i];
      remapTo[o][m] = r;
      remapFrom[o][r] = m;
    }
  for (uint16_t b = 0; b < PATTERN_COUNT; b++) {
    uint32_t key = 0;
    for (uint8_t k = 0; k < PATTERN_STEPS; k++) key |= (uint32_t)SHOW_STEPS[b * PATTERN_STEPS + k] << (4 * k);
    baseKeys[b] = key;
  }
  qsort(baseKeys, PATTERN_COUNT, sizeof(uint32_t), cmpKey);
}

bool isBasePattern(uint32_t key) {
  int lo = 0, hi = PATTERN_COUNT - 1;
  while (lo <= hi) {
    int mid = (lo + hi) / 2;
    if (baseKeys[mid] == key) return true;
    if (baseKeys[mid] < key) lo = mid + 1; else hi = mid - 1;
  }
  return false;
}

void candidateSteps(uint32_t c, uint8_t* out) {
  uint16_t t = c / PATTERN_COUNT, b = c % PATTERN_COUNT;
  for (uint8_t k = 0; k < PATTERN_STEPS; k++)
    out[k] = remapTo[t % 24][SHOW_STEPS[b * PATTERN_STEPS + stepIndex(t, k)]];
}

// A candidate repeats an earlier one if an earlier transform turns one of the 1000 patterns into it.
bool isRepeat(uint32_t c) {
  uint8_t p[PATTERN_STEPS];
  candidateSteps(c, p);
  uint16_t t = c / PATTERN_COUNT;
  for (uint16_t u = 0; u < t; u++) {
    uint32_t key = 0;
    for (uint8_t k = 0; k < PATTERN_STEPS; k++) key |= (uint32_t)remapFrom[u % 24][p[k]] << (4 * stepIndex(u, k));
    if (isBasePattern(key)) return true;
  }
  return false;
}

void firstVariation(Variation& v) {
  v.cand = 0;
  v.num = 0;
  candidateSteps(0, v.steps);
}

void nextVariation(Variation& v) {
  if (++v.num >= VARIATION_COUNT) { firstVariation(v); return; }   // after all 1 lakh, start again
  do { v.cand++; } while (v.cand < (uint32_t)TRANSFORMS * PATTERN_COUNT && isRepeat(v.cand));
  if (v.cand >= (uint32_t)TRANSFORMS * PATTERN_COUNT) { firstVariation(v); return; }
  candidateSteps(v.cand, v.steps);
}

bool showOn = false, showSavedAuto = false;
uint16_t showStep = 0;
uint32_t showT = 0;
uint8_t showSaved = 0;

BLEServer* pServer = nullptr;
BLECharacteristic* pTx = nullptr;
volatile bool connected = false;
bool wasConnected = false;
bool statusDue = false;
uint32_t statT = 0, ldrT = 0;

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
  for (int i = 0; i < 16; i++) s += analogRead(PIN_LDR);
  return (int)(s / 16);
}

int medianOf(const int* a) {
  int t[REF_N];
  for (uint8_t i = 0; i < REF_N; i++) {   // insertion sort (60 values, every 2 s)
    int v = a[i], j = i;
    while (j > 0 && t[j - 1] > v) { t[j] = t[j - 1]; j--; }
    t[j] = v;
  }
  return (t[REF_N / 2 - 1] + t[REF_N / 2]) / 2;
}

// Read the LDR and decide dark / light. Returns true when it changed between dark and light.
bool updateLdr() {
  int r = readLdr();
  lastLdr = r;
  uint32_t now = millis();
  if (!refReady) {                      // first reading: start from the light level at power-up
    for (uint8_t i = 0; i < REF_N; i++) refBuf[i] = r;
    refReady = true;
    refT = now;
  } else if (now - refT >= 2000) {
    refT = now;
    if (!ldrDark) {
      refBuf[refPos] = r;               // learn the room's light level while it is light
      refPos = (refPos + 1) % REF_N;
    } else {
      // while dark, drift slowly towards the reading (~5 minutes), so the level can never get
      // stuck too high (e.g. after a torch was held on the LDR for minutes)
      for (uint8_t i = 0; i < REF_N; i++) {
        int d = r - refBuf[i], step = d / 150;
        if (step == 0 && d != 0) step = (d > 0) ? 1 : -1;
        refBuf[i] += step;
      }
    }
  }
  ldrRef = medianOf(refBuf);
  if (thrManual > 0) {
    lightsOnBelow  = max(0, thrManual - 100);
    lightsOffAbove = min(4095, thrManual + 100);
  } else {
    lightsOnBelow  = max(150, ldrRef * 7 / 10);   // very dark (< 150) always counts as dark
    lightsOffAbove = max(250, ldrRef * 8 / 10);
  }
  bool was = ldrDark;
  if (r < lightsOnBelow) ldrDark = true;
  else if (r > lightsOffAbove) ldrDark = false;
  return ldrDark != was;
}

// Auto mode: street + building lights on when dark, off when light. Returns true if they changed.
bool followLdr() {
  if (!autoMode || (isOn(B_SL) == ldrDark && isOn(B_BL) == ldrDark)) return false;
  setBit(B_SL, ldrDark);
  setBit(B_BL, ldrDark);
  return true;
}

String statusLine() {
  char b[128];
  snprintf(b, sizeof(b),
           "ST:SL=%d,BL=%d,GR=%d,RD=%d,WT=%d,AUTO=%d,MU=%d,SH=%d,DK=%d;LDR=%d,THR=%d,LON=%d\n",
           isOn(B_SL), isOn(B_BL), isOn(B_GR), isOn(B_RD),
           isOn(B_WT), autoMode ? 1 : 0, partyOn ? 1 : 0, showOn ? 1 : 0, ldrDark ? 1 : 0,
           lastLdr, thrManual, lightsOnBelow);
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

// Party lights follow the tune. Each new note moves the lights one step on through this bar's
// pattern (skipping its dark steps, so every note lights up), and a rest turns them off. The
// turbines keep spinning.
void nextNote(uint16_t i) {
  partyNoteSix = partySix;
  partySix += songLen[i];
  partyNoteMs = (uint32_t)songLen[i] * 15000UL / songBpm;   // 60000 / bpm / 4
  partyGap = false;
  uint32_t bar = partyNoteSix / 16;                          // 16 sixteenths = one bar
  if (bar != partyBar) {   // a new bar: the next variation
    if (partyBar != 0xFFFFFFFFUL) for (uint32_t n = partyBar; n < bar; n++) nextVariation(partyVar);
    partyBar = bar;
    partyHit = 0;
  }
  if (songNote[i] == 0) {
    state = B_WT;
  } else {
    uint8_t m = 0;
    for (uint8_t k = 0; k < PATTERN_STEPS && m == 0; k++) m = partyVar.steps[partyHit++ % PATTERN_STEPS];
    state = m | B_WT;
  }
  applyOutputs();
}

void showFrame() {
  state = showVar.steps[showStep] | B_WT;   // the wind turbines spin for the whole show
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
  firstVariation(showVar);
  showT = millis();
  showFrame();
  statusDue = true;
}

void stopParty(bool restore) {
  if (!partyOn) return;
  partyOn = false;
  // the next party starts on the variation after the last one this party reached
  nextVariation(partyVar);
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
  partyBar = 0xFFFFFFFFUL;
  partyNoteT = millis();
  nextNote(0);
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
  else if (k == "AUTO") {
    autoMode = (n != 0);
    if (autoMode) { refReady = false; ldrDark = false; }   // AUTO:1 re-learns the room light now
    updateLdr();
    followLdr();
  }
  else if (k == "THR")  { thrManual = constrain(n, 0, 4095); updateLdr(); followLdr(); }
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
  setupVariations();
  firstVariation(showVar);
  firstVariation(partyVar);
  analogSetPinAttenuation(PIN_LDR, ADC_11db);   // full 0-3.3 V range on the LDR pin
  updateLdr();
  followLdr();
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

  // 2) Party: the next note when this one ends; a short blink at the end of each note (the last
  //    eighth of it, where the phone's sound also stops), so repeated notes flash separately
  bool partyStepped = false;
  if (partyOn) {
    uint32_t el = now - partyNoteT;
    if (el >= partyNoteMs) {
      partyNoteT += partyNoteMs;   // fixed timeline: short pauses (status replies) never add up to drift
      if (++partyIdx >= songCount) stopParty(true);
      else { nextNote(partyIdx); partyStepped = true; }
    } else if (!partyGap && el >= partyNoteMs - partyNoteMs / 8) {
      partyGap = true;
      state = B_WT;
      applyOutputs();
    }
  }

  // 2b) Show: next step on a fixed timeline, so status replies never delay or drift the beat
  bool showStepped = false;
  if (showOn && now - showT >= SHOW_STEP_MS) {
    showStepped = true;
    showT += SHOW_STEP_MS;
    if (now - showT >= SHOW_STEP_MS) showT = now;   // after a long stall, carry on instead of racing to catch up
    if (++showStep >= PATTERN_STEPS) { showStep = 0; nextVariation(showVar); }   // next bar, next variation
    showFrame();
  }

  // 3) read the LDR 5 times a second, and run Auto mode (works even if the phone disconnects):
  //    dark -> street + building lights on, light -> off
  if (now - ldrT >= 200) {
    ldrT = now;
    if (updateLdr()) statusDue = true;   // tell the app straight away
    if (followLdr()) { applyOutputs(); statusDue = true; }
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
