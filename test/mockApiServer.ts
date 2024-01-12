import * as express from 'express';

import { readMockRacResponse } from './testHelpers';

const api = express();

export const TEST_SERVER_PORT = 4123;

api.get('/randomized_assignment/v3/config', (_req, res) => {
  const mockRacResponse = readMockRacResponse();
  res.json(mockRacResponse);
});

const server = api.listen(TEST_SERVER_PORT, () => {
  const address = server.address();
  console.log(`Running API server on '${JSON.stringify(address)}'...`);
});

export default server;
