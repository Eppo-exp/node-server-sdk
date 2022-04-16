import { EXPERIMENT_CONFIGURATIONS_NAMESPACE, IConfigurationStore } from '../configuration-store';
import HttpClient from '../http-client';

import { IExperimentConfiguration } from './experiment-configuration';

const RAC_ENDPOINT = '/randomized-assignment-configurations';

interface IRandomizedAssignmentConfig {
  subjectShards: number;
  experiments: Record<string, IExperimentConfiguration>;
}

export default class ExperimentConfigurationRequestor {
  constructor(
    private configurationStore: IConfigurationStore<IExperimentConfiguration>,
    private httpClient: HttpClient,
  ) {}

  async getConfiguration(experiment: string): Promise<IExperimentConfiguration> {
    const cachedConfigurations = await this.configurationStore.getConfigurations(
      EXPERIMENT_CONFIGURATIONS_NAMESPACE,
    );
    if (cachedConfigurations) {
      return cachedConfigurations[experiment];
    }
    const configs = await this.fetchAndStoreConfigurations();
    return configs[experiment];
  }

  async fetchAndStoreConfigurations(): Promise<Record<string, IExperimentConfiguration>> {
    const responseData = await this.httpClient.get<IRandomizedAssignmentConfig>(RAC_ENDPOINT);
    await this.configurationStore.setConfigurations(
      EXPERIMENT_CONFIGURATIONS_NAMESPACE,
      responseData.experiments,
    );
    return responseData.experiments;
  }
}
