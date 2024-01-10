import { IAssignmentLogger, validation, constants } from '@eppo/js-client-sdk-common';
import axios from 'axios';

import EppoClient, { IEppoClient } from './client/eppo-client';
import { InMemoryConfigurationStore } from './configuration-store';
import {
  DEFAULT_INITIAL_CONFIG_REQUEST_RETRIES,
  DEFAULT_POLL_CONFIG_REQUEST_RETRIES,
  MAX_CACHE_ENTRIES,
  POLL_INTERVAL_MS,
} from './constants';
import ExperimentConfigurationRequestor from './experiment-configuration-requestor';
import HttpClient from './http-client';
import initPoller, { IPoller } from './poller';
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

  /**
   * Base URL of the Eppo API.
   * Clients should use the default setting in most cases.
   */
  baseUrl?: string;

  /**
   * Pass a logging implementation to send variation assignments to your data warehouse.
   */
  assignmentLogger: IAssignmentLogger;

  /***
   * Timeout in milliseconds for the HTTPS request for the experiment configuration. (Default: 5000)
   */
  requestTimeoutMs?: number;

  /**
   * Number of additional times the initial configuration request will be attempted if it fails. 
   * This is the request servers typically synchronously wait for completion. A small wait will be
   * done between requests. (Default: 1)
   */
  numInitialRequestRetries?: number;

  /**
   * Number of additional times polling for updated configurations will be attempted before giving up.
   * Polling is done after a successful initial request. Subsequent attempts are done using an exponential
   * backoff. (Default: 7)
   */
  numPollRequestRetries?: number;

  /**
   * Throw on error if unable to fetch an initial configuration during initialization. (default: true)
   */
  throwOnFailedInitialization?: boolean;

  /**
   * Poll for new configurations even if the initial configuration request failed. (default: false)
   */
  pollAfterFailedInitialization?: boolean;
}

export { IAssignmentEvent, IAssignmentLogger } from '@eppo/js-client-sdk-common';
export { IEppoClient } from './client/eppo-client';

let poller: IPoller;
let clientInstance: IEppoClient;

/**
 * Initializes the Eppo client with configuration parameters.
 * This method should be called once on application startup.
 * After invocation of this method, the SDK will poll Eppo's API at regular intervals to retrieve assignment configurations.
 * @param config client configuration
 * @public
 */
export async function init(config: IClientConfig): Promise<IEppoClient> {
  validation.validateNotBlank(config.apiKey, 'API key required');
  const configurationStore = new InMemoryConfigurationStore(MAX_CACHE_ENTRIES);
  const axiosInstance = axios.create({
    baseURL: config.baseUrl || constants.BASE_URL,
    timeout: config.requestTimeoutMs || constants.REQUEST_TIMEOUT_MILLIS,
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
  if (poller) {
    // if a client was already initialized, stop the polling process from the previous init call
    poller.stop();
  }

  poller = initPoller(
    POLL_INTERVAL_MS,
    configurationRequestor.fetchAndStoreConfigurations.bind(configurationRequestor),
    {
      maxStartRetries: config.numInitialRequestRetries ?? DEFAULT_INITIAL_CONFIG_REQUEST_RETRIES,
      maxPollRetries: config.numPollRequestRetries ?? DEFAULT_POLL_CONFIG_REQUEST_RETRIES,
      pollAfterFailedStart: config.pollAfterFailedInitialization,
      errorOnFailedStart: config.throwOnFailedInitialization,
    },
  );
  clientInstance = new EppoClient(configurationRequestor, poller);
  clientInstance.setLogger(config.assignmentLogger);

  // default to LRU cache with 50_000 entries.
  // we estimate this will use no more than 10 MB of memory
  // and should be appropriate for most server-side use cases.
  clientInstance.useLRUInMemoryAssignmentCache(50_000);

  await poller.start();

  return clientInstance;
}

/**
 * Used to access a singleton SDK client instance.
 * Use the method after calling init() to initialize the client.
 * @returns a singleton client instance
 */
export function getInstance(): IEppoClient {
  if (!clientInstance) {
    throw Error('Expected init() to be called to initialize a client instance');
  }
  return clientInstance;
}
