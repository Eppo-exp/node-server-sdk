import {
  constants,
  EppoClient,
  FlagConfigurationRequestParameters,
  HttpClient,
  IConfigurationStore,
  Flag,
  VariationType,
  IBanditEvent,
  IBanditLogger,
  IConfigurationWire,
  ContextAttributes,
  Attributes,
  decodePrecomputedFlag,
  BanditParameters,
  BanditVariation,
} from '@eppo/js-client-sdk-common';
import * as base64 from 'js-base64';
import * as td from 'testdouble';

import apiServer, { TEST_BANDIT_API_KEY, TEST_SERVER_PORT } from '../test/mockApiServer';
import {
  ASSIGNMENT_TEST_DATA_DIR,
  BANDIT_TEST_DATA_DIR,
  BanditTestCase,
  getTestAssignments,
  IAssignmentTestCase,
  SubjectTestCase,
  testCasesByFileName,
  validateTestAssignments,
} from '../test/testHelpers';

import * as util from './util/index';

import {
  getBanditsConfiguration,
  getFlagsConfiguration,
  getInstance,
  IAssignmentEvent,
  IAssignmentLogger,
  init,
  NO_OP_EVENT_DISPATCHER,
  offlineInit,
} from '.';

import SpyInstance = jest.SpyInstance;

const { DEFAULT_POLL_INTERVAL_MS, POLL_JITTER_PCT } = constants;

const apiKey = 'zCsQuoHJxVPp895.ZWg9MTIzNDU2LmUudGVzdGluZy5lcHBvLmNsb3Vk';

