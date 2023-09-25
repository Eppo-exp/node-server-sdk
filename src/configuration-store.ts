import { IConfigurationStore } from '@eppo/js-client-sdk-common';
import { LRUCache } from 'lru-cache';

export interface IEppoConfigurationStore<T> {
  getConfiguration<T>(key: string): T;
  setConfigurations<T>(entries: Record<string, T>): void;
}

/**
 * Default ConfigurationStore implementation. Sets and retrieves entries from an in-memory cache.
 */
export class InMemoryConfigurationStore<T> implements IEppoConfigurationStore<T> {
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

export class commonCompatibleConfigurationStore<T> implements IConfigurationStore {
  private store: IEppoConfigurationStore<T>;

  constructor(store: IEppoConfigurationStore<T>) {
    this.store = store;
  }

  get<T>(key: string): T {
    return this.store.getConfiguration(key);
  }

  setEntries<T>(entries: Record<string, T>) {
    this.store.setConfigurations(entries);
  }
}
