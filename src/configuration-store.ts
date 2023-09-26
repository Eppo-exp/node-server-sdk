import { IConfigurationStore } from '@eppo/js-client-sdk-common';
import { LRUCache } from 'lru-cache';

export interface IEppoConfigurationStore {
  getConfiguration<T>(key: string): T;
  setConfigurations<T>(entries: Record<string, T>): void;
}

/**
 * Default ConfigurationStore implementation. Sets and retrieves entries from an in-memory cache.
 */
export class InMemoryConfigurationStore implements IEppoConfigurationStore {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private cache: LRUCache<string, any>;

  constructor(maxEntries: number) {
    this.cache = new LRUCache({ max: maxEntries });
  }

  getConfiguration<T>(key: string): T {
    return this.cache.get(key) ?? null;
  }

  setConfigurations<T>(entries: Record<string, T>) {
    Object.entries(entries).forEach(([key, val]) => {
      this.cache.set(key, val);
    });
  }
}

export class commonCompatibleConfigurationStore implements IConfigurationStore {
  private store: IEppoConfigurationStore;

  constructor(store: IEppoConfigurationStore) {
    this.store = store;
  }

  get<T>(key: string): T {
    return this.store.getConfiguration(key);
  }

  setEntries<T>(entries: Record<string, T>) {
    this.store.setConfigurations(entries);
  }
}
