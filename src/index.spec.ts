import * as td from 'testdouble';

import apiServer from '../test/mockApiServer';

import EppoClient from './client/eppo-client';
import ExperimentConfigurationRequestor from './experiment-configuration-requestor';
import { IPoller } from './poller';

import { IAssignmentEvent, IAssignmentLogger, init } from '.';

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

  beforeAll(async () => {
    await init({
      apiKey: 'dummy',
      baseUrl: 'http://127.0.0.1:4000',
      assignmentLogger: mockLogger,
    });
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
    td.when(mockLogger.logAssignment(td.matchers.anything())).thenThrow(new Error('logging error'));
    td.when(mockConfigRequestor.configStore.get(flagKey)).thenReturn(mockExperimentConfig);
    const subjectAttributes = { foo: 3 };
    const client = new EppoClient(mockConfigRequestor, mockPoller);
    client.setLogger(mockLogger);
    const assignment = client.getAssignment('subject-10', flagKey, subjectAttributes);
    expect(assignment).toEqual('control');
  });
});
