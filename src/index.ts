import { IAssignmentLogger, validation, constants } from '@eppo/js-client-sdk-common';
import {
  IAssignmentCache,
  LRUAssignmentCache,
} from '@eppo/js-client-sdk-common/dist/assignment-cache';
import axios from 'axios';

import EppoClient, { IEppoClient } from './client/eppo-client';
import { InMemoryConfigurationStore } from './configuration-store';
import {
  ASSIGNMENT_CACHE_MAX_ENTRIES as ASSIGNMENT_CACHE_DEFAULT_MAX_ENTRIES,
  CONFIGURATION_STORE_MAX_CACHE_ENTRIES,
  POLL_INTERVAL_MILLIS,
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

  /**
   * Pass an assignment cache implementation to cache assignments.
   */
  assignmentCache?: IAssignmentCache;
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
  const configurationStore = new InMemoryConfigurationStore(CONFIGURATION_STORE_MAX_CACHE_ENTRIES);
  const axiosInstance = axios.create({
    baseURL: config.baseUrl || constants.BASE_URL,
    timeout: constants.REQUEST_TIMEOUT_MILLIS,
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
    POLL_INTERVAL_MILLIS,
    configurationRequestor.fetchAndStoreConfigurations.bind(configurationRequestor),
  );
  clientInstance = new EppoClient(configurationRequestor, poller);
  clientInstance.setLogger(config.assignmentLogger);

  clientInstance.setAssignmentCache(
    config.assignmentCache ?? new LRUAssignmentCache(ASSIGNMENT_CACHE_DEFAULT_MAX_ENTRIES),
  );

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
