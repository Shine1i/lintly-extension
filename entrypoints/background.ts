let creatingOffscreen: Promise<void> | null = null;

async function setupOffscreen() {
  // @ts-expect-error: MV3 only API
  const contexts = await browser.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
  if (contexts.length > 0) return;

  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }

  // @ts-expect-error: MV3 only API
  creatingOffscreen = browser.offscreen.createDocument({
    url: "/offscreen.html",
    reasons: ["WORKERS"],
    justification: "Run Transformers.js model inference",
  });
  await creatingOffscreen;
  creatingOffscreen = null;
  await new Promise((r) => setTimeout(r, 100));
}

async function sendToOffscreen(message: any) {
  await setupOffscreen();
  for (let i = 0; i < 3; i++) {
    try {
      return await browser.runtime.sendMessage(message);
    } catch (err) {
      if (i === 2) throw err;
      await new Promise((r) => setTimeout(r, 200));
    }
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "PROCESS_TEXT") {
      sendToOffscreen({ target: "offscreen", type: "GENERATE", text: message.text })
        .then(sendResponse)
        .catch((err) => sendResponse({ success: false, error: String(err) }));
      return true;
    }

    if (message.type === "GET_STATUS") {
      sendToOffscreen({ target: "offscreen", type: "GET_STATUS" })
        .then(sendResponse)
        .catch(() => sendResponse({ ready: false }));
      return true;
    }
  });

  setupOffscreen();
});
