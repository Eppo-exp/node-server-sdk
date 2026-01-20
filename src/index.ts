import {
  Attributes,
  BanditActions,
  BanditParameters,
  BanditVariation,
  BoundedEventQueue,
  ContextAttributes,
  EppoClient,
  Event,
  EventDispatcher,
  Flag,
  FlagConfigurationRequestParameters,
  FlagKey,
  FormatEnum,
  MemoryOnlyConfigurationStore,
  NamedEventQueue,
  applicationLogger,
  newDefaultEventDispatcher,
} from '@eppo/js-client-sdk-common';

import FileBackedNamedEventQueue from './events/file-backed-named-event-queue';
import { IClientConfig, IOfflineClientConfig } from './i-client-config';
import { sdkName, sdkVersion } from './sdk-data';
import { generateSalt } from './util';
import { isReadOnlyFs } from './util/index';

export {
  Attributes,
  AttributeType,
  BanditActions,
  BanditSubjectAttributes,
  ContextAttributes,
  IAssignmentDetails,
  IAssignmentEvent,
  IAssignmentLogger,
  IBanditEvent,
  IBanditLogger,
  EppoAssignmentLogger,
} from '@eppo/js-client-sdk-common';

export { IClientConfig, IOfflineClientConfig };

let clientInstance: EppoClient;
let flagConfigurationStore: MemoryOnlyConfigurationStore<Flag>;
let banditVariationConfigurationStore: MemoryOnlyConfigurationStore<BanditVariation[]>;
let banditModelConfigurationStore: MemoryOnlyConfigurationStore<BanditParameters>;

/**
 * Default assignment cache size for server-side use cases.
 * We estimate this will use no more than 10 MB of memory.
 */
const DEFAULT_ASSIGNMENT_CACHE_SIZE = 50_000;

/**
 * @deprecated Eppo has discontinued eventing support. Event tracking will be handled by Datadog SDKs.
 */
export const NO_OP_EVENT_DISPATCHER: EventDispatcher = {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  attachContext: () => {},
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  dispatch: () => {},
};

/**
 * Initializes the Eppo client with configuration parameters.
 * This method should be called once on application startup.
 * After invocation of this method, the SDK will poll Eppo API at regular intervals to retrieve assignment configurations.
 * @param config client configuration
 * @public
 */
export async function init(config: IClientConfig): Promise<EppoClient> {
  const {
    apiKey,
    baseUrl,
    requestTimeoutMs,
    numInitialRequestRetries,
    numPollRequestRetries,
    pollingIntervalMs,
    throwOnFailedInitialization = true,
    pollAfterFailedInitialization = false,
    eventTracking,
  } = config;
  if (!apiKey) {
    throw new Error('API key is required');
  }

  const configurationRequestParameters: FlagConfigurationRequestParameters = {
    apiKey,
    sdkName,
    sdkVersion,
    baseUrl,
    requestTimeoutMs,
    numInitialRequestRetries,
    numPollRequestRetries,
    // For server-side, we default to keep polling for the life of the process
    pollAfterSuccessfulInitialization: config.pollAfterSuccessfulInitialization ?? true,
    pollAfterFailedInitialization,
    pollingIntervalMs,
    throwOnFailedInitialization,
  };

  flagConfigurationStore = new MemoryOnlyConfigurationStore<Flag>();
  banditVariationConfigurationStore = new MemoryOnlyConfigurationStore<BanditVariation[]>();
  banditModelConfigurationStore = new MemoryOnlyConfigurationStore<BanditParameters>();
  const eventDispatcher = newEventDispatcher(apiKey, eventTracking);

  clientInstance = new EppoClient({
    flagConfigurationStore,
    banditVariationConfigurationStore,
    banditModelConfigurationStore,
    configurationRequestParameters,
    eventDispatcher,
  });
  clientInstance.setAssignmentLogger(config.assignmentLogger);
  if (config.banditLogger) {
    clientInstance.setBanditLogger(config.banditLogger);
  }

  clientInstance.useLRUInMemoryAssignmentCache(DEFAULT_ASSIGNMENT_CACHE_SIZE);
  clientInstance.useExpiringInMemoryBanditAssignmentCache(DEFAULT_ASSIGNMENT_CACHE_SIZE);

  // Fetch configurations (which will also start regular polling per requestConfiguration)
  await clientInstance.fetchFlagConfigurations();

  // Monkey patch the function to use a generated salt if none is provided
  const originalGetPrecomputedConfiguration = clientInstance.getPrecomputedConfiguration;
  clientInstance.getPrecomputedConfiguration = (
    subjectKey: string,
    subjectAttributes: Attributes | ContextAttributes = {},
    banditActions: Record<FlagKey, BanditActions> = {},
    salt?: string,
  ) => {
    return originalGetPrecomputedConfiguration.call(
      clientInstance,
      subjectKey,
      subjectAttributes,
      banditActions,
      salt ?? generateSalt(),
    );
  };

  return clientInstance;
}

