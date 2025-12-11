import { defineConfig } from "wxt";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  manifest: {
    permissions: ["offscreen", "activeTab"],
    host_permissions: ["<all_urls>"],
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
    web_accessible_resources: [
      {
        resources: ["wasm/*"],
        matches: ["<all_urls>"],
      },
    ],
  },
  vite: () => ({
    plugins: [
      viteStaticCopy({
        targets: [
          {
            src: "node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm",
            dest: "wasm",
          },
          {
            src: "node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs",
            dest: "wasm",
          },
        ],
      }),
    ],
    optimizeDeps: {
      exclude: ["onnxruntime-web", "@huggingface/transformers"],
    },
  }),
});
