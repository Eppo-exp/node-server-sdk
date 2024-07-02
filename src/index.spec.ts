import {
  constants,
  EppoClient,
  FlagConfigurationRequestParameters,
  HttpClient,
  IConfigurationStore,
  Flag,
  VariationType,
} from '@eppo/js-client-sdk-common';
import * as td from 'testdouble';

import apiServer, { TEST_SERVER_PORT } from '../test/mockApiServer';
import {
  getTestAssignments,
  IAssignmentTestCase,
  readAssignmentTestData,
  SubjectTestCase,
  validateTestAssignments,
} from '../test/testHelpers';

import { getInstance, IAssignmentEvent, IAssignmentLogger, init } from '.';

const { POLL_INTERVAL_MS, POLL_JITTER_PCT } = constants;

describe('EppoClient E2E test', () => {
  const mockLogger: IAssignmentLogger = {
    logAssignment(assignment: IAssignmentEvent) {
      console.log(`Logged assignment for subject ${assignment.subject}`);
    },
  };

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
        apiKey: 'dummy',
        baseUrl: `http://127.0.0.1:${TEST_SERVER_PORT}`,
        assignmentLogger: mockLogger,
      });
    });

    describe('UFC General Test Cases', () => {
      it.each(readAssignmentTestData())(
        'test variation assignment splits',
        async ({ flag, variationType, defaultValue, subjects }: IAssignmentTestCase) => {
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
        },
      );
    });

    it('returns the default value when ufc config is absent', () => {
      const mockConfigStore = td.object<IConfigurationStore<Flag>>();
      td.when(mockConfigStore.get(flagKey)).thenReturn(null);
      const client = new EppoClient(mockConfigStore, undefined, undefined, requestParamsStub);
      const assignment = client.getStringAssignment(flagKey, 'subject-10', {}, 'default-value');
      expect(assignment).toEqual('default-value');
    });

    it('logs variation assignment and experiment key', () => {
      const mockConfigStore = td.object<IConfigurationStore<Flag>>();
      td.when(mockConfigStore.get(flagKey)).thenReturn(mockUfcFlagConfig);
      const subjectAttributes = { foo: 3 };
      const client = new EppoClient(mockConfigStore, undefined, undefined, requestParamsStub);
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
      const client = new EppoClient(mockConfigStore, undefined, undefined, requestParamsStub);
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

  describe('initialization errors', () => {
    const maxRetryDelay = POLL_INTERVAL_MS * POLL_JITTER_PCT;
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
        apiKey: 'dummy',
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
          apiKey: 'dummy',
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
      await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
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
        apiKey: 'dummy',
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

      await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

      // Expect a new call from poller
      expect(callCount).toBe(3);

      // Assignments now working
      expect(client.getStringAssignment(flagKey, 'subject', {}, 'default-value')).toBe('control');
    });
  });
});
