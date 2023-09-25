import {
  IAssignmentLogger,
  validation,
  constants,
  ExperimentConfigurationRequestor,
  IEppoClient,
  EppoClient,
  HttpClient,
  IConfigurationStore,
} from '@eppo/js-client-sdk-common';
import { IExperimentConfiguration } from '@eppo/js-client-sdk-common/dist/dto/experiment-configuration-dto';
import axios from 'axios';

import { InMemoryConfigurationStore } from './configuration-store';
import { MAX_CACHE_ENTRIES, POLL_INTERVAL_MILLIS } from './constants';
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
}

export { IAssignmentLogger, IAssignmentEvent, IEppoClient } from '@eppo/js-client-sdk-common';

let poller: IPoller;
let clientInstance: IEppoServerClient;

interface IEppoServerClient extends EppoNodeClient {
  /**
   * Used to manually stop the polling of Eppo servers.
   */
  stopPolling(): void;
}

export class EppoNodeClient extends EppoClient implements IEppoClient {
  constructor(configurationStore: IConfigurationStore, private poller: IPoller) {
    super(configurationStore);
    this.poller = poller;
  }

  public stopPolling() {
    this.poller.stop();
  }
}

/**
 * Initializes the Eppo client with configuration parameters.
 * This method should be called once on application startup.
 * After invocation of this method, the SDK will poll Eppo's API at regular intervals to retrieve assignment configurations.
 * @param config client configuration
 * @public
 */
export async function init(config: IClientConfig): Promise<IEppoClient> {
  validation.validateNotBlank(config.apiKey, 'API key required');
  const configurationStore = new InMemoryConfigurationStore<IExperimentConfiguration>(
    MAX_CACHE_ENTRIES,
  );
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
  clientInstance = new EppoNodeClient(configurationStore, poller);
  clientInstance.setLogger(config.assignmentLogger);
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
