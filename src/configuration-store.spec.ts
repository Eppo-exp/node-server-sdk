import { InMemoryConfigurationStore } from './configuration-store';

describe('InMemoryConfigurationStore', () => {
  it('evicts entries when max size is exceeded', () => {
    const maxSize = 1000;
    const store = new InMemoryConfigurationStore<string>(maxSize);
    store.setConfigurations({ toBeEvicted: 'item1' });
    expect(store.getConfiguration('toBeEvicted')).toEqual('item1');
    const otherConfigs = {};
    for (let i = 0; i < maxSize; i++) {
      otherConfigs[`key-${i}`] = `value-${i}`;
    }
    store.setConfigurations(otherConfigs);
    expect(store.getConfiguration('toBeEvicted')).toEqual(null);
    for (let i = 0; i < maxSize; i++) {
      expect(store.getConfiguration(`key-${i}`)).toEqual(`value-${i}`);
    }
  });
});
