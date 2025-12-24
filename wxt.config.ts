import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  manifest: {
    permissions: ["offscreen", "activeTab", "storage"],
    host_permissions: ["<all_urls>", "https://vllm.kernelvm.xyz/*"],
  },
  modules: ["@wxt-dev/module-react"],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
