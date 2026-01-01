/**
 * Content script that runs on typix.app to fetch JWT token.
 * Since this runs in the page context, it can access session cookies.
 */
export default defineContentScript({
  matches: ["https://typix.app/*", "http://localhost/*"],
  runAt: "document_idle",

  async main() {
    console.log("[Typix Auth] Content script loaded on typix.app");

    // Try to fetch token on load
    await fetchAndSendToken();

    // Listen for login events (check periodically)
    setInterval(fetchAndSendToken, 30000); // Check every 30s

    // Listen for messages from background to force refresh
    browser.runtime.onMessage.addListener((msg) => {
      if (msg.type === "REFRESH_TOKEN") {
        fetchAndSendToken();
      }
    });
  },
});

async function fetchAndSendToken() {
  try {
    const response = await fetch("/api/auth/token", {
      method: "GET",
      credentials: "include",
    });

    if (!response.ok) {
      console.log("[Typix Auth] Not logged in or token fetch failed:", response.status);
      return;
    }

    const data = await response.json();
    if (data.token) {
      console.log("[Typix Auth] Token fetched, sending to background");
      await browser.runtime.sendMessage({
        type: "SET_TOKEN",
        token: data.token,
      });
    }
  } catch (e) {
    console.error("[Typix Auth] Error fetching token:", e);
  }
}
