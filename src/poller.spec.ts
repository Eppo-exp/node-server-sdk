import * as td from 'testdouble';

import initPoller from './poller';

describe('initPoller', () => {
  const testInterval = 30000;
  const pollerRetries = 3;
  const noOpCallback = td.func<() => Promise<void>>();
  jest.useFakeTimers();

  afterEach(() => {
    td.reset();
    jest.clearAllTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('starts polling at interval', async () => {
    const poller = initPoller(testInterval, pollerRetries, noOpCallback);
    await poller.start();
    td.verify(noOpCallback(), { times: 1 });
    await verifyPoll(2);
    await verifyPoll(3);
  });

  it('retries with exponential backoff', async () => {
    let callCount = 0;
    let failures = 0;
    let successes = 0;
    const errorThrowingCallback = async () => {
      if (++callCount % (pollerRetries + 1) !== 0) {
        failures += 1;
        throw new Error('Intentional Error For Test');
      }
      successes += 1;
    };

    const poller = initPoller(testInterval, pollerRetries, errorThrowingCallback);
    await poller.start(); // fail
    expect(callCount).toBe(1);
    expect(failures).toBe(1);
    expect(successes).toBe(0);

    jest.advanceTimersByTime(testInterval * 3); // 2^1 backoff plus jitter
    await flushPromises(); // fail
    expect(callCount).toBe(2);
    expect(failures).toBe(2);
    expect(successes).toBe(0);

    jest.advanceTimersByTime(testInterval * 5); // 2^2 backoff plus jitter
    await flushPromises(); // fail
    expect(callCount).toBe(3);
    expect(failures).toBe(3);
    expect(successes).toBe(0);

    jest.advanceTimersByTime(testInterval * 9); // 2^3 backoff plus jitter
    await flushPromises(); // succeed
    expect(callCount).toBe(4);
    expect(failures).toBe(3);
    expect(successes).toBe(1);

    jest.advanceTimersByTime(testInterval); // normal wait
    await flushPromises(); // fail
    expect(callCount).toBe(5);
    expect(failures).toBe(4);
    expect(successes).toBe(1);

    jest.advanceTimersByTime(testInterval * 3); // 2^1 backoff plus jitter
    await flushPromises(); // fail
    expect(callCount).toBe(6);
    expect(failures).toBe(5);
    expect(successes).toBe(1);
  });

  it('aborts after exhausting retries', async () => {
    let callCount = 0;
    const alwaysErrorCallback = async () => {
      ++callCount;
      throw new Error('Intentional Error For Test');
    };

    const poller = initPoller(testInterval, pollerRetries, alwaysErrorCallback);
    await poller.start(); // fail
    expect(callCount).toBe(1);

    jest.advanceTimersByTime(testInterval * 3); // 2^1 backoff plus jitter
    await flushPromises(); // fail
    expect(callCount).toBe(2);

    jest.advanceTimersByTime(testInterval * 5); // 2^2 backoff plus jitter
    await flushPromises(); // fail
    expect(callCount).toBe(3);

    jest.advanceTimersByTime(testInterval * 9); // 2^3 backoff plus jitter
    await flushPromises(); // fail & stop
    expect(callCount).toBe(4);

    jest.advanceTimersByTime(testInterval * 17); // 2^4 backoff plus jitter
    await flushPromises(); // no new calls
    expect(callCount).toBe(4);
  });

  it('stops polling', async () => {
    const poller = initPoller(testInterval, pollerRetries, noOpCallback);
    await poller.start();
    td.verify(noOpCallback(), { times: 1 });
    poller.stop();
    jest.advanceTimersByTime(testInterval * 10);
    await flushPromises();
    td.verify(noOpCallback(), { times: 1 });
  });

  async function verifyPoll(numIntervals: number) {
    jest.advanceTimersByTime(testInterval * numIntervals);
    await flushPromises();
    td.verify(noOpCallback(), { times: numIntervals });
  }

  async function flushPromises() {
    return new Promise(jest.requireActual('timers').setImmediate);
  }
});
