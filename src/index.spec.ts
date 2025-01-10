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

import { getInstance, IAssignmentEvent, IAssignmentLogger, init } from '.';

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
      const bobAttributes: Attributes = { age: 25, country: 'USA', gender_identity: 'female' };
      const bobActions: Record<string, Attributes> = {
        nike: { brand_affinity: 1.5, loyalty_tier: 'silver' },
        adidas: { brand_affinity: -1.0, loyalty_tier: 'bronze' },
        reebok: { brand_affinity: 0.5, loyalty_tier: 'gold' },
      };

      const aliceKey = 'alice';
      const aliceAttributes: Attributes = { age: 25, country: 'USA', gender_identity: 'female' };
      const aliceActions: Record<string, Attributes> = {
        nike: { brand_affinity: 1.5, loyalty_tier: 'silver' },
        adidas: { brand_affinity: -1.0, loyalty_tier: 'bronze' },
        reebok: { brand_affinity: 0.5, loyalty_tier: 'gold' },
      };
      const charlieKey = 'charlie';
      const charlieAttributes: Attributes = { age: 25, country: 'USA', gender_identity: 'female' };
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
    const bobAttributes: Attributes = { age: 25, country: 'USA', gender_identity: 'female' };
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
});
