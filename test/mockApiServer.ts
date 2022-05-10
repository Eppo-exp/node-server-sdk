import * as express from 'express';

import { IExperimentConfiguration } from '../src/experiment/experiment-configuration';

import { IAssignmentTestCase, readAssignmentTestData } from './testHelpers';

const api = express();

api.get('/randomized_assignment/config', (_req, res) => {
  const testCases: IAssignmentTestCase[] = readAssignmentTestData();
  const assignmentConfig: Record<string, IExperimentConfiguration> = {};
  testCases.forEach(({ experiment, percentExposure, variations }) => {
    assignmentConfig[experiment] = {
      name: experiment,
      percentExposure,
      enabled: true,
      subjectShards: 10000,
      variations,
      overrides: {},
    };
  });
  res.json({
    experiments: assignmentConfig,
  });
});

const server = api.listen(4000, () => {
  const address = server.address();
  console.log(`Running API server on '${JSON.stringify(address)}'...`);
});

export default server;
