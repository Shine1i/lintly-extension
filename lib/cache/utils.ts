import type { QueryKey } from "./types";

/**
 * Serialize a query key to a stable string for storage
 */
export function hashQueryKey(key: QueryKey): string {
  if (typeof key === "string") {
    return key;
  }
  return key
    .map((part) => {
      if (part === undefined || part === null) return "";
      if (typeof part === "string") return part;
      if (typeof part === "number" || typeof part === "boolean") {
        return String(part);
      }
      return JSON.stringify(part);
    })
    .filter(Boolean)
    .join(":");
}

/**
 * Check if a stored key matches a query key prefix
 * Used for prefix-based invalidation
 */
export function keyMatchesPrefix(storedKey: string, prefix: QueryKey): boolean {
  const prefixStr = hashQueryKey(prefix);
  return storedKey === prefixStr || storedKey.startsWith(prefixStr + ":");
}

/**
 * Generate a storage key with prefix
 */
export function toStorageKey(hashedKey: string, prefix: string): string {
  return `${prefix}${hashedKey}`;
}

/**
 * Extract the hashed key from a storage key
 */
export function fromStorageKey(
  storageKey: string,
  prefix: string
): string | null {
  if (!storageKey.startsWith(prefix)) return null;
  return storageKey.slice(prefix.length);
}
