# Smart City additions

## User-facing changes
- Expand Bluetooth diagnostics with recent device replies and recovery steps tailored to browser, connection, and protocol status.
- Add an in-app page for the supplied interactive 3D model, reachable from the control dashboard.
- Add the supplied description audio with playback and a Bluetooth karaoke output option where supported.
- Embed the provided Smart City Voice Agent link, with a full-page fallback and clear audio-routing guidance.

## Technical details
- Keep diagnostics on the existing transport callbacks and retain replies/errors only for the current page session.
- Serve the uploaded model as a sandboxed iframe and localize its Three.js script dependency; do not allow it to access the parent app.
- Add the MP3 using the project asset flow. Route the audio element to a selected output only where browser APIs allow; voice-agent audio remains controlled by browser/system output routing.
- Add route-specific metadata for the model page and verify behavior in the preview and existing tests.
