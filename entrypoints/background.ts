import type { ProcessRequest, OffscreenMessage } from "@/lib/types";
import { ExtensionQueryClient } from "@/lib/cache";

const TYPIX_API_URL = "https://typix.app";

const queryClient = new ExtensionQueryClient({
  defaultStaleTime: Infinity, // ML outputs are deterministic
});

// Token management
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string | null> {
  // Return cached token if still valid (with 5 min buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cachedToken.token;
  }

  try {
    const response = await fetch(`${TYPIX_API_URL}/api/auth/token`, {
      method: "GET",
      credentials: "include",
    });

    if (!response.ok) {
      console.log("[Typix] Token fetch failed:", response.status);
      cachedToken = null;
      return null;
    }

    const data = await response.json();
    if (data.token) {
      // JWT expiration is typically in the token, parse it
      const payload = JSON.parse(atob(data.token.split(".")[1]));
      cachedToken = {
        token: data.token,
        expiresAt: (payload.exp || 0) * 1000,
      };
      console.log("[Typix] Token fetched successfully");
      return data.token;
    }
  } catch (e) {
    console.error("[Typix] Token fetch error:", e);
  }

  cachedToken = null;
  return null;
}

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
      const response = await browser.runtime.sendMessage(msg);
      if (response && !response.success) {
        throw new Error(response.error || "Unknown offscreen error");
      }
      return response;
    } catch (e) {
      if (i === 2) throw e;
      await new Promise((r) => setTimeout(r, 200));
    }
  }
}

export default defineBackground(() => {
  // Open onboarding on first install
  browser.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === "install") {
      await browser.tabs.create({
        url: "http://localhost:3000/signup",
      });
    }
  });

  browser.runtime.onMessage.addListener((msg: ProcessRequest, _, respond) => {
    if (msg.type === "PROCESS_TEXT") {
      // Get token first, then send to offscreen
      getToken().then((token) => {
        const offscreenMsg: OffscreenMessage = {
          target: "offscreen",
          type: "GENERATE",
          action: msg.action,
          text: msg.text,
          token: token || undefined,
          options: msg.options,
        };

        return queryClient.fetch({
          queryKey: [
            "model",
            msg.action,
            msg.text,
            msg.options?.tone,
            msg.options?.customInstruction,
          ],
          queryFn: () => sendToOffscreen(offscreenMsg),
        });
      })
        .then(respond)
        .catch((e) => respond({ success: false, error: String(e) }));
      return true;
    }
  });
  setupOffscreen();
});
