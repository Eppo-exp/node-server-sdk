import { InMemoryConfigurationStore } from './configuration-store';

describe('InMemoryConfigurationStore', () => {
  it('evicts entries when max size is exceeded', () => {
    const maxSize = 1000;
    const store = new InMemoryConfigurationStore<string>(maxSize);
    store.setEntries({ toBeEvicted: 'item1' });
    expect(store.get('toBeEvicted')).toEqual('item1');
    const otherConfigs = {};
    for (let i = 0; i < maxSize; i++) {
      otherConfigs[`key-${i}`] = `value-${i}`;
    }
    store.setEntries(otherConfigs);
    expect(store.get('toBeEvicted')).toEqual(null);
    for (let i = 0; i < maxSize; i++) {
      expect(store.get(`key-${i}`)).toEqual(`value-${i}`);
    }
  });
});
