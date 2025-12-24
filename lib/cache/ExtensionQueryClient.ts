import { browser } from "wxt/browser";
import type { CacheEntry, QueryClientConfig, QueryKey, QueryOptions } from "./types";
import { fromStorageKey, hashQueryKey, keyMatchesPrefix, toStorageKey } from "./utils";

const DEFAULT_STALE_TIME = 1000 * 60 * 5; // 5 minutes
const DEFAULT_KEY_PREFIX = "query:";

export class ExtensionQueryClient {
  private config: Required<QueryClientConfig>;
  private inFlight = new Map<string, Promise<unknown>>();

  constructor(config: QueryClientConfig = {}) {
    this.config = {
      defaultStaleTime: config.defaultStaleTime ?? DEFAULT_STALE_TIME,
      keyPrefix: config.keyPrefix ?? DEFAULT_KEY_PREFIX,
    };
  }

  /**
   * Fetch data with caching, deduplication, and staleness checking
   */
  async fetch<T>(options: QueryOptions<T>): Promise<T> {
    const hashedKey = hashQueryKey(options.queryKey);
    const storageKey = toStorageKey(hashedKey, this.config.keyPrefix);
    const staleTime = options.staleTime ?? this.config.defaultStaleTime;

    // Check for in-flight request (deduplication)
    const existing = this.inFlight.get(storageKey);
    if (existing) {
      return existing as Promise<T>;
    }

    // Check cache
    const cached = await this.getFromCache<T>(storageKey);
    if (cached) {
      const age = Date.now() - cached.timestamp;
      if (age < staleTime) {
        return cached.data;
      }
    }

    // Execute query function with deduplication
    const promise = this.executeQuery(storageKey, options.queryFn);
    this.inFlight.set(storageKey, promise);

    try {
      const result = await promise;
      return result;
    } finally {
      this.inFlight.delete(storageKey);
    }
  }

  /**
   * Prefetch data into cache without waiting
   */
  prefetch<T>(options: QueryOptions<T>): void {
    this.fetch(options).catch(() => {
      // Silently ignore prefetch errors
    });
  }

  /**
   * Invalidate cache entries matching the query key or prefix
   */
  async invalidate(queryKey: QueryKey): Promise<void> {
    const allData = await browser.storage.session.get(null);
    const keysToRemove: string[] = [];

    for (const storageKey of Object.keys(allData)) {
      const hashedKey = fromStorageKey(storageKey, this.config.keyPrefix);
      if (hashedKey && keyMatchesPrefix(hashedKey, queryKey)) {
        keysToRemove.push(storageKey);
      }
    }

    if (keysToRemove.length > 0) {
      await browser.storage.session.remove(keysToRemove);
    }
  }

  /**
   * Clear all cached data
   */
  async clear(): Promise<void> {
    const allData = await browser.storage.session.get(null);
    const keysToRemove = Object.keys(allData).filter((key) =>
      key.startsWith(this.config.keyPrefix)
    );

    if (keysToRemove.length > 0) {
      await browser.storage.session.remove(keysToRemove);
    }
  }

  /**
   * Get cached data directly (without fetching)
   */
  async getCached<T>(queryKey: QueryKey): Promise<T | undefined> {
    const hashedKey = hashQueryKey(queryKey);
    const storageKey = toStorageKey(hashedKey, this.config.keyPrefix);
    const cached = await this.getFromCache<T>(storageKey);
    return cached?.data;
  }

  /**
   * Set cached data directly
   */
  async setCache<T>(queryKey: QueryKey, data: T): Promise<void> {
    const hashedKey = hashQueryKey(queryKey);
    const storageKey = toStorageKey(hashedKey, this.config.keyPrefix);
    await this.saveToCache(storageKey, data);
  }

  private async getFromCache<T>(storageKey: string): Promise<CacheEntry<T> | null> {
    const result = await browser.storage.session.get(storageKey);
    const entry = result[storageKey] as CacheEntry<T> | undefined;
    return entry ?? null;
  }

  private async saveToCache<T>(storageKey: string, data: T): Promise<void> {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
    };
    await browser.storage.session.set({ [storageKey]: entry });
  }

  private async executeQuery<T>(
    storageKey: string,
    queryFn: () => Promise<T>
  ): Promise<T> {
    const data = await queryFn();
    await this.saveToCache(storageKey, data);
    return data;
  }
}
