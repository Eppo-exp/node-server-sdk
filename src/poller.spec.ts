import * as td from 'testdouble';

import initPoller from './poller';

describe('initPoller', () => {
  const testInterval = 30000;
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
    const poller = initPoller(testInterval, noOpCallback);
    await poller.start();
    td.verify(noOpCallback(), { times: 1 });
    await verifyPoll(2);
    await verifyPoll(3);
  });

  it('stops polling', async () => {
    const poller = initPoller(testInterval, noOpCallback);
    await poller.start();
    td.verify(noOpCallback(), { times: 1 });
    poller.stop();
    jest.advanceTimersByTime(testInterval * 10);
    await flushPromises();
    td.verify(noOpCallback(), { times: 1 });
  });

  it('retries with exponential backoff', async () => {
    const pollerRetries = 3;
    let callCount = 0;
    let failures = 0;
    let successes = 0;
    const errorThrowingCallback = async () => {
      if ((++callCount - 1) % (pollerRetries + 1) !== 0) {
        failures += 1;
        throw new Error('Intentional Error For Test');
      }
      successes += 1;
    };

    const poller = initPoller(testInterval, errorThrowingCallback, {
      maxPollRetries: pollerRetries,
    });
    await poller.start(); // success
    expect(callCount).toBe(1);
    expect(failures).toBe(0);
    expect(successes).toBe(1);

    jest.advanceTimersByTime(testInterval); // first poll
    await flushPromises(); // fail
    expect(callCount).toBe(2);
    expect(failures).toBe(1);
    expect(successes).toBe(1);

    jest.advanceTimersByTime(testInterval * 3); // 2^1 backoff plus jitter
    await flushPromises(); // fail
    expect(callCount).toBe(3);
    expect(failures).toBe(2);
    expect(successes).toBe(1);

    jest.advanceTimersByTime(testInterval * 5); // 2^2 backoff plus jitter
    await flushPromises(); // fail
    expect(callCount).toBe(4);
    expect(failures).toBe(3);
    expect(successes).toBe(1);

    jest.advanceTimersByTime(testInterval * 9); // 2^3 backoff plus jitter
    await flushPromises(); // succeed
    expect(callCount).toBe(5);
    expect(failures).toBe(3);
    expect(successes).toBe(2);

    jest.advanceTimersByTime(testInterval); // normal wait
    await flushPromises(); // fail
    expect(callCount).toBe(6);
    expect(failures).toBe(4);
    expect(successes).toBe(2);

    jest.advanceTimersByTime(testInterval * 3); // 2^1 backoff plus jitter
    await flushPromises(); // fail
    expect(callCount).toBe(7);
    expect(failures).toBe(5);
    expect(successes).toBe(2);
  });

  it('aborts after exhausting polling retries', async () => {
    const pollerRetries = 3;
    let callCount = 0;
    const alwaysErrorAfterFirstCallback = async () => {
      if (++callCount > 1) {
        throw new Error('Intentional Error For Test');
      }
    };

    const poller = initPoller(testInterval, alwaysErrorAfterFirstCallback, {
      maxPollRetries: pollerRetries,
    });
    await poller.start(); // success
    expect(callCount).toBe(1);

    jest.advanceTimersByTime(testInterval); // first poll
    await flushPromises(); // fail
    expect(callCount).toBe(2);

    jest.advanceTimersByTime(testInterval * 3); // 2^1 backoff plus jitter
    await flushPromises(); // fail
    expect(callCount).toBe(3);

    jest.advanceTimersByTime(testInterval * 5); // 2^2 backoff plus jitter
    await flushPromises(); // fail
    expect(callCount).toBe(4);

    jest.advanceTimersByTime(testInterval * 9); // 2^3 backoff plus jitter
    await flushPromises(); // fail & stop
    expect(callCount).toBe(5);

    jest.advanceTimersByTime(testInterval * 17); // 2^4 backoff plus jitter
    await flushPromises(); // no new calls
    expect(callCount).toBe(5);
  });

  it('retries startup poll within same promise', async () => {
    const pollerRetries = 3;
    let callCount = 0;
    const errorThrowingCallback = async () => {
      if (++callCount < pollerRetries) {
        throw new Error('Intentional Error For Test');
      }
    };

    const poller = initPoller(testInterval, errorThrowingCallback, {
      maxStartRetries: pollerRetries,
    });

    jest.useRealTimers();
    setTimeout(async () => {
      // first call failed
      expect(callCount).toBe(1);

      jest.advanceTimersByTime(testInterval);
      await flushPromises(); // fail
      expect(callCount).toBe(2);

      jest.advanceTimersByTime(testInterval);
      await flushPromises(); // fail & stop
      expect(callCount).toBe(3);

      jest.advanceTimersByTime(testInterval);
      await flushPromises(); // no more calls
      expect(callCount).toBe(3);
    });
    jest.useFakeTimers();

    await poller.start();
    // By this point, all of the above failures will have happened
    expect(callCount).toBe(3);
  });

  it('gives up initial request after hitting all retries', async () => {
    const pollerRetries = 1;
    let callCount = 0;
    const errorThrowingCallback = async () => {
      ++callCount;
      throw new Error('Intentional Error For Test');
    };

    const poller = initPoller(testInterval, errorThrowingCallback, {
      maxStartRetries: pollerRetries,
    });

    jest.useRealTimers();
    setTimeout(async () => {
      // first call failed
      expect(callCount).toBe(1);

      jest.advanceTimersByTime(testInterval);
      await flushPromises(); // fail & stop
      expect(callCount).toBe(2);
    });
    jest.useFakeTimers();

    await poller.start();
    // By this point, both initial failed requests will have happened
    expect(callCount).toBe(2);

    // There should be no more polling
    jest.advanceTimersByTime(testInterval * 2);
    await flushPromises();
    expect(callCount).toBe(2);
  });

  it('still polls after initial request fails (if configured)', async () => {
    const pollerRetries = 1;
    let callCount = 0;
    const errorThrowingCallback = async () => {
      ++callCount;
      throw new Error('Intentional Error For Test');
    };

    const poller = initPoller(testInterval, errorThrowingCallback, {
      maxStartRetries: pollerRetries,
      errorOnFailedStart: false,
      pollAfterFailedStart: true,
    });

    // By not awaiting (yet) only the first call should be fired off before execution below resumes
    const startPromise = poller.start();
    expect(callCount).toBe(1);
    // Advance timers to trigger the retry
    jest.advanceTimersByTimeAsync(testInterval);
    // Await poller.start() so it can finish its execution before this test proceeds
    await startPromise;

    // When poller.start() has completed, both initial failed requests will have happened
    expect(callCount).toBe(2);

    // Advance time enough for regular polling to have begun
    jest.advanceTimersByTimeAsync(testInterval);
    // Wait for event loop to finish, processing the first regular poll
    await flushPromises();

    expect(callCount).toBe(3);
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
