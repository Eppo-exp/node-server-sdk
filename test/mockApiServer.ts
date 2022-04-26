import { Server } from 'http';

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
    };
  });
  res.json({
    experiments: assignmentConfig,
  });
});

export async function startServer(): Promise<Server> {
  const apiServer = api.listen(4000, '127.0.0.1', function () {
    const address = apiServer.address();
    console.log(`Running API server on '${JSON.stringify(address)}'...`);
  });
  return apiServer;
}
