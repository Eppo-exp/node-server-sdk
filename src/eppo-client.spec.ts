import * as fs from 'fs';

import * as td from 'testdouble';

import { IAssignmentTestCase, readAssignmentTestData } from '../test/testHelpers';

import { IEppoClient } from './eppo-client';
import { IVariation } from './experiment/variation';

import { init } from '.';

describe('EppoClient test', () => {
  let client: IEppoClient;
  const shouldLogAssignments = false;

  beforeAll(async () => {
    client = await init({ apiKey: 'dummy', baseUrl: 'http://127.0.0.1:4000' });
  });

  afterEach(() => {
    td.reset();
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
      return client.getAssignment(subject, experiment);
    });
  }
});
