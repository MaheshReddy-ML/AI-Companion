# Local speech classification dependencies

Vendored from npm: @ricky0123/vad-web 0.0.30 (ISC) and onnxruntime-web 1.22.0
(MIT). Silero V5 model distributed with vad-web (MIT, Silero Team). Complete
licenses and ONNX Runtime third-party notices are alongside the assets. File
SHA-256 hashes and package versions are in manifest.json.

Only the browser/WASM build, audio worklet and V5 model are included. Lazy-loaded
when the user starts talking. Audio classification runs on-device with one WASM
thread. No raw audio is uploaded by this detector; Web Speech transcription
still follows the browser's own speech-service behavior.

Upstream:
- https://github.com/ricky0123/vad
- https://github.com/snakers4/silero-vad
- https://github.com/microsoft/onnxruntime/tree/v1.22.0/js/web
