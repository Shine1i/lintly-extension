export type QueryKey = string | readonly unknown[];

export interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
}

export interface QueryOptions<T> {
  queryKey: QueryKey;
  queryFn: () => Promise<T>;
  staleTime?: number;
}

export interface QueryClientConfig {
  defaultStaleTime?: number;
  keyPrefix?: string;
}
