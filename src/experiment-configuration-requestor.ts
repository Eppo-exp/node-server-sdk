import { ExperimentConfigurationRequestor, IConfigurationStore } from '@eppo/js-client-sdk-common';
import { IExperimentConfiguration } from '@eppo/js-client-sdk-common/dist/dto/experiment-configuration-dto';

import { IEppoConfigurationStore, commonCompatibleConfigurationStore } from './configuration-store';
import HttpClient from './http-client';

export default class EppoNodeExperimentConfigurationRequestor extends ExperimentConfigurationRequestor {
  public configStore: IConfigurationStore;

  constructor(
    configurationStore: IEppoConfigurationStore<IExperimentConfiguration>,
    httpClient: HttpClient,
  ) {
    const configStore = new commonCompatibleConfigurationStore(configurationStore);
    super(configStore, httpClient);
    this.configStore = configStore;
  }
}
