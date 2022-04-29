import axios from 'axios';

import { InMemoryConfigurationStore } from './configuration-store';
import {
  BASE_URL,
  CACHE_TTL_MILLIS,
  JITTER_MILLIS,
  POLL_INTERVAL_MILLIS,
  REQUEST_TIMEOUT_MILLIS,
} from './constants';
import EppoClient, { IEppoClient } from './eppo-client';
import { IExperimentConfiguration } from './experiment/experiment-configuration';
import ExperimentConfigurationRequestor from './experiment/experiment-configuration-requestor';
import HttpClient from './http-client';
import initPoller from './poller';
import { sdkName, sdkVersion } from './sdk-data';
import { validateNotBlank } from './validation';

/**
 * Configuration used for initializing the Eppo client
 * @public
 */
export interface IClientConfig {
  /**
   * Eppo API key
   */
  apiKey: string;

  /**
   * Base URL of the Eppo API.
   * Clients should use the default setting in most cases.
   */
  baseUrl?: string;
}

export { IEppoClient } from './eppo-client';

// shared client instance
let client: IEppoClient = null;

/**
 * Initializes the Eppo client with configuration parameters.
 * This method should be called once on application startup.
 * After invocation of this method, the SDK will poll Eppo's API at regular intervals to retrieve assignment configurations.
 * @param config client configuration
 * @public
 */
export function init(config: IClientConfig): IEppoClient {
  validateNotBlank(config.apiKey, 'API key required');
  const configurationStore = new InMemoryConfigurationStore<IExperimentConfiguration>(
    CACHE_TTL_MILLIS,
  );
  const axiosInstance = axios.create({
    baseURL: config.baseUrl || BASE_URL,
    timeout: REQUEST_TIMEOUT_MILLIS,
  });
  const httpClient = new HttpClient(axiosInstance, {
    apiKey: config.apiKey,
    sdkName,
    sdkVersion,
  });
  const configurationRequestor = new ExperimentConfigurationRequestor(
    configurationStore,
    httpClient,
  );
  if (client) {
    // if client was already initialized, release its resources before re-initializing it
    client.close();
  }
  const poller = initPoller(
    POLL_INTERVAL_MILLIS,
    JITTER_MILLIS,
    configurationRequestor.fetchAndStoreConfigurations.bind(configurationRequestor),
  );
  const startedPolling = poller.start();
  client = new EppoClient(() => startedPolling, poller.stop, configurationRequestor);
  return client;
}
