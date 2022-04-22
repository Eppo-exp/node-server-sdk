import { InMemoryConfigurationStore } from './configuration-store';

describe('InMemoryConfigurationStore', () => {
  it('clears entries after TTL', () => {
    jest.useFakeTimers();
    const store = new InMemoryConfigurationStore<string>(1000);
    store.setConfigurations({ key1: 'item1', key2: 'item2' });
    expect(store.getConfiguration('key1')).toEqual('item1');
    expect(store.getConfiguration('key2')).toEqual('item2');
    jest.advanceTimersByTime(1011);
    expect(store.getConfiguration('key1')).toEqual(undefined);
    expect(store.getConfiguration('key2')).toEqual(undefined);
  });
});
