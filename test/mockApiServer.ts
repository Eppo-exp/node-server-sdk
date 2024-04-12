import * as express from 'express';

import { MOCK_UFC_RESPONSE_FILE, readMockUFCResponse } from './testHelpers';

const api = express();

export const TEST_SERVER_PORT = 4123;
const flagEndpoint = /flag-config\/v1\/config*/;

api.get(flagEndpoint, (_req, res) => {
  const mockRacResponse = readMockUFCResponse(MOCK_UFC_RESPONSE_FILE);
  res.json(mockRacResponse);
});

const server = api.listen(TEST_SERVER_PORT, () => {
  const address = server.address();
  console.log(`Running API server on '${JSON.stringify(address)}'...`);
});

export default server;
