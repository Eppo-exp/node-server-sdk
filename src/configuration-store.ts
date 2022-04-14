export interface IConfigurationStore<T> {
  getConfiguration(key: string): Promise<T>;
}
