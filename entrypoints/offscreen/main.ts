import { pipeline, env } from "@huggingface/transformers";

env.allowLocalModels = false;
env.backends.onnx.wasm.wasmPaths = browser.runtime.getURL("wasm/");
env.backends.onnx.wasm.numThreads = navigator.hardwareConcurrency || 4;

let generator: any = null;
let loading: Promise<void> | null = null;

async function getGenerator() {
  if (generator) return generator;
  if (loading) { await loading; return generator; }

  loading = (async () => {
    generator = await pipeline("text-generation", "onnx-community/LFM2-700M-ONNX", {
      dtype: "q4",
      device: navigator.gpu ? "webgpu" : "wasm",
    });
  })();
  await loading;
  return generator;
}

browser.runtime.onMessage.addListener((msg, _, respond) => {
  if (msg.target !== "offscreen" || msg.type !== "GENERATE") return;

  getGenerator()
    .then((gen) => gen([
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: msg.text },
    ], { max_new_tokens: 128, do_sample: false }))
    .then((out: any) => respond({ success: true, result: out[0].generated_text.at(-1).content }))
    .catch((e: any) => respond({ success: false, error: String(e) }));
  return true;
});