/**
 * Used to access a singleton SDK client instance.
 * Use the method after calling init() to initialize the client.
 * @returns a singleton client instance or throws an Error if init() has not been called
 */
export function getInstance(): EppoClient {
  if (!clientInstance) {
    throw Error('Expected init() to be called to initialize a client instance');
  }
  return clientInstance;
}

/**
 * Returns the current flags configuration as a JSON string.
 * This can be used to bootstrap another SDK instance using offlineInit().
 *
 * @returns JSON string containing the flags configuration, or null if not initialized
 * @public
 */
export function getFlagsConfiguration(): string | null {
  if (!flagConfigurationStore) {
    return null;
  }

  const flags = flagConfigurationStore.entries();
  const format = flagConfigurationStore.getFormat();
  const createdAt = flagConfigurationStore.getConfigPublishedAt();
  const environment = flagConfigurationStore.getEnvironment();

  const configuration: {
    createdAt?: string;
    format?: string;
    environment?: { name: string };
    flags: Record<string, Flag>;
    banditReferences?: Record<
      string,
      {
        modelVersion: string;
        flagVariations: BanditVariation[];
      }
    >;
  } = {
    flags,
  };

  if (createdAt) {
    configuration.createdAt = createdAt;
  }
  if (format) {
    configuration.format = format;
  }
  if (environment) {
    configuration.environment = environment;
  }

  const banditReferences = reconstructBanditReferences();
  if (banditReferences) {
    configuration.banditReferences = banditReferences;
  }

  return JSON.stringify(configuration);
}

/**
 * Reconstructs banditReferences from stored variations and parameters.
 * The variations are stored indexed by flag key, so we need to re-pivot them
 * back to being indexed by bandit key for export.
 */
function reconstructBanditReferences(): Record<
  string,
  { modelVersion: string; flagVariations: BanditVariation[] }
> | null {
  if (!banditVariationConfigurationStore || !banditModelConfigurationStore) {
    return null;
  }

  const variationsByFlagKey = banditVariationConfigurationStore.entries();
  const banditParameters = banditModelConfigurationStore.entries();

  // Flatten all variations and group by bandit key
  const variationsByBanditKey: Record<string, BanditVariation[]> = {};
  for (const variations of Object.values(variationsByFlagKey)) {
    for (const variation of variations) {
      const banditKey = variation.key;
      if (!variationsByBanditKey[banditKey]) {
        variationsByBanditKey[banditKey] = [];
      }
      variationsByBanditKey[banditKey].push(variation);
    }
  }

  // Build banditReferences with model versions
  const banditReferences: Record<
    string,
    { modelVersion: string; flagVariations: BanditVariation[] }
  > = {};
  for (const [banditKey, variations] of Object.entries(variationsByBanditKey)) {
    const params = banditParameters[banditKey];
    if (params) {
      banditReferences[banditKey] = {
        modelVersion: params.modelVersion,
        flagVariations: variations,
      };
    }
  }

  if (Object.keys(banditReferences).length === 0) {
    return null;
  }

  return banditReferences;
}

/**
 * Returns the current bandits configuration as a JSON string.
 * This can be used together with getFlagsConfiguration() to bootstrap
 * another SDK instance using offlineInit().
 *
 * @returns JSON string containing the bandits configuration, or null if not initialized or no bandits
 * @public
 */
export function getBanditsConfiguration(): string | null {
  if (!banditModelConfigurationStore) {
    return null;
  }

  const bandits = banditModelConfigurationStore.entries();

  // Return null if there are no bandits
  if (Object.keys(bandits).length === 0) {
    return null;
  }

  const configuration: {
    bandits: Record<string, BanditParameters>;
  } = {
    bandits,
  };

  return JSON.stringify(configuration);
}

/**
 * Initializes the Eppo client in offline mode with a provided configuration.
 * This method is synchronous and does not make any network requests.
 * Use this when you want to initialize the SDK with a previously fetched configuration.
 * @param config offline client configuration containing flag configurations as JSON strings
 * @returns the initialized client instance
 * @public
 */
