import { IExperimentConfiguration } from './experiment/experiment-configuration';

export interface IConfigurationStore<T> {
  setConfigurations(configs: T[]): void;

  getConfiguration(key: string): Promise<IExperimentConfiguration>;
}
