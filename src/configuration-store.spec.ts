import {
  ASSIGNMENT_CONFIGURATION_NAMESPACE,
  InMemoryConfigurationStore,
} from './configuration-store';

describe('InMemoryConfigurationStore', () => {
  it('clears entries after TTL', async () => {
    jest.useFakeTimers();
    const store = new InMemoryConfigurationStore<string>(1000);
    await store.setConfigurations(ASSIGNMENT_CONFIGURATION_NAMESPACE, { key1: 'item1' });
    expect(await store.getConfigurations(ASSIGNMENT_CONFIGURATION_NAMESPACE)).toEqual({
      key1: 'item1',
    });
    jest.advanceTimersByTime(1011);
    expect(await store.getConfigurations(ASSIGNMENT_CONFIGURATION_NAMESPACE)).toEqual(undefined);
  });
});
