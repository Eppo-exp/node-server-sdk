import { IConfigurationStore } from './configuration-store';
import { IExperimentConfiguration } from './dto/experiment-configuration-dto';
import HttpClient from './http-client';

const RAC_ENDPOINT = '/randomized_assignment/v3/config';

interface IRandomizedAssignmentConfig {
  flags: Record<string, IExperimentConfiguration>;
}

class InvalidApiKeyError extends Error {}

export default class ExperimentConfigurationRequestor {
  constructor(
    private configurationStore: IConfigurationStore<IExperimentConfiguration>,
    private httpClient: HttpClient,
  ) {}

  getConfiguration(experiment: string): IExperimentConfiguration | null {
    if (this.httpClient.isUnauthorized) {
      throw new InvalidApiKeyError('Unauthorized: please check your API key');
    }
    return this.configurationStore.getConfiguration(experiment);
  }

  async fetchAndStoreConfigurations(): Promise<Record<string, IExperimentConfiguration>> {
    const responseData = await this.httpClient.get<IRandomizedAssignmentConfig>(RAC_ENDPOINT);

    this.configurationStore.setConfigurations(responseData?.flags ?? {});
    return responseData?.flags ?? {};
  }
}
