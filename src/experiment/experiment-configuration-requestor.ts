import { IConfigurationStore } from '../configuration-store';
import HttpClient, { InvalidApiKeyError } from '../http-client';
import PollingErrorObserver from '../polling-error-observer';

import { IExperimentConfiguration } from './experiment-configuration';

const RAC_ENDPOINT = '/randomized-assignment-configurations';

interface IRandomizedAssignmentConfig {
  experiments: Record<string, IExperimentConfiguration>;
}

export default class ExperimentConfigurationRequestor {
  constructor(
    private configurationStore: IConfigurationStore<IExperimentConfiguration>,
    private httpClient: HttpClient,
    private pollingErrorObserver: PollingErrorObserver,
  ) {}

  getConfiguration(experiment: string): IExperimentConfiguration {
    if (this.pollingErrorObserver.error instanceof InvalidApiKeyError) {
      throw this.pollingErrorObserver.error;
    }
    return this.configurationStore.getConfiguration(experiment);
  }

  async fetchAndStoreConfigurations(): Promise<Record<string, IExperimentConfiguration>> {
    const responseData = await this.httpClient.get<IRandomizedAssignmentConfig>(RAC_ENDPOINT);
    this.configurationStore.setConfigurations(responseData.experiments);
    return responseData.experiments;
  }
}
