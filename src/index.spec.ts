import { HttpClient } from '@eppo/js-client-sdk-common';
import * as td from 'testdouble';

import apiServer, { TEST_SERVER_PORT } from '../test/mockApiServer';
import { IAssignmentTestCase, readAssignmentTestData, ValueTestType } from '../test/testHelpers';

import EppoClient from './client/eppo-client';
import { POLL_INTERVAL_MS, DEFAULT_INITIAL_CONFIG_REQUEST_RETRIES } from './constants';
import ExperimentConfigurationRequestor from './experiment-configuration-requestor';
import { IPoller } from './poller';

import { getInstance, IAssignmentEvent, IAssignmentLogger, init } from '.';

describe('EppoClient E2E test', () => {
  const mockLogger: IAssignmentLogger = {
    logAssignment(assignment: IAssignmentEvent) {
      console.log(`Logged assignment for subject ${assignment.subject}`);
    },
  };

  const flagKey = 'mock-experiment';

  const mockExperimentConfig = {
    name: flagKey,
    enabled: true,
    subjectShards: 100,
    overrides: {},
    typedOverrides: {},
    rules: [
      {
        allocationKey: 'allocation1',
        conditions: [],
      },
    ],
    allocations: {
      allocation1: {
        percentExposure: 1,
        variations: [
          {
            name: 'control',
            value: 'control',
            typedValue: 'control',
            shardRange: {
              start: 0,
              end: 34,
            },
          },
          {
            name: 'variant-1',
            value: 'variant-1',
            typedValue: 'variant-1',
            shardRange: {
              start: 34,
              end: 67,
            },
          },
          {
            name: 'variant-2',
            value: 'variant-2',
            typedValue: 'variant-2',
            shardRange: {
              start: 67,
              end: 100,
            },
          },
        ],
      },
    },
  };

  jest.useFakeTimers();

  afterAll(async () => {
    jest.clearAllTimers();
    jest.useRealTimers();
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
    beforeAll(async () => {
      await init({
        apiKey: 'dummy',
        baseUrl: `http://127.0.0.1:${TEST_SERVER_PORT}`,
        assignmentLogger: mockLogger,
      });
    });

    afterAll(async () => {
      td.reset();
    });

    describe('getAssignment', () => {
      it.each(readAssignmentTestData())(
        'test variation assignment splits',
        async ({
          experiment,
          valueType = ValueTestType.StringType,
          subjects,
          subjectsWithAttributes,
          expectedAssignments,
        }: IAssignmentTestCase) => {
          console.log(`---- Test Case for ${experiment} Experiment ----`);

          const assignments = getAssignmentsWithSubjectAttributes(
            subjectsWithAttributes
              ? subjectsWithAttributes
              : subjects.map((subject) => ({ subjectKey: subject })),
            experiment,
            valueType,
          );

          switch (valueType) {
            case ValueTestType.BoolType: {
              const boolAssignments = assignments.map((a) => a ?? null);
              expect(boolAssignments).toEqual(expectedAssignments);
              break;
            }
            case ValueTestType.NumericType: {
              const numericAssignments = assignments.map((a) => a ?? null);
              expect(numericAssignments).toEqual(expectedAssignments);
              break;
            }
            case ValueTestType.StringType: {
              const stringAssignments = assignments.map((a) => a ?? null);
              expect(stringAssignments).toEqual(expectedAssignments);
              break;
            }
            case ValueTestType.JSONType: {
              const jsonStringAssignments = assignments.map((a) => a ?? null);
              expect(jsonStringAssignments).toEqual(expectedAssignments);
              break;
            }
          }
        },
      );
    });

    it('assigns subject from overrides when experiment is enabled', () => {
      const mockConfigRequestor = td.object<ExperimentConfigurationRequestor>();
      const mockPoller = td.object<IPoller>();
      td.when(mockConfigRequestor.configStore.get(flagKey)).thenReturn({
        ...mockExperimentConfig,
        overrides: {
          '1b50f33aef8f681a13f623963da967ed': 'variant-2',
        },
        typedOverrides: {
          '1b50f33aef8f681a13f623963da967ed': 'variant-2',
        },
      });
      const client = new EppoClient(mockConfigRequestor, mockPoller);
      const assignment = client.getAssignment('subject-10', flagKey);
      expect(assignment).toEqual('variant-2');
    });

    it('assigns subject from overrides when experiment is not enabled', () => {
      const mockConfigRequestor = td.object<ExperimentConfigurationRequestor>();
      const mockPoller = td.object<IPoller>();
      td.when(mockConfigRequestor.configStore.get(flagKey)).thenReturn({
        ...mockExperimentConfig,
        overrides: {
          '1b50f33aef8f681a13f623963da967ed': 'variant-2',
        },
        typedOverrides: {
          '1b50f33aef8f681a13f623963da967ed': 'variant-2',
        },
      });
      const client = new EppoClient(mockConfigRequestor, mockPoller);
      const assignment = client.getAssignment('subject-10', flagKey);
      expect(assignment).toEqual('variant-2');
    });

    it('returns null when experiment config is absent', () => {
      const mockConfigRequestor = td.object<ExperimentConfigurationRequestor>();
      const mockPoller = td.object<IPoller>();
      td.when(mockConfigRequestor.configStore.get(flagKey)).thenReturn(null);
      const client = new EppoClient(mockConfigRequestor, mockPoller);
      const assignment = client.getAssignment('subject-10', flagKey);
      expect(assignment).toEqual(null);
    });

    it('logs variation assignment and experiment key', () => {
      const mockConfigRequestor = td.object<ExperimentConfigurationRequestor>();
      const mockLogger = td.object<IAssignmentLogger>();
      const mockPoller = td.object<IPoller>();
      td.when(mockConfigRequestor.configStore.get(flagKey)).thenReturn(mockExperimentConfig);
      const subjectAttributes = { foo: 3 };
      const client = new EppoClient(mockConfigRequestor, mockPoller);
      client.setLogger(mockLogger);
      const assignment = client.getAssignment('subject-10', flagKey, subjectAttributes);
      expect(assignment).toEqual('control');
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);
      expect(td.explain(mockLogger.logAssignment).calls[0].args[0].subject).toEqual('subject-10');
      expect(td.explain(mockLogger.logAssignment).calls[0].args[0].featureFlag).toEqual(flagKey);
      expect(td.explain(mockLogger.logAssignment).calls[0].args[0].experiment).toEqual(
        `${flagKey}-${mockExperimentConfig.rules[0].allocationKey}`,
      );
      expect(td.explain(mockLogger.logAssignment).calls[0].args[0].allocation).toEqual(
        `${mockExperimentConfig.rules[0].allocationKey}`,
      );
    });

    it('handles logging exception', () => {
      const mockConfigRequestor = td.object<ExperimentConfigurationRequestor>();
      const mockLogger = td.object<IAssignmentLogger>();
      const mockPoller = td.object<IPoller>();
      td.when(mockLogger.logAssignment(td.matchers.anything())).thenThrow(
        new Error('logging error'),
      );
      td.when(mockConfigRequestor.configStore.get(flagKey)).thenReturn(mockExperimentConfig);
      const subjectAttributes = { foo: 3 };
      const client = new EppoClient(mockConfigRequestor, mockPoller);
      client.setLogger(mockLogger);
      const assignment = client.getAssignment('subject-10', flagKey, subjectAttributes);
      expect(assignment).toEqual('control');
    });

    function getAssignmentsWithSubjectAttributes(
      subjectsWithAttributes: {
        subjectKey: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        subjectAttributes?: Record<string, any>;
      }[],
      experiment: string,
      valueTestType: ValueTestType = ValueTestType.StringType,
    ): (unknown | null)[] {
      const client = getInstance();
      return subjectsWithAttributes.map((subject) => {
        switch (valueTestType) {
          case ValueTestType.BoolType: {
            const ba = client.getBoolAssignment(
              subject.subjectKey,
              experiment,
              subject.subjectAttributes,
            );
            if (ba === null) return null;
            return ba as boolean;
          }
          case ValueTestType.NumericType: {
            const na = client.getNumericAssignment(
              subject.subjectKey,
              experiment,
              subject.subjectAttributes,
            );
            if (na === null) return null;
            return na as number;
          }
          case ValueTestType.StringType: {
            const sa = client.getStringAssignment(
              subject.subjectKey,
              experiment,
              subject.subjectAttributes,
            );
            if (sa === null) return null;
            return sa as string;
          }
          case ValueTestType.JSONType: {
            const sa = client.getJSONStringAssignment(
              subject.subjectKey,
              experiment,
              subject.subjectAttributes,
            );
            const oa = client.getParsedJSONAssignment(
              subject.subjectKey,
              experiment,
              subject.subjectAttributes,
            );
            if (oa == null || sa === null) return null;
            return sa as string;
          }
        }
      });
    }
  });

  describe('initialization errors', () => {
    it('retries initial configuration request before resolving', async () => {
      td.replace(HttpClient.prototype, 'get');
      let callCount = 0;
      td.when(HttpClient.prototype.get(td.matchers.anything())).thenDo(() => {
        if (++callCount === 1) {
          // Throw an error for the first call
          throw new Error('Intentional Thrown Error For Test');
        } else {
          // Return a mock object for subsequent calls
          return {
            flags: {
              [flagKey]: mockExperimentConfig,
            },
          };
        }
      });

      // Set a (real) timer to advance (fake) time while the initializing is sleeping between retries
      jest.useRealTimers();
      setTimeout(() => jest.advanceTimersByTime(POLL_INTERVAL_MS * 0.1), 30);
      jest.useFakeTimers();

      await init({
        apiKey: 'dummy',
        baseUrl: `http://127.0.0.1:${TEST_SERVER_PORT}`,
        assignmentLogger: mockLogger,
      });
      const client = getInstance();
      expect(client.getStringAssignment('subject', flagKey)).toBe('control');
    });

    it('gives up initial request after hitting max retries', async () => {
      td.replace(HttpClient.prototype, 'get');
      let callCount = 0;
      td.when(HttpClient.prototype.get(td.matchers.anything())).thenDo(() => {
        callCount += 1;
        throw new Error('Intentional Thrown Error For Test');
      });

      // Set a (real) timer to advance (fake) time while the initializing is sleeping between retries
      jest.useRealTimers();
      setTimeout(() => {
        for (let i = DEFAULT_INITIAL_CONFIG_REQUEST_RETRIES; i > 0; i -= 1) {
          jest.advanceTimersByTime(POLL_INTERVAL_MS * 0.1);
        }
      }, 30);
      jest.useFakeTimers();

      await expect(
        init({
          apiKey: 'dummy',
          baseUrl: `http://127.0.0.1:${TEST_SERVER_PORT}`,
          assignmentLogger: mockLogger,
        }),
      ).rejects.toThrow();

      expect(callCount).toBe(1 + DEFAULT_INITIAL_CONFIG_REQUEST_RETRIES);

      const client = getInstance();
      expect(client.getStringAssignment('subject', flagKey)).toBeNull();

      jest.advanceTimersByTime(POLL_INTERVAL_MS * 2);

      // Expect no further calls
      expect(callCount).toBe(1 + DEFAULT_INITIAL_CONFIG_REQUEST_RETRIES);
    });
  });
});
