import type { ProcessRequest, OffscreenMessage } from "@/lib/types";
import { ExtensionQueryClient } from "@/lib/cache";

const queryClient = new ExtensionQueryClient({
  defaultStaleTime: Infinity, // ML outputs are deterministic
});

let creating: Promise<void> | null = null;

async function setupOffscreen() {
  const contexts = await browser.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
  if (contexts.length > 0) return;
  if (creating) return creating;

  creating = browser.offscreen.createDocument({
    url: "/offscreen.html",
    reasons: ["WORKERS"],
    justification: "Run AI inference via API",
  });
  await creating;
  creating = null;
  await new Promise((r) => setTimeout(r, 100));
}

async function sendToOffscreen(msg: OffscreenMessage) {
  await setupOffscreen();
  for (let i = 0; i < 3; i++) {
    try {
      return await browser.runtime.sendMessage(msg);
    } catch (e) {
      if (i === 2) throw e;
      await new Promise((r) => setTimeout(r, 200));
    }
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg: ProcessRequest, _, respond) => {
    if (msg.type === "PROCESS_TEXT") {
      const offscreenMsg: OffscreenMessage = {
        target: "offscreen",
        type: "GENERATE",
        action: msg.action,
        text: msg.text,
        options: msg.options,
      };

      queryClient
        .fetch({
          queryKey: [
            "model",
            msg.action,
            msg.text,
            msg.options?.tone,
            msg.options?.customInstruction,
          ],
          queryFn: () => sendToOffscreen(offscreenMsg),
        })
        .then(respond)
        .catch((e) => respond({ success: false, error: String(e) }));
      return true;
    }
  });
  setupOffscreen();
});
