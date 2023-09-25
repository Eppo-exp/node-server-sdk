import { ExperimentConfigurationRequestor, IConfigurationStore } from '@eppo/js-client-sdk-common';
import { IExperimentConfiguration } from '@eppo/js-client-sdk-common/dist/dto/experiment-configuration-dto';

import { IEppoConfigurationStore, commonCompatibleConfigurationStore } from './configuration-store';
import HttpClient from './http-client';

interface IRandomizedAssignmentConfig {
  flags: Record<string, IExperimentConfiguration>;
}

const RAC_ENDPOINT = '/randomized_assignment/v3/config';

export default class EppoNodeExperimentConfigurationRequestor extends ExperimentConfigurationRequestor {
  public configStore: IConfigurationStore;
  private _httpClient: HttpClient;

  constructor(
    configurationStore: IEppoConfigurationStore<IExperimentConfiguration>,
    httpClient: HttpClient,
  ) {
    const configStore = new commonCompatibleConfigurationStore(configurationStore);
    super(configStore, httpClient);
    this.configStore = configStore;
    this._httpClient = httpClient;
  }

  async fetchAndStoreConfigurations(): Promise<Record<string, IExperimentConfiguration>> {
    const responseData = await this._httpClient.get<IRandomizedAssignmentConfig>(RAC_ENDPOINT);

    this.configStore.setEntries(responseData?.flags ?? {});
    return responseData?.flags ?? {};
  }
}
