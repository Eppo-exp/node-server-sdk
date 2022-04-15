import axios from 'axios';

import {
  EXPERIMENT_CONFIGURATIONS_NAMESPACE,
  InMemoryConfigurationStore,
} from '../configuration-store';
import HttpClient from '../http-client';

import { IExperimentConfiguration } from './experiment-configuration';
import ExperimentConfigurationRequestor from './experiment-configuration-requestor';

describe('Experiment configuration requestor', () => {
  it('retrieves assignment configs', async () => {
    const apiKey = 'my-api-key';
    const client = new HttpClient(
      axios.create({
        baseURL: 'http://localhost:4000/api/internal',
      }),
      {
        apiKey,
        sdkName: 'node',
        sdkVersion: '1.0.0',
      },
    );
    const s = new InMemoryConfigurationStore<IExperimentConfiguration>(1000);
    const requestor = new ExperimentConfigurationRequestor(s, client);
    await requestor.fetchAndStoreConfigurations();
    const expConfig = await s.getConfigurations(EXPERIMENT_CONFIGURATIONS_NAMESPACE);
    console.log(JSON.stringify(expConfig['randomization_algo']));
  });
});
