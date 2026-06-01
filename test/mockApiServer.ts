import { createServer } from 'http';

import {
  MOCK_BANDIT_MODELS_RESPONSE_FILE,
  MOCK_FLAGS_WITH_BANDITS_RESPONSE_FILE,
  MOCK_UFC_RESPONSE_FILE,
  readMockResponse,
} from './testHelpers';

export const TEST_SERVER_PORT = 4123;
export const TEST_BANDIT_API_KEY = 'foo.ZWg9MTIzNDU2LmUudGVzdGluZy5lcHBvLmNsb3Vk';
const flagEndpoint = /flag-config\/v1\/config*/;
const banditEndpoint = /flag-config\/v1\/bandits*/;

const server = createServer((req, res) => {
  if (req.method !== 'GET' || !req.url) {
    res.statusCode = 404;
    res.end();
    return;
  }

  if (flagEndpoint.test(req.url)) {
    const ufcFile = req.url.includes(TEST_BANDIT_API_KEY)
      ? MOCK_FLAGS_WITH_BANDITS_RESPONSE_FILE
      : MOCK_UFC_RESPONSE_FILE;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(readMockResponse(ufcFile)));
    return;
  }

  if (banditEndpoint.test(req.url)) {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(readMockResponse(MOCK_BANDIT_MODELS_RESPONSE_FILE)));
    return;
  }

  res.statusCode = 404;
  res.end();
});

server.listen(TEST_SERVER_PORT, () => {
  const address = server.address();
  console.log(`Running API server on '${JSON.stringify(address)}'...`);
});

export default server;
