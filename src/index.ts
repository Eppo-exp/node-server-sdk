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
} from '@eppo/js-client-sdk-common';

export { IClientConfig };

let clientInstance: EppoClient;

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
    eventIngestionConfig,
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
    // For server-side, we always want to keep polling for the life of the process
    pollAfterSuccessfulInitialization: true,
    pollAfterFailedInitialization,
    pollingIntervalMs,
    throwOnFailedInitialization,
  };

  const flagConfigurationStore = new MemoryOnlyConfigurationStore<Flag>();
  const banditVariationConfigurationStore = new MemoryOnlyConfigurationStore<BanditVariation[]>();
  const banditModelConfigurationStore = new MemoryOnlyConfigurationStore<BanditParameters>();
  const eventDispatcher = newEventDispatcher(apiKey, eventIngestionConfig);

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

function newEventDispatcher(
  sdkKey: string,
  eventIngestionConfig: IClientConfig['eventIngestionConfig'] = {
    disabled: false,
  },
): EventDispatcher {
  if (eventIngestionConfig.disabled) {
    return NO_OP_EVENT_DISPATCHER;
  }

  let eventQueue: NamedEventQueue<Event>;
  try {
    // Check if the file system is read-only
    if (isReadOnlyFs(`${process.cwd()}/.queues`)) {
      applicationLogger.warn(
        'File system appears to be read-only. Using in-memory event queue instead.',
      );
      eventQueue = new BoundedEventQueue<Event>('events');
    } else {
      eventQueue = new FileBackedNamedEventQueue<Event>('events');
    }
  } catch (error) {
    // If there's any error during the check, fall back to BoundedEventQueue
    applicationLogger.warn(
      `Error checking file system: ${error}. Using in-memory event queue instead.`,
    );
    eventQueue = new BoundedEventQueue<Event>('events');
  }

  const emptyNetworkStatusListener =
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    { isOffline: () => false, onNetworkStatusChange: () => {} };
  return newDefaultEventDispatcher(eventQueue, emptyNetworkStatusListener, sdkKey);
}
