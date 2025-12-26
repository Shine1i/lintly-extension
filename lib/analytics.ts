export type AnalyticsEvent =
  | "bulk_offer_shown"
  | "bulk_offer_dismissed"
  | "bulk_accept"
  | "bulk_undo";

export function trackEvent(event: AnalyticsEvent, payload?: Record<string, unknown>) {
  const details = payload ? JSON.stringify(payload) : "";
  // Lightweight stub so we can wire real analytics later.
  console.log(`[Typix Analytics] ${event} ${details}`);
}
