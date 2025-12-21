import { createRoot } from "react-dom/client";
import App from "./App";
import { ShadowDOMProvider } from "@/lib/ShadowDOMContext";
import "./styles.css";

export default defineContentScript({
  matches: ["<all_urls>"],
  cssInjectionMode: "ui",

  async main(ctx) {
    console.log("[Lintly] Creating shadow root UI...");

    const ui = await createShadowRootUi(ctx, {
      name: "lintly-ui",
      position: "inline",
      anchor: "body",
      onMount: (container) => {
        console.log("[Lintly] Mounting React app...");
        const root = createRoot(container);
        root.render(
          <ShadowDOMProvider value={container}>
            <App />
          </ShadowDOMProvider>
        );
        console.log("[Lintly] React app rendered");
        return root;
      },
      onRemove: (root) => {
        root?.unmount();
      },
    });

    ui.mount();
    console.log("[Lintly] UI mounted");
  },
});