describe('EppoClient E2E test', () => {
  const mockLogger: IAssignmentLogger = {
    logAssignment(assignment: IAssignmentEvent) {
      console.log(`Logged assignment for subject ${assignment.subject}`);
    },
  };

  // These two stores should not be used as this file doesn't test bandits, but we want them to be defined so bandit
  // functionality is still "on" for the client when we explicitly instantiate the client (vs. using init())
  const mockBanditVariationStore = td.object<IConfigurationStore<BanditVariation[]>>();
  const mockBanditModelStore = td.object<IConfigurationStore<BanditParameters>>();
  const flagKey = 'mock-experiment';

  // Configuration for a single flag within the UFC.
  const mockUfcFlagConfig: Flag = {
    key: flagKey,
    enabled: true,
    variationType: VariationType.STRING,
    variations: {
      control: {
        key: 'control',
        value: 'control',
      },
      'variant-1': {
        key: 'variant-1',
        value: 'variant-1',
      },
      'variant-2': {
        key: 'variant-2',
        value: 'variant-2',
      },
    },
    allocations: [
      {
        key: 'traffic-split',
        rules: [],
        splits: [
          {
            variationKey: 'control',
            shards: [
              {
                salt: 'some-salt',
                ranges: [{ start: 0, end: 3400 }],
              },
            ],
          },
          {
            variationKey: 'variant-1',
            shards: [
              {
                salt: 'some-salt',
                ranges: [{ start: 3400, end: 6700 }],
              },
            ],
          },
          {
            variationKey: 'variant-2',
            shards: [
              {
                salt: 'some-sat',
                ranges: [{ start: 6700, end: 10000 }],
              },
            ],
          },
        ],
        doLog: true,
      },
    ],
    totalShards: 10000,
  };

  beforeAll(() => {
    jest.useFakeTimers({
      advanceTimers: true,
      doNotFake: [
        'Date',
        'hrtime',
        'nextTick',
        'performance',
        'queueMicrotask',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'requestIdleCallback',
        'cancelIdleCallback',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
      ],
    });
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  afterAll(async () => {
    jest.useRealTimers();
    td.reset();
    return new Promise<void>((resolve, reject) => {
      apiServer.close((error) => {
        if (error) {
          reject(error);
        }
        console.log('closed server');
        resolve();
      });
    });
  });

  describe('successfully initialized', () => {
    const requestParamsStub = td.object<FlagConfigurationRequestParameters>();

    beforeAll(async () => {
      await init({
        apiKey,
        baseUrl: `http://127.0.0.1:${TEST_SERVER_PORT}`,
        assignmentLogger: mockLogger,
      });
    });

    describe('Shared UFC General Test Cases', () => {
      const testCases = testCasesByFileName<IAssignmentTestCase>(ASSIGNMENT_TEST_DATA_DIR);

      it.each(Object.keys(testCases))('test variation assignment splits - %s', async (fileName) => {
        const { flag, variationType, defaultValue, subjects } = testCases[fileName];
        const client = getInstance();

        let assignments: {
          subject: SubjectTestCase;
          assignment: string | boolean | number | object;
        }[] = [];

        const typeAssignmentFunctions = {
          [VariationType.BOOLEAN]: client.getBooleanAssignment.bind(client),
          [VariationType.NUMERIC]: client.getNumericAssignment.bind(client),
          [VariationType.INTEGER]: client.getIntegerAssignment.bind(client),
          [VariationType.STRING]: client.getStringAssignment.bind(client),
          [VariationType.JSON]: client.getJSONAssignment.bind(client),
        };

        const assignmentFn = typeAssignmentFunctions[variationType];
        if (!assignmentFn) {
          throw new Error(`Unknown variation type: ${variationType}`);
        }

        assignments = getTestAssignments(
          { flag, variationType, defaultValue, subjects },
          assignmentFn,
          false,
        );

        validateTestAssignments(assignments, flag);
      });
    });

    it('returns the default value when ufc config is absent', () => {
      const mockConfigStore = td.object<IConfigurationStore<Flag>>();
      td.when(mockConfigStore.get(flagKey)).thenReturn(null);
      const client = new EppoClient({
        flagConfigurationStore: mockConfigStore,
        banditVariationConfigurationStore: mockBanditVariationStore,
        banditModelConfigurationStore: mockBanditModelStore,
        configurationRequestParameters: requestParamsStub,
      });
      const assignment = client.getStringAssignment(flagKey, 'subject-10', {}, 'default-value');
      expect(assignment).toEqual('default-value');
    });

    it('logs variation assignment and experiment key', () => {
      const mockConfigStore = td.object<IConfigurationStore<Flag>>();
      td.when(mockConfigStore.get(flagKey)).thenReturn(mockUfcFlagConfig);
      const subjectAttributes = { foo: 3 };
      const client = new EppoClient({
        flagConfigurationStore: mockConfigStore,
        banditVariationConfigurationStore: mockBanditVariationStore,
        banditModelConfigurationStore: mockBanditModelStore,
        configurationRequestParameters: requestParamsStub,
      });
      const mockLogger = td.object<IAssignmentLogger>();
      client.setAssignmentLogger(mockLogger);
      const assignment = client.getStringAssignment(
        flagKey,
        'subject-10',
        subjectAttributes,
        'default-value',
      );
      expect(assignment).toEqual('variant-1');
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);
      expect(td.explain(mockLogger.logAssignment).calls[0].args[0].subject).toEqual('subject-10');
      expect(td.explain(mockLogger.logAssignment).calls[0].args[0].featureFlag).toEqual(flagKey);
      expect(td.explain(mockLogger.logAssignment).calls[0].args[0].experiment).toEqual(
        `${flagKey}-${mockUfcFlagConfig?.allocations[0].key}`,
      );
      expect(td.explain(mockLogger.logAssignment).calls[0].args[0].allocation).toEqual(
        `${mockUfcFlagConfig?.allocations[0].key}`,
      );
    });

    it('handles logging exception', () => {
      const mockConfigStore = td.object<IConfigurationStore<Flag>>();
      td.when(mockConfigStore.get(flagKey)).thenReturn(mockUfcFlagConfig);
      const subjectAttributes = { foo: 3 };
      const client = new EppoClient({
        flagConfigurationStore: mockConfigStore,
        banditVariationConfigurationStore: mockBanditVariationStore,
        banditModelConfigurationStore: mockBanditModelStore,
        configurationRequestParameters: requestParamsStub,
      });
      const mockLogger = td.object<IAssignmentLogger>();
      td.when(mockLogger.logAssignment(td.matchers.anything())).thenThrow(
        new Error('logging error'),
      );
      client.setAssignmentLogger(mockLogger);
      const assignment = client.getStringAssignment(
        flagKey,
        'subject-10',
        subjectAttributes,
        'default-value',
      );
      expect(assignment).toEqual('variant-1');
    });
  });

  describe('get precomputed assignments', () => {
    it('obfuscates assignments', async () => {
      const client = await init({
        apiKey,
        baseUrl: `http://127.0.0.1:${TEST_SERVER_PORT}`,
        assignmentLogger: mockLogger,
      });
      const subjectAttributes = { id: 'zach' };
      const expectedAssignment = client.getStringAssignment(
        'new-user-onboarding',
        'subject',
        subjectAttributes,
        'default-value',
      );
      expect(expectedAssignment).toBe('purple');
      const salt = base64.fromUint8Array(new Uint8Array([7, 53, 17, 78]));
      const encodedPrecomputedWire = client.getPrecomputedConfiguration(
        'subject',
        subjectAttributes,
        {},
        salt,
      );
      const { precomputed } = JSON.parse(encodedPrecomputedWire) as IConfigurationWire;
      if (!precomputed) {
        fail('Precomputed data not in Configuration response');
      }
      const precomputedResponse = JSON.parse(precomputed.response);
      expect(precomputedResponse).toBeTruthy();
      expect(precomputedResponse.salt).toEqual('BzURTg==');
      const precomputedFlags = precomputedResponse?.flags ?? {};
      expect(Object.keys(precomputedFlags)).toContain('f0da9e751eb86ad80968df152390fa4f'); // 'new-user-onboarding', md5 hashed
      const decodedFirstFlag = decodePrecomputedFlag(
        precomputedFlags['f0da9e751eb86ad80968df152390fa4f'],
      );
      expect(decodedFirstFlag.flagKey).toEqual('f0da9e751eb86ad80968df152390fa4f');
      expect(decodedFirstFlag.variationType).toEqual(VariationType.STRING);
      expect(decodedFirstFlag.variationKey).toEqual('purple');
      expect(decodedFirstFlag.variationValue).toEqual('purple');
      expect(decodedFirstFlag.doLog).toEqual(false);
      expect(decodedFirstFlag.extraLogging).toEqual({});
    });
  });

  describe('Shared Bandit Test Cases', () => {
    beforeAll(async () => {
      const dummyBanditLogger: IBanditLogger = {
        logBanditAction(banditEvent: IBanditEvent) {
          console.log(
            `Bandit ${banditEvent.bandit} assigned ${banditEvent.subject} the action ${banditEvent.action}`,
          );
        },
      };

      await init({
        apiKey: TEST_BANDIT_API_KEY, // Flag to dummy test server we want bandit-related files
        baseUrl: `http://127.0.0.1:${TEST_SERVER_PORT}`,
        assignmentLogger: mockLogger,
        banditLogger: dummyBanditLogger,
      });
    });

    const testCases = testCasesByFileName<BanditTestCase>(BANDIT_TEST_DATA_DIR);

    it.each(Object.keys(testCases))('Shared bandit test case - %s', async (fileName: string) => {
      const { flag: flagKey, defaultValue, subjects } = testCases[fileName];
      let numAssignmentsChecked = 0;
      subjects.forEach((subject) => {
        // test files have actions as an array, so we convert them to a map as expected by the client
        const actions: Record<string, ContextAttributes> = {};
        subject.actions.forEach((action) => {
          actions[action.actionKey] = {
            numericAttributes: action.numericAttributes,
            categoricalAttributes: action.categoricalAttributes,
          };
        });

        // get the bandit assignment for the test case
        const banditAssignment = getInstance().getBanditAction(
          flagKey,
          subject.subjectKey,
          subject.subjectAttributes,
          actions,
          defaultValue,
        );

        // Do this check in addition to assertions to provide helpful information on exactly which
        // evaluation failed to produce an expected result
        if (
          banditAssignment.variation !== subject.assignment.variation ||
          banditAssignment.action !== subject.assignment.action
        ) {
          console.error(`Unexpected result for flag ${flagKey} and subject ${subject.subjectKey}`);
        }

        expect(banditAssignment.variation).toBe(subject.assignment.variation);
        expect(banditAssignment.action).toBe(subject.assignment.action);
        numAssignmentsChecked += 1;
      });
      // Ensure that this test case correctly checked some test assignments
      expect(numAssignmentsChecked).toBeGreaterThan(0);
    });

    describe('Bandit assignment cache', () => {
      const flagKey = 'banner_bandit_flag'; // piggyback off a shared test data flag
      const bobKey = 'bob';
      const bobAttributes: Attributes = {
        age: 25,
        country: 'USA',
        gender_identity: 'female',
      };
      const bobActions: Record<string, Attributes> = {
        nike: { brand_affinity: 1.5, loyalty_tier: 'silver' },
        adidas: { brand_affinity: -1.0, loyalty_tier: 'bronze' },
        reebok: { brand_affinity: 0.5, loyalty_tier: 'gold' },
      };

      const aliceKey = 'alice';
      const aliceAttributes: Attributes = {
        age: 25,
        country: 'USA',
        gender_identity: 'female',
      };
      const aliceActions: Record<string, Attributes> = {
        nike: { brand_affinity: 1.5, loyalty_tier: 'silver' },
        adidas: { brand_affinity: -1.0, loyalty_tier: 'bronze' },
        reebok: { brand_affinity: 0.5, loyalty_tier: 'gold' },
      };
      const charlieKey = 'charlie';
      const charlieAttributes: Attributes = {
        age: 25,
        country: 'USA',
        gender_identity: 'female',
      };
      const charlieActions: Record<string, Attributes> = {
        nike: { brand_affinity: 1.0, loyalty_tier: 'gold' },
        adidas: { brand_affinity: 1.0, loyalty_tier: 'silver' },
        puma: {},
      };

      let banditLoggerSpy: SpyInstance<void, [banditEvent: IBanditEvent]>;
      const defaultBanditCacheTTL = 600_000;

      beforeAll(async () => {
        const dummyBanditLogger: IBanditLogger = {
          logBanditAction(banditEvent: IBanditEvent) {
            console.log(
              `Bandit ${banditEvent.bandit} assigned ${banditEvent.subject} the action ${banditEvent.action}`,
            );
          },
        };
        banditLoggerSpy = jest.spyOn(dummyBanditLogger, 'logBanditAction');
        await init({
          apiKey: TEST_BANDIT_API_KEY, // Flag to dummy test server we want bandit-related files
          baseUrl: `http://127.0.0.1:${TEST_SERVER_PORT}`,
          assignmentLogger: mockLogger,
          banditLogger: dummyBanditLogger,
        });
      });

      it('Should not log bandit assignment if cached version is still valid', async () => {
        const client = getInstance();
        client.useExpiringInMemoryBanditAssignmentCache(2);

        // Let's say someone is rage refreshing - we want to log assignment only once
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for (const _ of Array(3).keys()) {
          client.getBanditAction(flagKey, bobKey, bobAttributes, bobActions, 'default');
        }
        expect(banditLoggerSpy).toHaveBeenCalledTimes(1);
      });
      it('Should log bandit assignment if cached entry is expired', async () => {
        jest.useFakeTimers();
        banditLoggerSpy.mockReset();

        const client = getInstance();
        client.useExpiringInMemoryBanditAssignmentCache(2);

        client.getBanditAction(flagKey, bobKey, bobAttributes, bobActions, 'default');
        jest.advanceTimersByTime(defaultBanditCacheTTL);
        client.getBanditAction(flagKey, bobKey, bobAttributes, bobActions, 'default');
        expect(banditLoggerSpy).toHaveBeenCalledTimes(2);
      });

      it('Should invalidate least used cache entry if cache reaches max size', async () => {
        banditLoggerSpy.mockReset();
        const client = getInstance();
        client.useExpiringInMemoryBanditAssignmentCache(2);

        client.getBanditAction(flagKey, bobKey, bobAttributes, bobActions, 'default');
        client.getBanditAction(flagKey, aliceKey, aliceAttributes, aliceActions, 'default');
        client.getBanditAction(flagKey, charlieKey, charlieAttributes, charlieActions, 'default');
        // even though bob was called 2nd time within cache validity time
        // we expect assignment to be logged because max cache size is 2
        // and currently storing alice and charlie
        client.getBanditAction(flagKey, bobKey, bobAttributes, bobActions, 'default');
        expect(banditLoggerSpy).toHaveBeenCalledTimes(4);
      });
    });
  });

  describe('Best Bandit Action', () => {
    const flagKey = 'banner_bandit_flag'; // piggyback off a shared test data flag
    const bobAttributes: Attributes = {
      age: 25,
      country: 'USA',
      gender_identity: 'female',
    };
    const bobActions: Record<string, Attributes> = {
      nike: { brand_affinity: -10.5, loyalty_tier: 'silver' },
      adidas: { brand_affinity: 1.0, loyalty_tier: 'bronze' },
      reebok: { brand_affinity: 0.5, loyalty_tier: 'gold' },
    };

    beforeAll(async () => {
      await init({
        apiKey: TEST_BANDIT_API_KEY, // Flag to dummy test server we want bandit-related files
        baseUrl: `http://127.0.0.1:${TEST_SERVER_PORT}`,
        assignmentLogger: mockLogger,
      });
    });

    it('Should return the highest ranked bandit', async () => {
      const client = getInstance();
      const bestAction = client.getBestAction(flagKey, bobAttributes, bobActions, 'default');

      expect(bestAction).toEqual('adidas');
    });
  });

  describe('initialization errors', () => {
    const maxRetryDelay = DEFAULT_POLL_INTERVAL_MS * POLL_JITTER_PCT;
    const mockConfigResponse = {
      flags: {
        [flagKey]: mockUfcFlagConfig,
      },
    };

    afterEach(() => {
      td.reset();
    });

    it('retries initial configuration request before resolving', async () => {
      td.replace(HttpClient.prototype, 'getUniversalFlagConfiguration');
      let callCount = 0;
      td.when(HttpClient.prototype.getUniversalFlagConfiguration()).thenDo(() => {
        if (++callCount === 1) {
          // Throw an error for the first call
          throw new Error('Intentional Thrown Error For Test');
        } else {
          // Return a mock object for subsequent calls
          return mockConfigResponse;
        }
      });

      // By not awaiting (yet) only the first attempt should be fired off before test execution below resumes
      const initPromise = init({
        apiKey,
        baseUrl: `http://127.0.0.1:${TEST_SERVER_PORT}`,
        assignmentLogger: mockLogger,
      });

      // Advance timers mid-init to allow retrying
      await jest.advanceTimersByTimeAsync(maxRetryDelay);

      // Await so it can finish its initialization before this test proceeds
      await initPromise;

      const client = getInstance();
      expect(client.getStringAssignment(flagKey, 'subject', {}, 'default-value')).toBe('control');
    });

    it('gives up initial request and throws error after hitting max retries', async () => {
      td.replace(HttpClient.prototype, 'getUniversalFlagConfiguration');
      let callCount = 0;
      td.when(HttpClient.prototype.getUniversalFlagConfiguration()).thenDo(async () => {
        callCount += 1;
        throw new Error('Intentional Thrown Error For Test');
      });

      // Note: fake time does not play well with errors bubbled up after setTimeout (event loop,
      // timeout queue, message queue stuff) so we don't allow retries when rethrowing.
      await expect(
        init({
          apiKey,
          baseUrl: `http://127.0.0.1:${TEST_SERVER_PORT}`,
          assignmentLogger: mockLogger,
          numInitialRequestRetries: 0,
        }),
      ).rejects.toThrow();

      expect(callCount).toBe(1);

      // Assignments resolve to default value.
      const client = getInstance();
      expect(client.getStringAssignment(flagKey, 'subject', {}, 'default-value')).toBe(
        'default-value',
      );

      // Expect no further configuration requests
      await jest.advanceTimersByTimeAsync(DEFAULT_POLL_INTERVAL_MS);
      expect(callCount).toBe(1);
    });

    it('gives up initial request but still polls later if configured to do so', async () => {
      td.replace(HttpClient.prototype, 'getUniversalFlagConfiguration');
      let callCount = 0;
      td.when(HttpClient.prototype.getUniversalFlagConfiguration()).thenDo(() => {
        if (++callCount <= 2) {
          // Throw an error for the first call
          throw new Error('Intentional Thrown Error For Test');
        } else {
          // Return a mock object for subsequent calls
          return mockConfigResponse;
        }
      });

      // By not awaiting (yet) only the first attempt should be fired off before test execution below resumes
      const initPromise = init({
        apiKey,
        baseUrl: `http://127.0.0.1:${TEST_SERVER_PORT}`,
        assignmentLogger: mockLogger,
        throwOnFailedInitialization: false,
        pollAfterFailedInitialization: true,
      });

      // Advance timers mid-init to allow retrying
      await jest.advanceTimersByTimeAsync(maxRetryDelay);

      // Initialization configured to not throw error
      await initPromise;
      expect(callCount).toBe(2);

      // Initial assignments resolve to default value.
      const client = getInstance();
      expect(client.getStringAssignment(flagKey, 'subject', {}, 'default-value')).toBe(
        'default-value',
      );

      await jest.advanceTimersByTimeAsync(DEFAULT_POLL_INTERVAL_MS);

      // Expect a new call from poller
      expect(callCount).toBe(3);

      // Assignments now working
      expect(client.getStringAssignment(flagKey, 'subject', {}, 'default-value')).toBe('control');
    });
  });

  describe('eventTracking', () => {
    it('should be disabled by default', async () => {
      const client = await init({
        apiKey,
        baseUrl: `http://127.0.0.1:${TEST_SERVER_PORT}`,
        assignmentLogger: mockLogger,
      });
      expect(client['eventDispatcher']).toEqual(NO_OP_EVENT_DISPATCHER);
    });

    it('should be enabled if eventTracking.enabled is true', async () => {
      const client = await init({
        apiKey,
        baseUrl: `http://127.0.0.1:${TEST_SERVER_PORT}`,
        assignmentLogger: mockLogger,
        eventTracking: {
          enabled: true,
        },
      });
      expect(client['eventDispatcher']).not.toEqual(NO_OP_EVENT_DISPATCHER);
    });

    describe('read-only file system handling', () => {
      // Save original implementation
      let isReadOnlyFsSpy: SpyInstance;

      beforeEach(() => {
        // Create a spy on isReadOnlyFs that we can mock
        isReadOnlyFsSpy = jest.spyOn(util, 'isReadOnlyFs');
      });

      afterEach(() => {
        isReadOnlyFsSpy.mockRestore();
      });

      it('should use BoundedEventQueue when file system is read-only', async () => {
        // Mock isReadOnlyFs to return true (read-only file system)
        isReadOnlyFsSpy.mockReturnValue(true);
        const client = await init({
          apiKey,
          baseUrl: `http://127.0.0.1:${TEST_SERVER_PORT}`,
          assignmentLogger: mockLogger,
          eventTracking: {
            enabled: true,
          },
        });

        // Check that the event queue is a BoundedEventQueue
        // We can't directly check the type, but we can check that it's not a FileBackedNamedEventQueue
        // by checking if the queue has a 'queueDirectory' property
        const eventDispatcher = client['eventDispatcher'];
        const eventQueue = eventDispatcher['batchProcessor']['eventQueue'];
        expect(eventQueue).toBeDefined();
        expect(eventQueue['queueDirectory']).toBeUndefined();
      });

      it('should use FileBackedNamedEventQueue when file system is writable', async () => {
        // Mock isReadOnlyFs to return false (writable file system)
        isReadOnlyFsSpy.mockReturnValue(false);
        const client = await init({
          apiKey,
          baseUrl: `http://127.0.0.1:${TEST_SERVER_PORT}`,
          assignmentLogger: mockLogger,
          eventTracking: {
            enabled: true,
          },
        });

        // Check that the event queue is a FileBackedNamedEventQueue
        // by checking if the queue has a 'queueDirectory' property
        const eventDispatcher = client['eventDispatcher'];
        const eventQueue = eventDispatcher['batchProcessor']['eventQueue'];
        expect(eventQueue).toBeDefined();
        expect(eventQueue['queueDirectory']).toBeDefined();
      });

      it('should use BoundedEventQueue when isReadOnlyFs throws an error', async () => {
        // Mock isReadOnlyFs to throw an error
        isReadOnlyFsSpy.mockImplementation(() => {
          throw new Error('Test error');
        });
        const client = await init({
          apiKey,
          baseUrl: `http://127.0.0.1:${TEST_SERVER_PORT}`,
          assignmentLogger: mockLogger,
          eventTracking: {
            enabled: true,
          },
        });

        // Check that the event queue is a BoundedEventQueue
        const eventDispatcher = client['eventDispatcher'];
        const eventQueue = eventDispatcher['batchProcessor']['eventQueue'];
        expect(eventQueue).toBeDefined();
        expect(eventQueue['queueDirectory']).toBeUndefined();
      });
    });
  });

  describe('pollAfterSuccessfulInitialization', () => {
    it('should default to true when not specified', async () => {
      const client = await init({
        apiKey,
        baseUrl: `http://127.0.0.1:${TEST_SERVER_PORT}`,
        assignmentLogger: mockLogger,
      });

      // Access the internal configurationRequestParameters to verify the default
      const configurationRequestParameters = client['configurationRequestParameters'];
      expect(configurationRequestParameters.pollAfterSuccessfulInitialization).toBe(true);
    });

    it('should use the provided value when specified', async () => {
      const client = await init({
        apiKey,
        baseUrl: `http://127.0.0.1:${TEST_SERVER_PORT}`,
        assignmentLogger: mockLogger,
        pollAfterSuccessfulInitialization: false,
      });

      // Access the internal configurationRequestParameters to verify the custom value
      const configurationRequestParameters = client['configurationRequestParameters'];
      expect(configurationRequestParameters.pollAfterSuccessfulInitialization).toBe(false);
    });
  });

  describe('getFlagsConfiguration', () => {
    let client: EppoClient | null = null;

    afterAll(() => {
      if (client) {
        client.stopPolling();
      }
    });

    it('returns configuration JSON matching flags-v1.json structure', async () => {
      client = await init({
        apiKey: 'dummy',
        baseUrl: `http://127.0.0.1:${TEST_SERVER_PORT}`,
        assignmentLogger: { logAssignment: jest.fn() },
      });

      const exportedConfig = getFlagsConfiguration();
      expect(exportedConfig).not.toBeNull();

      const parsed = JSON.parse(exportedConfig ?? '');

      // Verify top-level metadata
      expect(parsed.format).toBe('SERVER');
      expect(parsed.createdAt).toBe('2024-04-17T19:40:53.716Z');
      expect(parsed.environment).toEqual({ name: 'Test' });

      // Verify exact number of flags from flags-v1.json
      expect(Object.keys(parsed.flags).length).toBe(22);

      // Verify a complex flag with rules and conditions: new-user-onboarding
      const flag = parsed.flags['new-user-onboarding'];
      expect(flag).toBeDefined();
      expect(flag.key).toBe('new-user-onboarding');
      expect(flag.enabled).toBe(true);
      expect(flag.variationType).toBe('STRING');
      expect(flag.totalShards).toBe(10000);

      // Verify variations
      expect(Object.keys(flag.variations).length).toBe(6);
      expect(flag.variations.control).toEqual({ key: 'control', value: 'control' });
      expect(flag.variations.red).toEqual({ key: 'red', value: 'red' });
      expect(flag.variations.blue).toEqual({ key: 'blue', value: 'blue' });
      expect(flag.variations.green).toEqual({ key: 'green', value: 'green' });
      expect(flag.variations.yellow).toEqual({ key: 'yellow', value: 'yellow' });
      expect(flag.variations.purple).toEqual({ key: 'purple', value: 'purple' });

      // Verify allocations structure
      expect(flag.allocations.length).toBe(4);

      // First allocation: "id rule" with MATCHES condition
      const idRuleAlloc = flag.allocations[0];
      expect(idRuleAlloc.key).toBe('id rule');
      expect(idRuleAlloc.doLog).toBe(false);
      expect(idRuleAlloc.rules.length).toBe(1);
      expect(idRuleAlloc.rules[0].conditions.length).toBe(1);
      expect(idRuleAlloc.rules[0].conditions[0]).toEqual({
        attribute: 'id',
        operator: 'MATCHES',
        value: 'zach',
      });
      expect(idRuleAlloc.splits[0].variationKey).toBe('purple');

      // Second allocation: "internal users" with MATCHES condition
      const internalUsersAlloc = flag.allocations[1];
      expect(internalUsersAlloc.key).toBe('internal users');
      expect(internalUsersAlloc.rules[0].conditions[0]).toEqual({
        attribute: 'email',
        operator: 'MATCHES',
        value: '@mycompany.com',
      });

      // Third allocation: "experiment" with NOT_ONE_OF condition and shards
      const experimentAlloc = flag.allocations[2];
      expect(experimentAlloc.key).toBe('experiment');
      expect(experimentAlloc.doLog).toBe(true);
      expect(experimentAlloc.rules[0].conditions[0].operator).toBe('NOT_ONE_OF');
      expect(experimentAlloc.rules[0].conditions[0].value).toEqual(['US', 'Canada', 'Mexico']);
      expect(experimentAlloc.splits.length).toBe(3); // control, red, yellow

      // Fourth allocation: "rollout" with ONE_OF condition and extraLogging
      const rolloutAlloc = flag.allocations[3];
      expect(rolloutAlloc.key).toBe('rollout');
      expect(rolloutAlloc.rules[0].conditions[0].operator).toBe('ONE_OF');
      expect(rolloutAlloc.splits[0].extraLogging).toEqual({
        allocationvalue_type: 'rollout',
        owner: 'hippo',
      });
    });
  });

  describe('getBanditsConfiguration', () => {
    it('returns empty bandits configuration when no bandits are configured', async () => {
      await init({
        apiKey: 'dummy',
        baseUrl: `http://127.0.0.1:${TEST_SERVER_PORT}`,
        assignmentLogger: { logAssignment: jest.fn() },
      });

      // The default mock doesn't include bandits, so this should return an empty bandits map
      const banditsConfig = getBanditsConfiguration();
      expect(banditsConfig).not.toBeNull();
      expect(banditsConfig).toBeDefined();
      const parsed = JSON.parse(banditsConfig as string);
      expect(parsed.bandits).toEqual({});
      expect(parsed.updatedAt).toBeDefined();
    });

    it('returns bandits configuration JSON matching bandit-models-v1.json structure', async () => {
      await init({
        apiKey: TEST_BANDIT_API_KEY,
        baseUrl: `http://127.0.0.1:${TEST_SERVER_PORT}`,
        assignmentLogger: { logAssignment: jest.fn() },
        banditLogger: { logBanditAction: jest.fn() },
      });

      const banditsConfig = getBanditsConfiguration();
      expect(banditsConfig).not.toBeNull();

      const parsed = JSON.parse(banditsConfig ?? '');

      // Verify exact number of bandits from bandit-models-v1.json
      expect(Object.keys(parsed.bandits).length).toBe(3);
      expect(Object.keys(parsed.bandits).sort()).toEqual([
        'banner_bandit',
        'car_bandit',
        'cold_start_bandit',
      ]);

      // Verify banner_bandit structure in detail
      const bannerBandit = parsed.bandits['banner_bandit'];
      expect(bannerBandit.banditKey).toBe('banner_bandit');
      expect(bannerBandit.modelName).toBe('falcon');
      expect(bannerBandit.modelVersion).toBe('123');
      expect(bannerBandit.updatedAt).toBe('2023-09-13T04:52:06.462Z');

      // Verify modelData
      expect(bannerBandit.modelData.gamma).toBe(1.0);
      expect(bannerBandit.modelData.defaultActionScore).toBe(0.0);
      expect(bannerBandit.modelData.actionProbabilityFloor).toBe(0.0);

      // Verify coefficients - should have nike and adidas
      expect(Object.keys(bannerBandit.modelData.coefficients).sort()).toEqual(['adidas', 'nike']);

      // Verify nike coefficient structure
      const nikeCoeff = bannerBandit.modelData.coefficients['nike'];
      expect(nikeCoeff.actionKey).toBe('nike');
      expect(nikeCoeff.intercept).toBe(1.0);
      expect(nikeCoeff.actionNumericCoefficients.length).toBe(1);
      expect(nikeCoeff.actionNumericCoefficients[0]).toEqual({
        attributeKey: 'brand_affinity',
        coefficient: 1.0,
        missingValueCoefficient: -0.1,
      });
      expect(nikeCoeff.actionCategoricalCoefficients.length).toBe(2);
      expect(nikeCoeff.subjectNumericCoefficients.length).toBe(1);
      expect(nikeCoeff.subjectCategoricalCoefficients.length).toBe(1);

      // Verify car_bandit has different settings
      const carBandit = parsed.bandits['car_bandit'];
      expect(carBandit.modelVersion).toBe('456');
      expect(carBandit.modelData.defaultActionScore).toBe(5.0);
      expect(carBandit.modelData.actionProbabilityFloor).toBe(0.2);
      expect(Object.keys(carBandit.modelData.coefficients)).toEqual(['toyota']);

      // Verify cold_start_bandit has empty coefficients
      const coldStartBandit = parsed.bandits['cold_start_bandit'];
      expect(coldStartBandit.modelVersion).toBe('cold start');
      expect(Object.keys(coldStartBandit.modelData.coefficients).length).toBe(0);
    });
  });
});

describe('offlineInit', () => {
  const flagKey = 'mock-experiment';

  // Configuration for a single flag within the UFC.
  const mockUfcFlagConfig: Flag = {
    key: flagKey,
    enabled: true,
    variationType: VariationType.STRING,
    variations: {
      control: {
        key: 'control',
        value: 'control',
      },
      'variant-1': {
        key: 'variant-1',
        value: 'variant-1',
      },
      'variant-2': {
        key: 'variant-2',
        value: 'variant-2',
      },
    },
    allocations: [
      {
        key: 'traffic-split',
        rules: [],
        splits: [
          {
            variationKey: 'control',
            shards: [
              {
                salt: 'some-salt',
                ranges: [{ start: 0, end: 3400 }],
              },
            ],
          },
          {
            variationKey: 'variant-1',
            shards: [
              {
                salt: 'some-salt',
                ranges: [{ start: 3400, end: 6700 }],
              },
            ],
          },
          {
            variationKey: 'variant-2',
            shards: [
              {
                salt: 'some-salt',
                ranges: [{ start: 6700, end: 10000 }],
              },
            ],
          },
        ],
        doLog: true,
      },
    ],
    totalShards: 10000,
  };

  // Helper to create a full configuration JSON string
  const createFlagsConfigJson = (
    flags: Record<string, Flag>,
    options: { createdAt?: string; format?: string } = {},
  ): string => {
    return JSON.stringify({
      createdAt: options.createdAt ?? '2024-04-17T19:40:53.716Z',
      format: options.format ?? 'SERVER',
      environment: { name: 'Test' },
      flags,
    });
  };

  describe('basic initialization', () => {
    it('initializes with flag configurations and returns correct assignments', () => {
      const client = offlineInit({
        flagsConfiguration: createFlagsConfigJson({ [flagKey]: mockUfcFlagConfig }),
      });

      // subject-10 should get variant-1 based on the hash
      const assignment = client.getStringAssignment(flagKey, 'subject-10', {}, 'default-value');
      expect(assignment).toEqual('variant-1');
    });

    it('returns default value when flag is not found', () => {
      const client = offlineInit({
        flagsConfiguration: createFlagsConfigJson({ [flagKey]: mockUfcFlagConfig }),
      });

      const assignment = client.getStringAssignment(
        'non-existent-flag',
        'subject-10',
        {},
        'default-value',
      );
      expect(assignment).toEqual('default-value');
    });

    it('initializes with empty configuration', () => {
      const client = offlineInit({
        flagsConfiguration: createFlagsConfigJson({}),
      });

      const assignment = client.getStringAssignment(flagKey, 'subject-10', {}, 'default-value');
      expect(assignment).toEqual('default-value');
    });

    it('makes client available via getInstance()', () => {
      offlineInit({
        flagsConfiguration: createFlagsConfigJson({ [flagKey]: mockUfcFlagConfig }),
      });

      const client = getInstance();
      const assignment = client.getStringAssignment(flagKey, 'subject-10', {}, 'default-value');
      expect(assignment).toEqual('variant-1');
    });
  });

  describe('assignment logging', () => {
    it('logs assignments when assignment logger is provided', () => {
      const mockLogger = td.object<IAssignmentLogger>();

      const client = offlineInit({
        flagsConfiguration: createFlagsConfigJson({ [flagKey]: mockUfcFlagConfig }),
        assignmentLogger: mockLogger,
      });

      client.getStringAssignment(flagKey, 'subject-10', { foo: 'bar' }, 'default-value');

      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);
      const loggedAssignment = td.explain(mockLogger.logAssignment).calls[0].args[0];
      expect(loggedAssignment.subject).toEqual('subject-10');
      expect(loggedAssignment.featureFlag).toEqual(flagKey);
      expect(loggedAssignment.allocation).toEqual('traffic-split');
    });

    it('does not throw when assignment logger throws', () => {
      const mockLogger = td.object<IAssignmentLogger>();
      td.when(mockLogger.logAssignment(td.matchers.anything())).thenThrow(
        new Error('logging error'),
      );

      const client = offlineInit({
        flagsConfiguration: createFlagsConfigJson({ [flagKey]: mockUfcFlagConfig }),
        assignmentLogger: mockLogger,
      });

      // Should not throw, even though logger throws
      const assignment = client.getStringAssignment(flagKey, 'subject-10', {}, 'default-value');
      expect(assignment).toEqual('variant-1');
    });
  });

  describe('configuration metadata', () => {
    it('extracts createdAt from configuration as configPublishedAt', () => {
      const createdAt = '2024-01-15T10:00:00.000Z';

      const client = offlineInit({
        flagsConfiguration: createFlagsConfigJson({ [flagKey]: mockUfcFlagConfig }, { createdAt }),
      });

      const result = client.getStringAssignmentDetails(flagKey, 'subject-10', {}, 'default-value');
      expect(result.evaluationDetails.configPublishedAt).toBe(createdAt);
    });
  });

  describe('error handling', () => {
    it('throws error by default when JSON parsing fails', () => {
      expect(() => {
        offlineInit({
          flagsConfiguration: 'invalid json',
        });
      }).toThrow();
    });

    it('does not throw when throwOnFailedInitialization is false', () => {
      expect(() => {
        offlineInit({
          flagsConfiguration: 'invalid json',
          throwOnFailedInitialization: false,
        });
      }).not.toThrow();
    });

    it('does not throw with valid empty flags configuration', () => {
      expect(() => {
        offlineInit({
          flagsConfiguration: createFlagsConfigJson({}),
        });
      }).not.toThrow();
    });
  });

  describe('no network requests', () => {
    it('does not have configurationRequestParameters (no polling)', () => {
      const client = offlineInit({
        flagsConfiguration: createFlagsConfigJson({ [flagKey]: mockUfcFlagConfig }),
      });

      // Access the internal configurationRequestParameters - should be undefined for offline mode
      const configurationRequestParameters = client['configurationRequestParameters'];
      expect(configurationRequestParameters).toBeUndefined();
    });
  });

  describe('bandit support', () => {
    it('initializes with bandit references and supports getBanditAction', () => {
      // Use realistic names inspired by bandit-flags-v1.json and bandit-models-v1.json
      const banditFlagKey = 'banner_bandit_flag';
      const banditKey = 'banner_bandit';

      // Flag configuration matching banner_bandit_flag structure
      const banditFlagConfig: Flag = {
        key: banditFlagKey,
        enabled: true,
        variationType: VariationType.STRING,
        variations: {
          control: {
            key: 'control',
            value: 'control',
          },
          [banditKey]: {
            key: banditKey,
            value: banditKey,
          },
        },
        allocations: [
          {
            key: 'training',
            rules: [],
            splits: [
              {
                variationKey: banditKey,
                shards: [
                  {
                    salt: 'traffic-split',
                    ranges: [{ start: 0, end: 10000 }],
                  },
                ],
              },
            ],
            doLog: true,
          },
        ],
        totalShards: 10000,
      };

      // Flags configuration with bandit references (matching bandit-flags-v1.json structure)
      const flagsConfigJson = JSON.stringify({
        createdAt: '2024-04-17T19:40:53.716Z',
        format: 'SERVER',
        environment: { name: 'Test' },
        flags: { [banditFlagKey]: banditFlagConfig },
        banditReferences: {
          [banditKey]: {
            modelVersion: '123',
            flagVariations: [
              {
                key: banditKey,
                flagKey: banditFlagKey,
                allocationKey: 'training',
                variationKey: banditKey,
                variationValue: banditKey,
              },
            ],
          },
        },
      });

      // Bandit model configuration (matching bandit-models-v1.json structure for banner_bandit)
      const banditsConfigJson = JSON.stringify({
        bandits: {
          [banditKey]: {
            banditKey,
            modelName: 'falcon',
            modelVersion: '123',
            updatedAt: '2023-09-13T04:52:06.462Z',
            modelData: {
              gamma: 1.0,
              defaultActionScore: 0.0,
              actionProbabilityFloor: 0.0,
              coefficients: {
                nike: {
                  actionKey: 'nike',
                  intercept: 1.0,
                  actionNumericCoefficients: [
                    {
                      attributeKey: 'brand_affinity',
                      coefficient: 1.0,
                      missingValueCoefficient: -0.1,
                    },
                  ],
                  actionCategoricalCoefficients: [
                    {
                      attributeKey: 'loyalty_tier',
                      valueCoefficients: { gold: 4.5, silver: 3.2, bronze: 1.9 },
                      missingValueCoefficient: 0.0,
                    },
                  ],
                  subjectNumericCoefficients: [
                    { attributeKey: 'account_age', coefficient: 0.3, missingValueCoefficient: 0.0 },
                  ],
                  subjectCategoricalCoefficients: [
                    {
                      attributeKey: 'gender_identity',
                      valueCoefficients: { female: 0.5, male: -0.5 },
                      missingValueCoefficient: 2.3,
                    },
                  ],
                },
                adidas: {
                  actionKey: 'adidas',
                  intercept: 1.1,
                  actionNumericCoefficients: [
                    {
                      attributeKey: 'brand_affinity',
                      coefficient: 2.0,
                      missingValueCoefficient: 1.2,
                    },
                  ],
                  actionCategoricalCoefficients: [],
                  subjectNumericCoefficients: [],
                  subjectCategoricalCoefficients: [
                    {
                      attributeKey: 'gender_identity',
                      valueCoefficients: { female: -1.0, male: 1.0 },
                      missingValueCoefficient: 0.0,
                    },
                  ],
                },
              },
            },
          },
        },
      });

      const client = offlineInit({
        flagsConfiguration: flagsConfigJson,
        banditsConfiguration: banditsConfigJson,
      });

      // Verify the client is initialized and can make flag assignments
      const assignment = client.getStringAssignment(banditFlagKey, 'alice', {}, 'default-value');
      expect(assignment).toEqual(banditKey);

      // Verify bandit action selection using "alice" from test-case-banner-bandit.json
      // alice with her attributes and actions should get nike
      const banditResult = client.getBanditAction(
        banditFlagKey,
        'alice',
        {
          numericAttributes: { age: 25 },
          categoricalAttributes: { country: 'USA', gender_identity: 'female' },
        },
        {
          nike: {
            numericAttributes: { brand_affinity: 1.5 },
            categoricalAttributes: { loyalty_tier: 'silver' },
          },
          adidas: {
            numericAttributes: { brand_affinity: -1.0 },
            categoricalAttributes: { loyalty_tier: 'bronze' },
          },
        },
        'default-value',
      );
      expect(banditResult.variation).toEqual(banditKey);
      expect(banditResult.action).toEqual('nike');
    });
  });
});
