import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";
import { version } from "./package.json";

export default defineConfig({
  manifest: {
    name: "Typix",
    version,
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
    host_permissions: [
      "<all_urls>",
      "http://192.168.0.147:8003/*",
      "https://typix.app/*",
    ],
  },
  modules: ["@wxt-dev/module-react"],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
