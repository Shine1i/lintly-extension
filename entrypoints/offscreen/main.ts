import { pipeline, env } from "@huggingface/transformers";

env.allowLocalModels = false;
env.backends.onnx.wasm.wasmPaths = browser.runtime.getURL("wasm/");
env.backends.onnx.wasm.numThreads = navigator.hardwareConcurrency || 4;

const hasWebGPU = !!navigator.gpu;
let generator: any = null;
let loading: Promise<void> | null = null;

async function getGenerator() {
  if (generator) return generator;
  if (loading) {
    await loading;
    return generator;
  }

  loading = (async () => {
    generator = await pipeline("text-generation", "onnx-community/LFM2-700M-ONNX", {
      dtype: "q4",
      device: hasWebGPU ? "webgpu" : "wasm",
    });
  })();

  await loading;
  return generator;
}

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== "offscreen") return;

  if (message.type === "GENERATE") {
    handleGenerate(message.text)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: String(err) }));
    return true;
  }

  if (message.type === "GET_STATUS") {
    sendResponse({ ready: generator !== null });
  }
});

async function handleGenerate(text: string) {
  const gen = await getGenerator();
  const messages = [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: text },
  ];

  const output = await gen(messages, { max_new_tokens: 128, do_sample: false });
  return { success: true, result: output[0].generated_text.at(-1).content };
}
