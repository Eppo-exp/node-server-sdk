import {
  IAssignmentLogger,
  validation,
  EppoClient,
  IEppoClient,
  FlagConfigurationRequestParameters,
  MemoryOnlyConfigurationStore,
  Flag,
  AssignmentCache,
} from '@eppo/js-client-sdk-common';
import { Cacheable } from '@eppo/js-client-sdk-common/dist/assignment-cache';
import { ObfuscatedFlag } from '@eppo/js-client-sdk-common/dist/interfaces';

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
   * (optional) Provide your own caching solution. If not defined, LRU cache will be used.
   */
  assignmentCache?: AssignmentCache<Cacheable>;

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
  const configurationStore = new MemoryOnlyConfigurationStore<Flag | ObfuscatedFlag>();

  const requestConfiguration: FlagConfigurationRequestParameters = {
    apiKey: config.apiKey,
    sdkName,
    sdkVersion,
    baseUrl: config.baseUrl ?? undefined,
    requestTimeoutMs: config.requestTimeoutMs ?? undefined,
    numInitialRequestRetries: config.numInitialRequestRetries ?? undefined,
    numPollRequestRetries: config.numPollRequestRetries ?? undefined,
    pollAfterSuccessfulInitialization: true, // For servers we always want to keep polling for the life of the server
    pollAfterFailedInitialization: config.pollAfterFailedInitialization ?? false,
    throwOnFailedInitialization: config.throwOnFailedInitialization ?? true,
  };

  clientInstance = new EppoClient(configurationStore, requestConfiguration);
  clientInstance.setLogger(config.assignmentLogger);

  if (this.assignmentCache) {
    clientInstance.useCustomAssignmentCache(this.assignmentCache);
  } else {
    // default to LRU cache with 50_000 entries.
    // we estimate this will use no more than 10 MB of memory
    // and should be appropriate for most server-side use cases.

    clientInstance.useLRUInMemoryAssignmentCache(50_000);
  }

  // Fetch configurations (which will also start regular polling per requestConfiguration)
  await clientInstance.fetchFlagConfigurations();

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
