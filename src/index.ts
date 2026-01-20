import {
  Attributes,
  BanditActions,
  BanditParameters,
  BanditVariation,
  BoundedEventQueue,
  ContextAttributes,
  Environment,
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
import { IClientConfig } from './i-client-config';
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

export { IClientConfig };

let clientInstance: EppoClient;

// We keep references to the configuration stores at module level because EppoClient
// does not expose public getters for store metadata (format, createdAt, environment)
// or bandit configurations. These references are needed by getFlagsConfiguration()
// and getBanditsConfiguration() to reconstruct exportable configuration JSON.
let flagConfigurationStore: MemoryOnlyConfigurationStore<Flag>;
let banditVariationConfigurationStore: MemoryOnlyConfigurationStore<BanditVariation[]>;
let banditModelConfigurationStore: MemoryOnlyConfigurationStore<BanditParameters>;

/**
 * Represents a bandit reference linking a bandit to its flag variations.
 *
 * TODO: Remove this local definition once BanditReference is exported from @eppo/js-client-sdk-common.
 * This duplicates the BanditReference interface from the common package's http-client module,
 * which is not currently exported from the package's public API.
 */
interface BanditReference {
  modelVersion: string;
  flagVariations: BanditVariation[];
}

/**
 * Represents the universal flag configuration response format.
 *
 * TODO: Remove this local definition once IUniversalFlagConfigResponse is exported from @eppo/js-client-sdk-common.
 * This duplicates the IUniversalFlagConfigResponse interface from the common package's http-client module,
 * which is not currently exported from the package's public API.
 */
interface FlagsConfigurationResponse {
  createdAt: string;
  format: FormatEnum;
  environment: Environment;
  flags: Record<string, Flag>;
  banditReferences: Record<string, BanditReference>;
}

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

  // default to LRU cache with 50_000 entries.
  // we estimate this will use no more than 10 MB of memory
  // and should be appropriate for most server-side use cases.
  clientInstance.useLRUInMemoryAssignmentCache(50_000);
  clientInstance.useExpiringInMemoryBanditAssignmentCache(50_000);

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
 * Reconstructs the current flags configuration as a JSON string.
 * This can be used to bootstrap another SDK instance using offlineInit().
 *
 * @returns JSON string containing the flags configuration, or null if not initialized
 * @public
 */
export function getFlagsConfiguration(): string | null {
  if (!flagConfigurationStore) {
    return null;
  }

  // Build configuration matching FlagsConfigurationResponse structure.
  // All fields are required - they are guaranteed to exist after successful initialization.
  const configuration: FlagsConfigurationResponse = {
    createdAt: flagConfigurationStore.getConfigPublishedAt() ?? new Date().toISOString(),
    format: flagConfigurationStore.getFormat() ?? FormatEnum.SERVER,
    environment: flagConfigurationStore.getEnvironment() ?? { name: 'UNKNOWN' },
    flags: flagConfigurationStore.entries(),
    banditReferences: reconstructBanditReferences(),
  };

  return JSON.stringify(configuration);
}

/**
 * Reconstructs banditReferences from stored variations and parameters.
 * The variations are stored indexed by flag key, so we need to re-pivot them
 * back to being indexed by bandit key for export.
 */
function reconstructBanditReferences(): Record<string, BanditReference> {
  if (!banditVariationConfigurationStore || !banditModelConfigurationStore) {
    return {};
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
  const banditReferences: Record<string, BanditReference> = {};
  for (const [banditKey, variations] of Object.entries(variationsByBanditKey)) {
    const params = banditParameters[banditKey];
    if (params) {
      banditReferences[banditKey] = {
        modelVersion: params.modelVersion,
        flagVariations: variations,
      };
    }
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
