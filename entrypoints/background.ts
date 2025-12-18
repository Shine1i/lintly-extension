import type { ProcessRequest, BackgroundAnalyzeRequest, OffscreenMessage } from "@/lib/types";

type ContentMessage = ProcessRequest | BackgroundAnalyzeRequest;

let creating: Promise<void> | null = null;

async function setupOffscreen() {
  // @ts-expect-error: MV3 API
  const contexts = await browser.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
  if (contexts.length > 0) return;
  if (creating) return creating;

  // @ts-expect-error: MV3 API
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
  browser.runtime.onMessage.addListener((msg: ContentMessage, _, respond) => {
    if (msg.type === "PROCESS_TEXT") {
      sendToOffscreen({
        target: "offscreen",
        type: "GENERATE",
        action: msg.action,
        text: msg.text,
        options: msg.options,
      })
        .then(respond)
        .catch((e) => respond({ success: false, error: String(e) }));
      return true;
    }

    if (msg.type === "BACKGROUND_ANALYZE") {
      sendToOffscreen({
        target: "offscreen",
        type: "GENERATE",
        action: "ANALYZE",
        text: msg.text,
      })
        .then((result) => {
          respond({
            success: true,
            elementId: msg.elementId,
            issues: result?.result?.issues || [],
          });
        })
        .catch((e) => respond({ success: false, elementId: msg.elementId, error: String(e) }));
      return true;
    }
  });
  setupOffscreen();
});
