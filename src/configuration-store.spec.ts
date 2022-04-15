import {
  EXPERIMENT_CONFIGURATIONS_NAMESPACE,
  InMemoryConfigurationStore,
} from './configuration-store';

describe('InMemoryConfigurationStore', () => {
  it('clears entries after TTL', async () => {
    jest.useFakeTimers();
    const store = new InMemoryConfigurationStore<string>(1000);
    await store.setConfigurations(EXPERIMENT_CONFIGURATIONS_NAMESPACE, { key1: 'item1' });
    expect(await store.getConfigurations(EXPERIMENT_CONFIGURATIONS_NAMESPACE)).toEqual({
      key1: 'item1',
    });
    jest.advanceTimersByTime(1011);
    expect(await store.getConfigurations(EXPERIMENT_CONFIGURATIONS_NAMESPACE)).toEqual(undefined);
  });
});
