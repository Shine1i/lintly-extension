const ONBOARDING_API = "https://typix.app/api/onboarding/status";

export async function checkOnboardingStatus(): Promise<boolean> {
  try {
    const { onboardingComplete } = await browser.storage.local.get("onboardingComplete");
    if (onboardingComplete) return true;

    const res = await fetch(ONBOARDING_API, { credentials: "include" });
    if (!res.ok) return false;

    const { completed } = await res.json();
    if (completed) {
      await browser.storage.local.set({ onboardingComplete: true });
    }
    return completed;
  } catch {
    return false;
  }
}

export async function clearOnboardingStatus(): Promise<void> {
  await browser.storage.local.remove("onboardingComplete");
}
