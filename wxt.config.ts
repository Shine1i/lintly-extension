import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  manifest: {
    name: "Typix",
    description:
      "AI-powered writing assistant that fixes grammar, spelling, and style as you type across your favorite websites.",
    icons: {
      16: "icon/icon16.png",
      32: "icon/icon32.png",
      48: "icon/icon48.png",
      128: "icon/icon128.png",
      432: "icon/icon432.png",
    },
    web_accessible_resources: [
      {
        resources: ["icon/*", "imgs/*"],
        matches: ["<all_urls>"],
      },
    ],
    permissions: ["offscreen", "activeTab", "storage"],
    host_permissions: ["<all_urls>", "https://vllm.kernelvm.xyz/*"],
  },
  modules: ["@wxt-dev/module-react"],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
