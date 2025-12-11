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
    justification: "Run Transformers.js inference",
  });
  await creating;
  creating = null;
  await new Promise((r) => setTimeout(r, 100));
}

async function sendToOffscreen(msg: any) {
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
  browser.runtime.onMessage.addListener((msg, _, respond) => {
    if (msg.type === "PROCESS_TEXT") {
      sendToOffscreen({ target: "offscreen", type: "GENERATE", text: msg.text })
        .then(respond)
        .catch((e) => respond({ success: false, error: String(e) }));
      return true;
    }
  });
  setupOffscreen();
});
