import { ASSIGNMENT_CONFIGURATION_NAMESPACE, IConfigurationStore } from '../configuration-store';

import { IExperimentConfiguration } from './experiment-configuration';

export default class ExperimentConfigurationRequestor {
  constructor(
    private apiKey: string,
    private configurationStore: IConfigurationStore<IExperimentConfiguration>,
  ) {}

  async getConfiguration(experiment: string): Promise<IExperimentConfiguration> {
    const cachedConfigurations = await this.configurationStore.getConfigurations(
      ASSIGNMENT_CONFIGURATION_NAMESPACE,
    );
    if (cachedConfigurations) {
      return cachedConfigurations[experiment];
    }
    const configs = await this.fetchAndStoreConfigurations();
    return configs[experiment];
  }

  async fetchAndStoreConfigurations(): Promise<Record<string, IExperimentConfiguration>> {
    // TODO: add network request; the response is mocked here
    const configs = {
      randomization_algo: {
        name: 'randomization_algo',
        enabled: true,
        percentExposure: 0.5,
        subjectShards: 1000,
        variations: [
          {
            name: 'variation-1',
            shardRange: {
              start: 0,
              end: 50,
            },
          },
          {
            name: 'variation-2',
            shardRange: {
              start: 50,
              end: 100,
            },
          },
        ],
      },
    };
    await this.configurationStore.setConfigurations(ASSIGNMENT_CONFIGURATION_NAMESPACE, configs);
    return configs;
  }
}
