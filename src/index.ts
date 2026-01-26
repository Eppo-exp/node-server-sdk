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

/**
 * Represents the bandits configuration response format.
 *
 * TODO: Remove this local definition once IBanditParametersResponse is exported from @eppo/js-client-sdk-common.
 * This duplicates the IBanditParametersResponse interface from the common package's http-client module,
 * which is not currently exported from the package's public API.
 */
interface BanditsConfigurationResponse {
  updatedAt: string;
  bandits: Record<string, BanditParameters>;
}

/**
 * Default assignment cache size for server-side use cases.
 * We estimate this will use no more than 10 MB of memory.
 */
const DEFAULT_ASSIGNMENT_CACHE_SIZE = 50_000;

/**
 * Validates that the parsed flags configuration has all required fields.
 * Returns an array of validation error messages, or empty array if valid.
 */
function validateFlagsConfiguration(config: unknown): string[] {
  const errors: string[] = [];

  if (!config || typeof config !== 'object') {
    errors.push('Configuration must be an object');
    return errors;
  }

  const cfg = config as Record<string, unknown>;

  if (typeof cfg.createdAt !== 'string') {
    errors.push('Missing or invalid "createdAt" field');
  }
  if (typeof cfg.format !== 'string') {
    errors.push('Missing or invalid "format" field');
  }
  if (!cfg.environment || typeof cfg.environment !== 'object') {
    errors.push('Missing or invalid "environment" field');
  } else if (typeof (cfg.environment as Record<string, unknown>).name !== 'string') {
    errors.push('Missing or invalid "environment.name" field');
  }
  if (!cfg.flags || typeof cfg.flags !== 'object') {
    errors.push('Missing or invalid "flags" field');
  }
  if (!cfg.banditReferences || typeof cfg.banditReferences !== 'object') {
    errors.push('Missing or invalid "banditReferences" field');
  }

  return errors;
}

/**
 * Validates that the parsed bandits configuration has all required fields.
 * Returns an array of validation error messages, or empty array if valid.
 */
function validateBanditsConfiguration(config: unknown): string[] {
  const errors: string[] = [];

  if (!config || typeof config !== 'object') {
    errors.push('Configuration must be an object');
    return errors;
  }

  const cfg = config as Record<string, unknown>;

  if (!cfg.bandits || typeof cfg.bandits !== 'object') {
    errors.push('Missing or invalid "bandits" field');
  }

  return errors;
}

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
 * @returns JSON string containing the bandits configuration
 * @public
 */
export function getBanditsConfiguration(): string {
  // Build configuration matching BanditsConfigurationResponse structure.
  const configuration: BanditsConfigurationResponse = {
    updatedAt: new Date().toISOString(), // TODO: ideally we can track this and use it when regenerating bandits configuration
    bandits: banditModelConfigurationStore ? banditModelConfigurationStore.entries() : {},
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

  // Create memory-only configuration stores
  flagConfigurationStore = new MemoryOnlyConfigurationStore<Flag>();
  banditVariationConfigurationStore = new MemoryOnlyConfigurationStore<BanditVariation[]>();
  banditModelConfigurationStore = new MemoryOnlyConfigurationStore<BanditParameters>();

  try {
    // Parse and validate the flags configuration JSON
    const parsedFlagsConfig = JSON.parse(flagsConfiguration);
    const flagsValidationErrors = validateFlagsConfiguration(parsedFlagsConfig);

    if (flagsValidationErrors.length > 0) {
      const errorMessage = `Invalid flags configuration: ${flagsValidationErrors.join(', ')}`;
      if (throwOnFailedInitialization) {
        throw new Error(errorMessage);
      }
      applicationLogger.warn(
        `${errorMessage}. Using empty configuration - all assignments will return default values.`,
      );
      // Skip loading flags config, stores remain empty
    } else {
      // Cast to typed response after validation
      const flagsConfigResponse = parsedFlagsConfig as FlagsConfigurationResponse;

      // Set format from the configuration
      flagConfigurationStore.setFormat(flagsConfigResponse.format);

      // Load flag configurations into store
      // Note: setEntries is async but MemoryOnlyConfigurationStore performs synchronous operations internally,
      // so there's no race condition. We add .catch() for defensive error handling, matching JS client SDK pattern.
      flagConfigurationStore
        .setEntries(flagsConfigResponse.flags)
        .catch((err) =>
          applicationLogger.warn(`Error setting flags for memory-only configuration store: ${err}`),
        );

      // Set configuration timestamp
      flagConfigurationStore.setConfigPublishedAt(flagsConfigResponse.createdAt);

      // Set environment
      flagConfigurationStore.setEnvironment(flagsConfigResponse.environment);

      // Process bandit references from the flags configuration
      // Index by flag key for quick lookup (instead of by bandit key)
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
      const parsedBanditsConfig = JSON.parse(banditsConfiguration);
      const banditsValidationErrors = validateBanditsConfiguration(parsedBanditsConfig);

      if (banditsValidationErrors.length > 0) {
        const errorMessage = `Invalid bandits configuration: ${banditsValidationErrors.join(', ')}`;
        if (throwOnFailedInitialization) {
          throw new Error(errorMessage);
        }
        applicationLogger.warn(
          `${errorMessage}. Skipping bandit configuration - bandit assignments will not work.`,
        );
        // Skip loading bandits config, store remains empty
      } else {
        const banditsConfigResponse = parsedBanditsConfig as BanditsConfigurationResponse;
        banditModelConfigurationStore
          .setEntries(banditsConfigResponse.bandits)
          .catch((err) =>
            applicationLogger.warn(
              `Error setting bandit models for memory-only configuration store: ${err}`,
            ),
          );
      }
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