export function offlineInit(config: IOfflineClientConfig): EppoClient {
  const {
    flagsConfiguration,
    banditsConfiguration,
    assignmentLogger,
    banditLogger,
    throwOnFailedInitialization = true,
  } = config;

  try {
    // Parse the flags configuration JSON
    const flagsConfigResponse = JSON.parse(flagsConfiguration) as {
      createdAt?: string;
      format?: string;
      environment?: { name: string };
      flags: Record<string, Flag>;
      banditReferences?: Record<
        string,
        {
          modelVersion: string;
          flagVariations: BanditVariation[];
        }
      >;
    };

    // Create memory-only configuration stores
    flagConfigurationStore = new MemoryOnlyConfigurationStore<Flag>();
    banditVariationConfigurationStore = new MemoryOnlyConfigurationStore<BanditVariation[]>();
    banditModelConfigurationStore = new MemoryOnlyConfigurationStore<BanditParameters>();

    // Set format from the configuration (default to SERVER)
    const format = (flagsConfigResponse.format as FormatEnum) ?? FormatEnum.SERVER;
    flagConfigurationStore.setFormat(format);

    // Load flag configurations into store
    // Note: setEntries is async but MemoryOnlyConfigurationStore performs synchronous operations internally,
    // so there's no race condition. We add .catch() for defensive error handling, matching JS client SDK pattern.
    flagConfigurationStore
      .setEntries(flagsConfigResponse.flags ?? {})
      .catch((err) =>
        applicationLogger.warn(`Error setting flags for memory-only configuration store: ${err}`),
      );

    // Set configuration timestamp if available
    if (flagsConfigResponse.createdAt) {
      flagConfigurationStore.setConfigPublishedAt(flagsConfigResponse.createdAt);
    }

    // Set environment if available
    if (flagsConfigResponse.environment) {
      flagConfigurationStore.setEnvironment(flagsConfigResponse.environment);
    }

    // Process bandit references from the flags configuration
    // Index by flag key for quick lookup (instead of by bandit key)
    if (flagsConfigResponse.banditReferences) {
      const banditVariationsByFlagKey: Record<string, BanditVariation[]> = {};
      for (const banditReference of Object.values(flagsConfigResponse.banditReferences)) {
        for (const flagVariation of banditReference.flagVariations) {
          const { flagKey } = flagVariation;
          if (!banditVariationsByFlagKey[flagKey]) {
            banditVariationsByFlagKey[flagKey] = [];
          }
          banditVariationsByFlagKey[flagKey].push(flagVariation);
        }
      }
      banditVariationConfigurationStore
        .setEntries(banditVariationsByFlagKey)
        .catch((err) =>
          applicationLogger.warn(
            `Error setting bandit variations for memory-only configuration store: ${err}`,
          ),
        );
    }

    // Parse and load bandit models if provided
    if (banditsConfiguration) {
      const banditsConfigResponse = JSON.parse(banditsConfiguration) as {
        updatedAt?: string;
        bandits: Record<string, BanditParameters>;
      };
      banditModelConfigurationStore
        .setEntries(banditsConfigResponse.bandits ?? {})
        .catch((err) =>
          applicationLogger.warn(
            `Error setting bandit models for memory-only configuration store: ${err}`,
          ),
        );
    }

    // Create client without request parameters (offline mode - no polling)
    clientInstance = new EppoClient({
      flagConfigurationStore,
      banditVariationConfigurationStore,
      banditModelConfigurationStore,
      // No configurationRequestParameters = offline mode, no network requests
    });

    // Set loggers if provided
    if (assignmentLogger) {
      clientInstance.setAssignmentLogger(assignmentLogger);
    }
    if (banditLogger) {
      clientInstance.setBanditLogger(banditLogger);
    }

    clientInstance.useLRUInMemoryAssignmentCache(DEFAULT_ASSIGNMENT_CACHE_SIZE);
    clientInstance.useExpiringInMemoryBanditAssignmentCache(DEFAULT_ASSIGNMENT_CACHE_SIZE);

    return clientInstance;
  } catch (error) {
    if (throwOnFailedInitialization) {
      throw error;
    }
    applicationLogger.warn(
      `Eppo SDK offline initialization failed: ${error instanceof Error ? error.message : error}`,
    );
    // Return the client instance even if initialization failed
    // It will return default values for all assignments
    return clientInstance;
  }
}

/**
 * @deprecated Eppo has discontinued eventing support. Event tracking will be handled by Datadog SDKs.
 */
function newEventDispatcher(
  sdkKey: string,
  config: IClientConfig['eventTracking'] = {},
): EventDispatcher {
  const {
    batchSize = 1_000,
    deliveryIntervalMs = 10_000,
    enabled = false,
    maxQueueSize = 10_000,
    maxRetries = 3,
    maxRetryDelayMs = 30_000,
    retryIntervalMs = 5_000,
  } = config;
  if (!enabled) {
    return NO_OP_EVENT_DISPATCHER;
  }
  let eventQueue: NamedEventQueue<Event>;
  try {
    // Check if the file system is read-only
    if (isReadOnlyFs(`${process.cwd()}/.queues`)) {
      applicationLogger.warn(
        'File system appears to be read-only. Using in-memory event queue instead.',
      );
      eventQueue = new BoundedEventQueue<Event>('events', [], maxQueueSize);
    } else {
      eventQueue = new FileBackedNamedEventQueue<Event>('events');
    }
  } catch (error) {
    // If there's any error during the check, fall back to BoundedEventQueue
    applicationLogger.warn(
      `Error checking file system: ${error}. Using in-memory event queue instead.`,
    );
    eventQueue = new BoundedEventQueue<Event>('events', [], maxQueueSize);
  }

  const emptyNetworkStatusListener =
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    { isOffline: () => false, onNetworkStatusChange: () => {} };
  return newDefaultEventDispatcher(eventQueue, emptyNetworkStatusListener, sdkKey, batchSize, {
    deliveryIntervalMs,
    retryIntervalMs,
    maxRetryDelayMs,
    maxRetries,
  });
}
