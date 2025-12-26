import { createRoot } from "react-dom/client";
import { Provider as JotaiProvider } from "jotai";
import App from "./App";
import { ShadowDOMProvider } from "@/lib/ShadowDOMContext";
import { cleanupMirrorCache, setMirrorHost } from "@/lib/textPositioning";
import "./styles.css";

export default defineContentScript({
  matches: ["<all_urls>"],
  allFrames: true,
  matchAboutBlank: true,
  cssInjectionMode: "ui",

  async main(ctx) {
    console.log("[Typix] Creating shadow root UI...");

    const ui = await createShadowRootUi(ctx, {
      name: "typix-ui",
      position: "inline",
      anchor: "body",
      onMount: (container) => {
        console.log("[Typix] Mounting React app...");
        setMirrorHost(container);
        const root = createRoot(container);
        root.render(
          <ShadowDOMProvider value={container}>
            <JotaiProvider>
              <App />
            </JotaiProvider>
          </ShadowDOMProvider>
        );
        console.log("[Typix] React app rendered");
        return root;
      },
      onRemove: (root) => {
        root?.unmount();
        setMirrorHost(null);
        cleanupMirrorCache();
      },
    });

    ui.mount();
    console.log("[Typix] UI mounted");
  },
});
