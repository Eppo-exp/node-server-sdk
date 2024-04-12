import { IConfigurationStore } from '@eppo/js-client-sdk-common';
import { LRUCache } from 'lru-cache';

/**
 * Default ConfigurationStore implementation. Sets and retrieves entries from an in-memory cache.
 */
export class InMemoryConfigurationStore implements IConfigurationStore {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private cache: LRUCache<string, any>;

  constructor(maxEntries: number) {
    this.cache = new LRUCache({ max: maxEntries });
  }

  isInitialized(): boolean {
    return !!this.cache;
  }

  get<T>(key: string): T {
    return this.cache.get(key) ?? null;
  }

  getKeys(): string[] {
    // Splay because keys() returns a generator.
    return [...this.cache.keys()];
  }

  setEntries<T>(entries: Record<string, T>) {
    Object.entries(entries).forEach(([key, val]) => {
      this.cache.set(key, val);
    });
  }
}
