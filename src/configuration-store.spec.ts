import { InMemoryConfigurationStore } from './configuration-store';

describe('InMemoryConfigurationStore', () => {
  it('clears entries after TTL', async () => {
    jest.useFakeTimers();
    const store = new InMemoryConfigurationStore<string>(1);
    await store.setConfigurations({ key1: 'item1' });
    expect(await store.getConfiguration('key1')).toEqual('item1');
    jest.advanceTimersByTime(1011);
    expect(await store.getConfiguration('key1')).toEqual(undefined);
  });
});
