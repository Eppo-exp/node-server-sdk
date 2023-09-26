import { ExperimentConfigurationRequestor, IConfigurationStore } from '@eppo/js-client-sdk-common';

import { IEppoConfigurationStore, commonCompatibleConfigurationStore } from './configuration-store';
import HttpClient from './http-client';

export default class EppoNodeExperimentConfigurationRequestor extends ExperimentConfigurationRequestor {
  public configStore: IConfigurationStore;

  constructor(configurationStore: IEppoConfigurationStore, httpClient: HttpClient) {
    const configStore = new commonCompatibleConfigurationStore(configurationStore);
    super(configStore, httpClient);
    this.configStore = configStore;
  }
}
