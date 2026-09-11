const ROOT = "/static/vendor/meet-vad/";
let runtime;
function script(name) {
  return new Promise((resolve, reject) => {
    const element = document.createElement("script");
    element.src = ROOT + name;
    element.onload = resolve;
    element.onerror = () => { element.remove(); reject(new Error("Local voice detector could not load.")); };
    document.head.append(element);
  });
}
export async function createMeetVAD({ stream, audioContext, onStart, onEnd, onFrame }) {
  runtime ||= (async () => {
    await script("ort.wasm.min.js");
    // One CPU thread avoids cross-origin isolation and keeps mobile use bounded.
    window.ort.env.wasm.numThreads = 1;
    window.ort.env.wasm.proxy = false;
    await script("bundle.min.js");
  })().catch(error => { runtime = null; throw error; });
  await runtime;
  const detector = await window.vad.MicVAD.new({
    model: "v5", audioContext, startOnLoad: false,
    baseAssetPath: ROOT, onnxWASMBasePath: ROOT,
    getStream: async () => stream,
    pauseStream: async () => {},
    resumeStream: async () => stream,
    positiveSpeechThreshold: 0.65, negativeSpeechThreshold: 0.35,
    minSpeechMs: 192, redemptionMs: 640, preSpeechPadMs: 320,
    submitUserSpeechOnPause: false,
    onSpeechRealStart: onStart,
    onSpeechEnd: () => onEnd(),
    onVADMisfire: () => onEnd(),
    onFrameProcessed: probabilities => onFrame(probabilities.isSpeech),
  });
  try {
    await detector.start();
    return detector;
  } catch (error) {
    // Pinned vad-web's destroy() expects initialized audio nodes. If startup
    // failed earlier, release the already-loaded inference session directly.
    await detector.destroy().catch(() => detector.model?.release?.());
    throw error;
  }
}
