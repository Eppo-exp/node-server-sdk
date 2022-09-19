import * as td from 'testdouble';

import { getInstance, IAssignmentEvent, IAssignmentLogger, init } from '..';
import apiServer from '../../test/mockApiServer';
import { IAssignmentTestCase, readAssignmentTestData } from '../../test/testHelpers';
import { OperatorType } from '../dto/rule-dto';
import ExperimentConfigurationRequestor from '../experiment-configuration-requestor';

import EppoClient from './eppo-client';

describe('EppoClient E2E test', () => {
  const mockLogger: IAssignmentLogger = {
    logAssignment(assignment: IAssignmentEvent) {
      console.log(`Logged assignment for subject ${assignment.subject}`);
    },
  };

  const experimentName = 'mock-experiment';

  const mockExperimentConfig = {
    name: experimentName,
    enabled: true,
    subjectShards: 100,
    overrides: {},
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
            shardRange: {
              start: 0,
              end: 34,
            },
          },
          {
            name: 'variant-1',
            value: 'variant-1',
            shardRange: {
              start: 34,
              end: 67,
            },
          },
          {
            name: 'variant-2',
            value: 'variant-2',
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

  beforeAll(async () => {
    await init({ apiKey: 'dummy', baseUrl: 'http://127.0.0.1:4000', assignmentLogger: mockLogger });
  });

  afterAll(async () => {
    jest.clearAllTimers();
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

  describe('getAssignment', () => {
    it.each(readAssignmentTestData())(
      'test variation assignment splits',
      async ({
        experiment,
        subjects,
        subjectsWithAttributes,
        expectedAssignments,
      }: IAssignmentTestCase) => {
        console.log(`---- Test Case for ${experiment} Experiment ----`);
        const assignments = subjectsWithAttributes
          ? getAssignmentsWithSubjectAttributes(subjectsWithAttributes, experiment)
          : getAssignments(subjects, experiment);

        expect(assignments).toEqual(expectedAssignments);
      },
    );
  });

  it('assigns subject from overrides when experiment is enabled', () => {
    const mockConfigRequestor = td.object<ExperimentConfigurationRequestor>();
    td.when(mockConfigRequestor.getConfiguration(experimentName)).thenReturn({
      ...mockExperimentConfig,
      overrides: {
        '1b50f33aef8f681a13f623963da967ed': 'variant-2',
      },
    });
    const client = new EppoClient(mockConfigRequestor);
    const assignment = client.getAssignment('subject-10', experimentName);
    expect(assignment).toEqual('variant-2');
  });

  it('assigns subject from overrides when experiment is not enabled', () => {
    const mockConfigRequestor = td.object<ExperimentConfigurationRequestor>();
    td.when(mockConfigRequestor.getConfiguration(experimentName)).thenReturn({
      ...mockExperimentConfig,
      overrides: {
        '1b50f33aef8f681a13f623963da967ed': 'variant-2',
      },
    });
    const client = new EppoClient(mockConfigRequestor);
    const assignment = client.getAssignment('subject-10', experimentName);
    expect(assignment).toEqual('variant-2');
  });

  it('returns null when experiment config is absent', () => {
    const mockConfigRequestor = td.object<ExperimentConfigurationRequestor>();
    td.when(mockConfigRequestor.getConfiguration(experimentName)).thenReturn(null);
    const client = new EppoClient(mockConfigRequestor);
    const assignment = client.getAssignment('subject-10', experimentName);
    expect(assignment).toEqual(null);
  });

  it('logs variation assignment', () => {
    const mockConfigRequestor = td.object<ExperimentConfigurationRequestor>();
    const mockLogger = td.object<IAssignmentLogger>();
    td.when(mockConfigRequestor.getConfiguration(experimentName)).thenReturn(mockExperimentConfig);
    const subjectAttributes = { foo: 3 };
    const client = new EppoClient(mockConfigRequestor, mockLogger);
    const assignment = client.getAssignment('subject-10', experimentName, subjectAttributes);
    expect(assignment).toEqual('control');
    expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);
    expect(td.explain(mockLogger.logAssignment).calls[0].args[0].subject).toEqual('subject-10');
  });

  it('handles logging exception', () => {
    const mockConfigRequestor = td.object<ExperimentConfigurationRequestor>();
    const mockLogger = td.object<IAssignmentLogger>();
    td.when(mockLogger.logAssignment(td.matchers.anything())).thenThrow(new Error('logging error'));
    td.when(mockConfigRequestor.getConfiguration(experimentName)).thenReturn(mockExperimentConfig);
    const subjectAttributes = { foo: 3 };
    const client = new EppoClient(mockConfigRequestor, mockLogger);
    const assignment = client.getAssignment('subject-10', experimentName, subjectAttributes);
    expect(assignment).toEqual('control');
  });

  it('only returns variation if subject matches rules', () => {
    const mockConfigRequestor = td.object<ExperimentConfigurationRequestor>();
    td.when(mockConfigRequestor.getConfiguration(experimentName)).thenReturn({
      ...mockExperimentConfig,
      rules: [
        {
          allocationKey: 'allocation1',
          conditions: [
            {
              operator: OperatorType.GT,
              attribute: 'appVersion',
              value: 10,
            },
          ],
        },
      ],
      allocations: {
        allocation1: {
          percentExposure: 1,
          variations: [
            {
              name: 'control',
              value: 'control',
              shardRange: {
                start: 0,
                end: 50,
              },
            },
            {
              name: 'treatment',
              value: 'treatment',
              shardRange: {
                start: 50,
                end: 100,
              },
            },
          ],
        },
      },
    });
    const client = new EppoClient(mockConfigRequestor);
    let assignment = client.getAssignment('subject-10', experimentName, { appVersion: 9 });
    expect(assignment).toEqual(null);
    assignment = client.getAssignment('subject-10', experimentName);
    expect(assignment).toEqual(null);
    assignment = client.getAssignment('subject-10', experimentName, { appVersion: 11 });
    expect(assignment).toEqual('control');
  });

  function getAssignments(subjects: string[], experiment: string): string[] {
    const client = getInstance();
    return subjects.map((subjectKey) => {
      return client.getAssignment(subjectKey, experiment);
    });
  }

  function getAssignmentsWithSubjectAttributes(
    subjectsWithAttributes: {
      subjectKey: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      subjectAttributes: Record<string, any>;
    }[],
    experiment: string,
  ): string[] {
    const client = getInstance();
    return subjectsWithAttributes.map((subject) => {
      return client.getAssignment(subject.subjectKey, experiment, subject.subjectAttributes);
    });
  }
});
