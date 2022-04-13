import * as fs from 'fs';

import * as td from 'testdouble';

import { IConfigurationStore } from './configuration-store';
import EppoClient from './eppo-client';
import { IExperimentConfiguration } from './experiment/experiment-configuration';
import { IVariation } from './experiment/variation';

interface IAssignmentTestCase {
  experiment: string;
  percentExposure: number;
  variations: IVariation[];
  subjects: string[];
  expectedAssignments: string[];
}

function readTestCaseData(): IAssignmentTestCase[] {
  const testDataDir = './test/assignmentTestData/';
  const testCaseData: IAssignmentTestCase[] = [];
  const testCaseFiles = fs.readdirSync(testDataDir);
  testCaseFiles.forEach((file) => {
    const testCase = JSON.parse(fs.readFileSync(testDataDir + file, 'utf8'));
    testCaseData.push(testCase);
  });
  return testCaseData;
}

describe('EppoClient test', () => {
  const mockConfigurationStore = td.object<IConfigurationStore<IExperimentConfiguration>>();
  const client = new EppoClient(mockConfigurationStore);
  const subjectShards = 10000;
  const shouldLogAssignments = false;

  afterEach(() => {
    td.reset();
  });

  describe('getAssignment', () => {
    it.each(readTestCaseData())(
      'test variation assignment splits',
      async ({
        variations,
        experiment,
        percentExposure,
        subjects,
        expectedAssignments,
      }: IAssignmentTestCase) => {
        td.when(mockConfigurationStore.getConfiguration(experiment)).thenResolve({
          name: experiment,
          percentExposure,
          subjectShards,
          variations,
          enabled: true,
        });
        console.log(`---- Test Case for ${experiment} Experiment ----`);
        const assignments = await getAssignments(subjects, experiment);
        if (shouldLogAssignments) {
          logAssignments(experiment, assignments);
        }
        // verify the assingments don't change across test runs (deterministic)
        expect(assignments).toEqual(expectedAssignments);
        const expectedVariationSplitPercentage = percentExposure / variations.length;
        const unassignedCount = assignments.filter((assignment) => assignment == null).length;
        expectToBeCloseToPercentage(
          (unassignedCount / assignments.length) * 100,
          100 - percentExposure,
        );
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
      `Expect variation ${variation.name} percentage of ${(
        (assignedCount / assignments.length) *
        100
      ).toFixed(2)} to be close to ${expectedPercentage.toFixed(2)}`,
    );
    expectToBeCloseToPercentage((assignedCount / assignments.length) * 100, expectedPercentage);
  }

  // expect assignment count to be within 5 percentage points of the expected count (because the hash output is random)
  function expectToBeCloseToPercentage(percentage: number, expectedPercentage: number) {
    expect(percentage).toBeGreaterThanOrEqual(expectedPercentage - 5);
    expect(percentage).toBeLessThanOrEqual(expectedPercentage + 5);
  }

  async function getAssignments(subjects: string[], experiment: string): Promise<string[]> {
    return Promise.all(
      subjects.map((subject) => {
        return client.getAssignment(subject, experiment);
      }),
    );
  }
});
