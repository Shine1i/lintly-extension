import type { IssueWithPosition } from "./types";

interface StoredAnalysis {
  text: string;
  issues: IssueWithPosition[];
  timestamp: number;
}

interface StorageData {
  [pageUrl: string]: {
    [elementId: string]: StoredAnalysis;
  };
}

const STORAGE_KEY = "lintly_analysis";
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function saveAnalysis(
  pageUrl: string,
  elementId: string,
  text: string,
  issues: IssueWithPosition[]
): Promise<void> {
  try {
    const result = await browser.storage.session.get(STORAGE_KEY);
    const data: StorageData = result[STORAGE_KEY] || {};

    if (!data[pageUrl]) {
      data[pageUrl] = {};
    }

    data[pageUrl][elementId] = {
      text,
      issues,
      timestamp: Date.now(),
    };

    await browser.storage.session.set({ [STORAGE_KEY]: data });
  } catch (err) {
    console.error("Failed to save analysis:", err);
  }
}

export async function loadAnalysis(
  pageUrl: string,
  elementId: string
): Promise<StoredAnalysis | null> {
  try {
    const result = await browser.storage.session.get(STORAGE_KEY);
    const data: StorageData = result[STORAGE_KEY] || {};

    const analysis = data[pageUrl]?.[elementId];
    if (!analysis) return null;

    if (Date.now() - analysis.timestamp > MAX_AGE_MS) {
      await clearAnalysis(pageUrl, elementId);
      return null;
    }

    return analysis;
  } catch (err) {
    console.error("Failed to load analysis:", err);
    return null;
  }
}

export async function clearAnalysis(pageUrl: string, elementId: string): Promise<void> {
  try {
    const result = await browser.storage.session.get(STORAGE_KEY);
    const data: StorageData = result[STORAGE_KEY] || {};

    if (data[pageUrl]) {
      delete data[pageUrl][elementId];
      if (Object.keys(data[pageUrl]).length === 0) {
        delete data[pageUrl];
      }
      await browser.storage.session.set({ [STORAGE_KEY]: data });
    }
  } catch (err) {
    console.error("Failed to clear analysis:", err);
  }
}

export async function cleanupOldAnalyses(): Promise<void> {
  try {
    const result = await browser.storage.session.get(STORAGE_KEY);
    const data: StorageData = result[STORAGE_KEY] || {};
    const now = Date.now();
    let changed = false;

    for (const pageUrl of Object.keys(data)) {
      for (const elementId of Object.keys(data[pageUrl])) {
        if (now - data[pageUrl][elementId].timestamp > MAX_AGE_MS) {
          delete data[pageUrl][elementId];
          changed = true;
        }
      }
      if (Object.keys(data[pageUrl]).length === 0) {
        delete data[pageUrl];
      }
    }

    if (changed) {
      await browser.storage.session.set({ [STORAGE_KEY]: data });
    }
  } catch (err) {
    console.error("Failed to cleanup old analyses:", err);
  }
}
