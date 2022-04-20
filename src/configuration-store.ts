import * as NodeCache from 'node-cache';

export interface IConfigurationStore<T> {
  getConfiguration(key: string): T;
  setConfigurations(configs: Record<string, T>): void;
}

/**
 * Default ConfigurationStore implementation. Sets and retrieves entries from an in-memory cache.
 */
export class InMemoryConfigurationStore<T> implements IConfigurationStore<T> {
  private cache: NodeCache;
  constructor(ttlMilliseconds: number) {
    this.cache = new NodeCache({ stdTTL: ttlMilliseconds / 1000 }); // divide by 1000 because NodeCache uses seconds
  }

  getConfiguration(key: string): T {
    return this.cache.get<T>(key);
  }

  setConfigurations(configs: Record<string, T>) {
    const cacheEntries: NodeCache.ValueSetItem<T>[] = Object.entries(configs).map(([key, val]) => ({
      key,
      val,
    }));
    this.cache.mset(cacheEntries);
  }
}
