import { ExtensionQueryClient } from "@/lib/cache";
import { processText, submitFeedback } from "@/lib/api";

const queryClient = new ExtensionQueryClient({
  defaultStaleTime: 1000 * 60 * 5,
});

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === "install") {
      const baseUrl =
        import.meta.env.MODE === "production"
          ? "https://typix.app"
          : "https://typix.app";

      await browser.tabs.create({
        url: `${baseUrl}/signup`,
      });
    }
  });

  browser.runtime.onMessage.addListener((msg: any, _, respond) => {
    if (msg.type === "SUBMIT_FEEDBACK") {
      if (!msg.requestId) {
        respond({ success: false, error: "Missing requestId" });
        return true;
      }

      submitFeedback(msg.requestId, msg.issueCount)
        .then((success) => respond({ success }))
        .catch(() => respond({ success: false }));
      return true;
    }

    if (msg.type === "PROCESS_TEXT") {
      queryClient
        .fetch({
          queryKey: [
            "model",
            msg.action,
            msg.text,
            msg.options?.tone,
            msg.options?.customInstruction,
          ],
          queryFn: () =>
            processText(msg.action, msg.text, msg.options, {
              sessionId: msg.sessionId,
              editorKind: msg.editorKind,
              editorSignature: msg.editorSignature,
              pageUrl: msg.pageUrl,
            }),
        })
        .then(({ result, requestId }) => {
          console.log("[background] Sending to content, requestId:", requestId);
          respond({ success: true, result, requestId });
        })
        .catch((e) => respond({ success: false, error: String(e) }));
      return true;
    }
  });
});
