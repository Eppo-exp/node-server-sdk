import * as td from 'testdouble';

import { EXPERIMENT_CONFIGURATIONS_NAMESPACE, IConfigurationStore } from '../configuration-store';
import HttpClient from '../http-client';

import { IExperimentConfiguration } from './experiment-configuration';
import ExperimentConfigurationRequestor from './experiment-configuration-requestor';

describe('ExperimentConfigurationRequestor', () => {
  const mockHttpClient = td.object<HttpClient>();
  const mockConfigStore = td.object<IConfigurationStore<IExperimentConfiguration>>();
  const testConfig: IExperimentConfiguration = {
    name: 'exp1',
    percentExposure: 0.01,
    subjectShards: 10000,
    enabled: true,
    variations: [],
  };
  const requestor = new ExperimentConfigurationRequestor(mockConfigStore, mockHttpClient);

  describe('getConfiguration', () => {
    it('returns configuration from cache', async () => {
      td.when(mockConfigStore.getConfigurations(EXPERIMENT_CONFIGURATIONS_NAMESPACE)).thenResolve({
        exp1: testConfig,
      });
      expect(await requestor.getConfiguration('exp1')).toEqual(testConfig);
    });

    it('retreives configuration from network on cache miss', async () => {
      td.when(mockConfigStore.getConfigurations(EXPERIMENT_CONFIGURATIONS_NAMESPACE)).thenResolve(
        null,
      );
      td.when(mockHttpClient.get('/randomized-assignment-configurations')).thenResolve({
        experiments: {
          exp1: testConfig,
        },
      });
      expect(await requestor.getConfiguration('exp1')).toEqual(testConfig);
    });
  });
});
