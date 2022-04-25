import { IConfigurationStore } from '../configuration-store';
import HttpClient from '../http-client';

import { IExperimentConfiguration } from './experiment-configuration';

const RAC_ENDPOINT = '/randomized-assignment-configurations';

interface IRandomizedAssignmentConfig {
  experiments: Record<string, IExperimentConfiguration>;
}

class InvalidApiKeyError extends Error {}

export default class ExperimentConfigurationRequestor {
  constructor(
    private configurationStore: IConfigurationStore<IExperimentConfiguration>,
    private httpClient: HttpClient,
  ) {}

  getConfiguration(experiment: string): IExperimentConfiguration {
    if (this.httpClient.isUnauthorized) {
      throw new InvalidApiKeyError('Unauthorized: please check your API key');
    }
    return this.configurationStore.getConfiguration(experiment);
  }

  async fetchAndStoreConfigurations(): Promise<Record<string, IExperimentConfiguration>> {
    const responseData = await this.httpClient.get<IRandomizedAssignmentConfig>(RAC_ENDPOINT);
    this.configurationStore.setConfigurations(responseData.experiments);
    return responseData.experiments;
  }
}
