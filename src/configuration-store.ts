import * as NodeCache from 'node-cache';

export interface IConfigurationStore<T> {
  getConfigurations(namespace: string): Promise<Record<string, T>>;
  setConfigurations(namespace: string, configs: Record<string, T>): Promise<void>;
}

export const EXPERIMENT_CONFIGURATIONS_NAMESPACE = 'experiment_configurations';

/**
 * Default ConfigurationStore implementation. Sets and retrieves entries from an in-memory cache.
 */
export class InMemoryConfigurationStore<T> implements IConfigurationStore<T> {
  private cache: NodeCache;
  constructor(ttl: number) {
    this.cache = new NodeCache({ stdTTL: ttl / 1000 }); // divide by 1000 because NodeCache uses seconds
  }

  async getConfigurations(namespace: string): Promise<Record<string, T>> {
    return this.cache.get<Record<string, T>>(namespace);
  }

  async setConfigurations(namespace: string, configs: Record<string, T>) {
    this.cache.set(namespace, configs);
  }
}
