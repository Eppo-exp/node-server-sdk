import * as express from 'express';

import {
  MOCK_BANDIT_MODELS_RESPONSE_FILE,
  MOCK_FLAGS_WITH_BANDITS_RESPONSE_FILE,
  MOCK_UFC_RESPONSE_FILE,
  readMockResponse,
} from './testHelpers';

const api = express();

export const TEST_SERVER_PORT = 4123;
export const TEST_BANDIT_API_KEY = 'foo.ZWg9MTIzNDU2LmUudGVzdGluZy5lcHBvLmNsb3Vk';
const flagEndpoint = /flag-config\/v1\/config*/;
const banditEndpoint = /flag-config\/v1\/bandits*/;

api.get(flagEndpoint, (req, res) => {
  const ufcFile = req.url.includes(TEST_BANDIT_API_KEY)
    ? MOCK_FLAGS_WITH_BANDITS_RESPONSE_FILE
    : MOCK_UFC_RESPONSE_FILE;
  const mockUfcResponse = readMockResponse(ufcFile);
  res.json(mockUfcResponse);
});

api.get(banditEndpoint, (req, res) => {
  const mockBanditResponse = readMockResponse(MOCK_BANDIT_MODELS_RESPONSE_FILE);
  res.json(mockBanditResponse);
});

const server = api.listen(TEST_SERVER_PORT, () => {
  const address = server.address();
  console.log(`Running API server on '${JSON.stringify(address)}'...`);
});

export default server;
