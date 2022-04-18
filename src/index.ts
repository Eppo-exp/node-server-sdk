import axios from 'axios';

import { InMemoryConfigurationStore } from './configuration-store';
import EppoClient, { IEppoClient } from './eppo-client';
import { IExperimentConfiguration } from './experiment/experiment-configuration';
import ExperimentConfigurationRequestor from './experiment/experiment-configuration-requestor';
import HttpClient from './http-client';
import initPoller from './poller';
import { sdkName, sdkVersion } from './sdk-data';

/**
 * Configuration used for initializing the Eppo client
 * @public
 */
export interface IClientConfig {
  /**
   * Eppo API key
   */
  apiKey: string;
}

const POLL_INTERVAL_MILLIS = 5 * 60 * 1000;
const JITTER_MILLIS = 30 * 1000;
const CACHE_TTL_MILLIS = 15 * 60 * 1000;

const axiosInstance = axios.create({
  baseURL: 'http://localhost:4000/api/internal',
});

export { IEppoClient } from './eppo-client';

/**
 * Initializes the Eppo client with configuration parameters.
 * This method should be called once on application startup.
 * After invocation of this method, the SDK will poll Eppo's API at regular intervals to retrieve assignment configurations.
 * @param config client configuration
 * @public
 */
export function init(config: IClientConfig): IEppoClient {
  const configurationStore = new InMemoryConfigurationStore<IExperimentConfiguration>(
    CACHE_TTL_MILLIS,
  );
  const httpClient = new HttpClient(axiosInstance, {
    apiKey: config.apiKey,
    sdkName,
    sdkVersion,
  });
  const configurationRequestor = new ExperimentConfigurationRequestor(
    configurationStore,
    httpClient,
  );
  const poller = initPoller(
    POLL_INTERVAL_MILLIS,
    JITTER_MILLIS,
    configurationRequestor.fetchAndStoreConfigurations.bind(configurationRequestor),
  );
  poller.start();
  return new EppoClient(configurationRequestor);
}
