import * as td from 'testdouble';

import initPoller from './poller';

describe('initPoller', () => {
  const testInterval = 10;
  const callback = td.func<() => Promise<void>>();
  jest.useFakeTimers();

  afterEach(() => {
    td.reset();
    jest.clearAllTimers();
  });

  it('starts polling at interval', async () => {
    const poller = initPoller(testInterval, callback);
    await poller.start();
    td.verify(callback(), { times: 1 });
    await verifyPoll(2);
    await verifyPoll(3);
  });

  it('stops polling', async () => {
    const poller = initPoller(testInterval, callback);
    await poller.start();
    poller.stop();
    jest.advanceTimersByTime(testInterval * 10);
    await flushPromises();
    td.verify(callback(), { times: 1 });
  });

  async function verifyPoll(numIntervals: number) {
    jest.advanceTimersByTime(testInterval * numIntervals);
    await flushPromises();
    td.verify(callback(), { times: numIntervals });
  }

  async function flushPromises() {
    return new Promise(jest.requireActual('timers').setImmediate);
  }
});
