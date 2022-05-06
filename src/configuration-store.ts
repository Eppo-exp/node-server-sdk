import * as LRUCache from 'lru-cache';

export interface IConfigurationStore<T> {
  getConfiguration(key: string): T;
  setConfigurations(configs: Record<string, T>): void;
}

/**
 * Default ConfigurationStore implementation. Sets and retrieves entries from an in-memory cache.
 */
export class InMemoryConfigurationStore<T> implements IConfigurationStore<T> {
  private cache: LRUCache<string, T>;
  constructor(maxEntries: number) {
    this.cache = new LRUCache({ max: maxEntries });
  }

  getConfiguration(key: string): T {
    return this.cache.get<T>(key);
  }

  setConfigurations(configs: Record<string, T>) {
    Object.entries(configs).forEach(([key, val]) => {
      this.cache.set(key, val);
    });
  }
}
