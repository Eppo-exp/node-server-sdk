import axios from 'axios';

import { InMemoryConfigurationStore } from './configuration-store';
import {
  BASE_URL,
  CACHE_TTL_MILLIS,
  EVENT_FLUSH_INTERVAL_MILLIS,
  EVENT_QUEUE_CAPACITY,
  JITTER_MILLIS,
  POLL_INTERVAL_MILLIS,
  REQUEST_TIMEOUT_MILLIS,
} from './constants';
import EppoClient, { IEppoClient } from './eppo-client';
import EventProcessor from './event-processor';
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
}

export { IEppoClient } from './eppo-client';

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
    baseURL: BASE_URL,
    timeout: REQUEST_TIMEOUT_MILLIS,
  });
  const httpClient = new HttpClient(axiosInstance, {
    apiKey: config.apiKey,
    sdkName,
    sdkVersion,
  });
  const eventProcessor = new EventProcessor(
    httpClient,
    EVENT_QUEUE_CAPACITY,
    EVENT_FLUSH_INTERVAL_MILLIS,
  );
  const configurationRequestor = new ExperimentConfigurationRequestor(
    configurationStore,
    httpClient,
  );
  const poller = initPoller(
    POLL_INTERVAL_MILLIS,
    JITTER_MILLIS,
    configurationRequestor.fetchAndStoreConfigurations.bind(configurationRequestor),
    eventProcessor,
  );
  poller.start();
  return new EppoClient(configurationRequestor);
}
