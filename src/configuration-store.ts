import * as NodeCache from 'node-cache';

export interface IConfigurationStore<T> {
  getConfiguration(key: string): Promise<T>;
  setConfigurations(configs: Record<string, T>): Promise<void>;
}

/**
 * Default ConfigurationStore implementation. Sets and retrieves entries from an in-memory cache.
 */
export class InMemoryConfigurationStore<T> implements IConfigurationStore<T> {
  private cache: NodeCache;
  constructor(ttlSeconds: number) {
    this.cache = new NodeCache({ stdTTL: ttlSeconds });
  }

  async getConfiguration(key: string): Promise<T> {
    return this.cache.get<T>(key);
  }

  async setConfigurations(configs: Record<string, T>) {
    const cacheEntries = Object.entries(configs).map(([key, val]) => ({
      val,
      key,
    }));
    this.cache.mset(cacheEntries);
  }
}
