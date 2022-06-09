import * as fs from 'fs';

import * as td from 'testdouble';

import apiServer from '../test/mockApiServer';
import { IAssignmentTestCase, readAssignmentTestData } from '../test/testHelpers';

import EppoClient, { IEppoClient } from './eppo-client';
import ExperimentConfigurationRequestor from './experiment/experiment-configuration-requestor';
import { IVariation } from './experiment/variation';
import { OperatorType } from './rule';

import { init } from '.';

describe('EppoClient E2E test', () => {
  let client: IEppoClient;
  const shouldLogAssignments = false;
  jest.useFakeTimers();

  beforeAll(async () => {
    client = init({ apiKey: 'dummy', baseUrl: 'http://127.0.0.1:4000' });
    await client.waitForInitialization();
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
        variations,
        experiment,
        percentExposure,
        subjects,
        expectedAssignments,
      }: IAssignmentTestCase) => {
        console.log(`---- Test Case for ${experiment} Experiment ----`);
        const assignments = getAssignments(subjects, experiment);
        if (shouldLogAssignments) {
          logAssignments(experiment, assignments);
        }
        // verify the assingments don't change across test runs (deterministic)
        expect(assignments).toEqual(expectedAssignments);
        const expectedVariationSplitPercentage = percentExposure / variations.length;
        const unassignedCount = assignments.filter((assignment) => assignment == null).length;
        expectToBeCloseToPercentage(unassignedCount / assignments.length, 1 - percentExposure);
        variations.forEach((variation) => {
          validateAssignmentCounts(assignments, expectedVariationSplitPercentage, variation);
        });
      },
    );
  });

  it('returns subject from overrides', () => {
    const mockConfigRequestor = td.object<ExperimentConfigurationRequestor>();
    const experiment = 'experiment_5';
    td.when(mockConfigRequestor.getConfiguration(experiment)).thenReturn({
      name: experiment,
      percentExposure: 1,
      enabled: true,
      subjectShards: 100,
      variations: [
        {
          name: 'control',
          shardRange: {
            start: 0,
            end: 33,
          },
        },
        {
          name: 'variant-1',
          shardRange: {
            start: 34,
            end: 66,
          },
        },
        {
          name: 'variant-2',
          shardRange: {
            start: 67,
            end: 100,
          },
        },
      ],
      overrides: {
        a90ea45116d251a43da56e03d3dd7275: 'variant-2',
      },
    });
    client = new EppoClient(() => Promise.resolve(), mockConfigRequestor);
    const assignment = client.getAssignment({ key: 'subject-1' }, experiment);
    expect(assignment).toEqual('variant-2');
  });

  it('only returns variation if subject matches rules', () => {
    const mockConfigRequestor = td.object<ExperimentConfigurationRequestor>();
    const experiment = 'experiment_5';
    td.when(mockConfigRequestor.getConfiguration(experiment)).thenReturn({
      name: experiment,
      percentExposure: 1,
      enabled: true,
      subjectShards: 100,
      variations: [
        {
          name: 'control',
          shardRange: {
            start: 0,
            end: 50,
          },
        },
        {
          name: 'treatment',
          shardRange: {
            start: 50,
            end: 100,
          },
        },
      ],
      overrides: {},
      rules: [
        {
          conditions: [
            {
              operator: OperatorType.GT,
              attribute: 'appVersion',
              value: 10,
            },
          ],
        },
      ],
    });
    client = new EppoClient(() => Promise.resolve(), mockConfigRequestor);
    let assignment = client.getAssignment(
      { key: 'subject-1', customAttributes: { appVersion: 9 } },
      experiment,
    );
    expect(assignment).toEqual(null);
    assignment = client.getAssignment({ key: 'subject-1' }, experiment);
    expect(assignment).toEqual(null);
    assignment = client.getAssignment(
      { key: 'subject-1', customAttributes: { appVersion: 11 } },
      experiment,
    );
    expect(assignment).toEqual('control');
  });

  /**
   * Write subject assignments to output file for debugging purposes.
   */
  function logAssignments(experiment: string, assignments: string[]) {
    const path = `./test/assignmentTestData/experiment-${experiment}-assignments.json`;
    fs.writeFileSync(path, JSON.stringify(assignments));
  }

  function validateAssignmentCounts(
    assignments: string[],
    expectedPercentage: number,
    variation: IVariation,
  ) {
    const assignedCount = assignments.filter((assignment) => assignment === variation.name).length;
    console.log(
      `Expect variation ${variation.name} percentage of ${
        assignedCount / assignments.length
      } to be close to ${expectedPercentage}`,
    );
    expectToBeCloseToPercentage(assignedCount / assignments.length, expectedPercentage);
  }

  // expect assignment count to be within 5 percentage points of the expected count (because the hash output is random)
  function expectToBeCloseToPercentage(percentage: number, expectedPercentage: number) {
    expect(percentage).toBeGreaterThanOrEqual(expectedPercentage - 0.05);
    expect(percentage).toBeLessThanOrEqual(expectedPercentage + 0.05);
  }

  function getAssignments(subjects: string[], experiment: string): string[] {
    return subjects.map((subject) => {
      return client.getAssignment({ key: subject }, experiment);
    });
  }
});
