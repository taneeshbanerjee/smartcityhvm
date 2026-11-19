# Smartcityhvm

Build "SmartCity Control", a mobile-first installable PWA that controls an ESP32 smart-city model over Bluetooth Low Energy using Web Bluetooth. Use React + TypeScript + Tailwind. No backend, no login, no database. Fully self-contained and error-free: avoid TypeScript errors by typing navigator.bluetooth as any or adding @types/web-bluetooth.



ORGANIZATION: define one constant ORG_NAME = "Hariyana Vidya Mandir" and use it everywhere the organization name appears (header, footer, splash, manifest).



LOGO: A logo image is attached to this prompt (an oval badge with a blue border, white background, red flame, open book, and Sanskrit text). Use it exactly as provided: do not redraw, recolour or distort it. Save it as /public/logo.png. Use it in the header (about 44px tall, next to the name), on a short splash screen at startup, as the favicon, and for the PWA icons. Create square 192x192 and 512x512 PNG icons by centring the logo with padding on a white rounded square, plus a maskable 512 version with the logo inside the central 60% safe zone. Take the app's accent colours from the logo (royal blue, flame red/orange, warm white).



UI

- Header: logo, ORG_NAME (small) and "Smart City Control Center" (large).

- Modern dashboard, big touch-friendly buttons, rounded cards, smooth animations, light/dark theme with a toggle, lucide-react icons.

- Connection chip: Disconnected / Connecting / Connected with the device name.

- Cards: Lighting (Street lights, Building lights, Green status LEDs, Red beacons), Power (one Wind turbines switch; the model has no water turbine), Sensors (LDR day/night gauge), Scenes (Day, Night, Eco, Show), AI Control Plan, Party Mode, Auto Mode toggle with a light-threshold slider, and a red "ALL OFF" button.

- Activity log drawer with recent commands and replies. Footer: "Project by " + ORG_NAME.



BLUETOOTH (Nordic UART service)

- Service 6e400001-b5a3-f393-e0a9-e50e24dcca9e; write characteristic 6e400002-b5a3-f393-e0a9-e50e24dcca9e; notify characteristic 6e400003-b5a3-f393-e0a9-e50e24dcca9e.

- Connect button (user gesture) uses requestDevice with filters namePrefix "HVM-SmartCity" and that service, with optionalServices set. Offer "Show all devices" as a fallback.

- Send newline-terminated commands: SL:1/0, BL:1/0, GR:1/0, RD:1/0, WT:1/0 (wind turbines: both L298N motor outputs together), AUTO:1/0, THR:<0-4095>, ALL:0, SCENE:day|night|eco|show, SHOW:0 (stop the show), GET, and for party mode MB:<bpm>, MA:<notes>, MP:1/0.

- Receive status lines like ST:SL=1,BL=0,GR=1,RD=0,WT=1,AUTO=1,MU=0,SH=0;LDR=732 (MU=1 while party music plays, SH=1 while the show runs). Buffer incoming chunks until a newline, then parse; ignore malformed lines safely.

- Use a sequential write queue (avoid "GATT operation already in progress"), prefer writeValueWithoutResponse, fall back to writeValue.

- Auto-reconnect up to 3 times on disconnect. Disable controls while disconnected. Friendly toasts for cancelled pairing, unsupported browser, Bluetooth off.

- If Web Bluetooth is unsupported (iPhone, Firefox), show a clear message and offer a "Demo mode" that simulates the ESP32 so the whole UI still works.



AUTOMATION

- Auto Mode runs on the ESP32 (lights follow the LDR threshold), so it keeps working if the phone disconnects.

- Show scene: a stage light show run by the ESP32 itself (no Bluetooth latency) at 128 BPM, 10 patterns of chases, strobes and flashes with the turbines spinning, looping until Stop show (which restores the city).

- Party mode: a 1-minute song (composed by Lovable AI, or the built-in composer) plays on the ESP32 buzzer while the lights change every bar; the city is restored afterwards.



VOICE

- Mic button using SpeechRecognition/webkitSpeechRecognition, lang "en-IN", hidden if unsupported. Understand "street lights on", "night mode", "start the turbines", "turn off wind turbine", "all off", "show mode". Reply with speechSynthesis (en-IN), show the transcript, and handle mic-permission errors and the need for internet.



PWA

- manifest.webmanifest (name "SmartCity Control", short_name "SmartCity", standalone, start_url "/", theme colours from the logo, the icons above), a service worker caching the app shell for offline use, all assets bundled locally. Works over HTTPS.

## ESP32 wiring and firmware

The firmware is `public/esp32-code/HVM_SmartCity_ESP32.ino` (also on the app's **ESP32 code** page). Board: **ESP32 Dev Module**, ESP32 Arduino core 2.0.x or 3.x; no extra libraries. Pins follow `circuit_diagram.pdf`. The model has no water turbine: the single `WT` (Wind turbines) command drives both motor channels together, so the fans spin whichever L298N output they are wired to.

| Part | ESP32 pin |
|---|---|
| Street lights (white LED) | D13 |
| Building lights (yellow LED) | D12 |
| Green status LED | D14 |
| Red beacon LED | D15 |
| Wind turbines, motor channel 1 (L298N IN1 / IN2) | D27 / D26 |
| Wind turbines, motor channel 2 (L298N IN3 / IN4) | D25 / D33 |
| LDR (3V3 → LDR → D32 → resistor → GND) | D32 |
| Party buzzer (passive; + via 100 Ω) | D23 |

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://smartcityhvm.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/c6b870eb-4347-471a-afe8-8b74d34cd822).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
