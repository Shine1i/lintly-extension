export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    document.addEventListener("keydown", async (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "Y") {
        e.preventDefault();
        const text = window.getSelection()?.toString().trim();
        if (!text) return;

        try {
          const response = await browser.runtime.sendMessage({ type: "PROCESS_TEXT", text });
          if (response?.success) {
            console.log("[LLM Response]", response.result);
          } else {
            console.error("[LLM Error]", response?.error);
          }
        } catch (err) {
          console.error("[LLM Error]", err);
        }
      }
    });
  },
});
