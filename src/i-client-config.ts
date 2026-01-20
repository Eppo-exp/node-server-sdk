import { IAssignmentLogger, IBanditLogger } from '@eppo/js-client-sdk-common';

/**
 * Configuration used for initializing the Eppo client
 * @public
 */
export interface IClientConfig {
  /** Eppo SDK key */
  apiKey: string;

  /**
   * Base URL of the Eppo API.
   * Clients should use the default setting in most cases.
   */
  baseUrl?: string;

  /** Provide a logging implementation to send variation assignments to your data warehouse. */
  assignmentLogger: IAssignmentLogger;

  /** Logging implementation to send bandit actions to your data warehouse */
  banditLogger?: IBanditLogger;

  /** Timeout in milliseconds for the HTTPS request for the experiment configuration. (Default: 5000) */
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

  /** Throw error if unable to fetch an initial configuration during initialization. (default: true) */
  throwOnFailedInitialization?: boolean;

  /** Poll for new configurations even if the initial configuration request failed. (default: false) */
  pollAfterFailedInitialization?: boolean;

  /**
   * Poll for new configurations (every `pollingIntervalMs`) after successfully requesting the initial configuration. (default: true)
   * For server-side applications, this defaults to true to ensure configurations stay up-to-date for the life of the process.
   */
  pollAfterSuccessfulInitialization?: boolean;

  /** Amount of time in milliseconds to wait between API calls to refresh configuration data. Default of 30_000 (30s). */
  pollingIntervalMs?: number;

  /**
   * Configuration settings for the event dispatcher.
   * @deprecated Eppo has discontinued eventing support. Event tracking will be handled by Datadog SDKs.
   */
  eventTracking?: {
    /** Maximum number of events to send per delivery request. Defaults to 1000 events. */
    batchSize?: number;
    /** Number of milliseconds to wait between each batch delivery. Defaults to 10 seconds. */
    deliveryIntervalMs?: number;
    /** Whether to enable event tracking. Defaults to false. */
    enabled?: boolean;
    /**
     * Maximum number of events to queue in memory before starting to drop events.
     * Note: This is only used if localStorage is not available.
     * Defaults to 10000 events.
     */
    maxQueueSize?: number;
    /** Maximum number of retry attempts before giving up on a batch delivery. Defaults to 3 retries. */
    maxRetries?: number;
    /** Maximum amount of milliseconds to wait before retrying a failed delivery. Defaults to 30 seconds. */
    maxRetryDelayMs?: number;
    /** Minimum amount of milliseconds to wait before retrying a failed delivery. Defaults to 5 seconds */
    retryIntervalMs?: number;
  };
}

/**
 * Configuration used for offline initialization of the Eppo client.
 * Offline initialization allows the SDK to be used without making any network requests.
 * @public
 */
export interface IOfflineClientConfig {
  /**
   * The full flags configuration JSON string as returned by the Eppo API.
   * This should be the complete response from the /flag-config/v1/config endpoint.
   *
   * Expected format:
   * ```json
   * {
   *   "createdAt": "2024-04-17T19:40:53.716Z",
   *   "format": "SERVER",
   *   "environment": { "name": "production" },
   *   "flags": { ... }
   * }
   * ```
   */
  flagsConfiguration: string;

  /**
   * Optional bandit models configuration JSON string as returned by the Eppo API.
   * This should be the complete response from the bandit parameters endpoint.
   *
   * Expected format:
   * ```json
   * {
   *   "updatedAt": "2024-04-17T19:40:53.716Z",
   *   "bandits": { ... }
   * }
   * ```
   */
  banditsConfiguration?: string;

  /**
   * Optional assignment logger for sending variation assignments to your data warehouse.
   * Required for experiment analysis.
   */
  assignmentLogger?: IAssignmentLogger;

  /** Optional bandit logger for sending bandit actions to your data warehouse */
  banditLogger?: IBanditLogger;

  /**
   * Whether to throw an error if initialization fails. (default: true)
   * If false, the client will be initialized with an empty configuration.
   */
  throwOnFailedInitialization?: boolean;
}
