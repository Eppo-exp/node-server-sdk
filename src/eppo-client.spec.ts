import * as td from 'testdouble';

import { IConfigurationStore } from './configuration-store';
import EppoClient from './eppo-client';
import { IExperimentConfiguration } from './experiment/experiment-configuration';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const assignmentTestCases = require('../test/assignmentTestData.json');

interface ITestVariation {
  value: string;
  expectedAssignmentCount: number;
}

interface IAssignmentTestCase {
  experiment: string;
  totalBuckets: number;
  exposurePercentage: number;
  variations: ITestVariation[];
  subjects: string[];
}

describe('EppoClient test', () => {
  const accessToken = 'dummy';
  const mockConfigurationStore = td.object<IConfigurationStore<IExperimentConfiguration>>();
  const client = new EppoClient(accessToken, mockConfigurationStore);

  afterEach(() => {
    td.reset();
  });

  describe('getAssignment', () => {
    it.each(assignmentTestCases)(
      'test variation assignment splits',
      async ({
        variations,
        experiment,
        exposurePercentage,
        subjects,
        totalBuckets,
      }: IAssignmentTestCase) => {
        td.when(mockConfigurationStore.getConfiguration(experiment)).thenResolve({
          value: experiment,
          exposurePercentage,
          totalBuckets,
          variations: variations.map(({ value }) => ({ value })),
        });
        console.log(`---- Test Case for ${experiment} Experiment ----`);
        const assignments = await getAssignments(subjects, experiment);
        const expectedVariationSplitRatio = exposurePercentage / variations.length;
        const unassignedCount = assignments.filter((assignment) => assignment == null).length;
        expectToBeCloseToRatio(unassignedCount / assignments.length, 1 - exposurePercentage);
        variations.forEach((variation) => {
          validateAssignmentCounts(assignments, expectedVariationSplitRatio, variation);
        });
      },
    );
  });

  function validateAssignmentCounts(
    assignments: string[],
    expectedRatio: number,
    variation: ITestVariation,
  ) {
    const assignedCount = assignments.filter((assignment) => assignment === variation.value).length;
    expect(assignedCount).toEqual(variation.expectedAssignmentCount);
    console.log(
      `Expect variation ${variation.value} ratio of ${
        assignedCount / assignments.length
      } to be close to ${expectedRatio}`,
    );
    expectToBeCloseToRatio(assignedCount / assignments.length, expectedRatio);
  }

  // expect assignment count to be within 5 percentage points of the expected count (because the hash output is random)
  function expectToBeCloseToRatio(percentage: number, expectedRatio: number) {
    expect(percentage).toBeGreaterThanOrEqual(expectedRatio - 0.05);
    expect(percentage).toBeLessThanOrEqual(expectedRatio + 0.05);
  }

  async function getAssignments(subjects: string[], experiment: string): Promise<string[]> {
    return Promise.all(
      subjects.map((subject) => {
        return client.getAssignment(subject, experiment);
      }),
    );
  }
});
