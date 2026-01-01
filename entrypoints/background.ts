import type { ProcessRequest, OffscreenMessage, FeedbackMessage } from "@/lib/types";
import { ExtensionQueryClient } from "@/lib/cache";

const FEEDBACK_URL = "https://vllm.kernelvm.xyz/v1/feedback";

const queryClient = new ExtensionQueryClient({
  defaultStaleTime: Infinity, // ML outputs are deterministic
});

// Token management - received from content script on typix.app
let cachedToken: { token: string; expiresAt: number } | null = null;

function setToken(token: string) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    cachedToken = {
      token,
      expiresAt: (payload.exp || 0) * 1000,
    };
  } catch {
    // Invalid token format - ignore
  }
}

function getToken(): string | null {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cachedToken.token;
  }
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  browser.runtime.onMessage.addListener((msg: any, _, respond) => {
    // Handle token from content script on typix.app
    if (msg.type === "SET_TOKEN" && msg.token) {
      setToken(msg.token);
      respond({ success: true });
      return true;
    }

    // Handle feedback submission
    if (msg.type === "SUBMIT_FEEDBACK") {
      const token = getToken();
      console.log("[Feedback] token:", !!token, "requestId:", msg.requestId);
      if (!token || !msg.requestId) {
        console.log("[Feedback] Missing token or requestId, skipping");
        respond({ success: false, error: "Missing token or requestId" });
        return true;
      }

      console.log("[Feedback] Sending to", FEEDBACK_URL);
      fetch(FEEDBACK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          request_id: msg.requestId,
          accepted: msg.accepted,
          user_edit: msg.userEdit,
          issue_count: msg.issueCount,
        }),
      })
        .then((res) => {
          console.log("[Feedback] Response status:", res.status);
          return res.json();
        })
        .then((data) => {
          console.log("[Feedback] Response data:", data);
          respond({ success: data.success });
        })
        .catch((err) => {
          console.error("[Feedback] Error:", err);
          respond({ success: false });
        });
      return true;
    }

    if (msg.type === "PROCESS_TEXT") {
      const token = getToken();
      const offscreenMsg: OffscreenMessage = {
        target: "offscreen",
        type: "GENERATE",
        action: msg.action,
        text: msg.text,
        token: token || undefined,
        options: msg.options,
      };

      queryClient.fetch({
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
