export interface IPoller {
  start: () => Promise<void>;
  stop: () => void;
}

export default function initPoller(
  intervalMs: number,
  maxRetries: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  callback: () => Promise<any>,
): IPoller {
  let stopped = false;
  let failedAttempts = 0;
  let nextPollMs = intervalMs;

  const start = async () => {
    // TODO: some kind of synchronous retries for start()
    stopped = false;
    await poll(true);
  };

  const stop = () => {
    if (!stopped) {
      stopped = true;
      console.log('Eppo SDK polling stopped');
    }
  };

  async function poll(throwOnError = false) {
    if (stopped) {
      return;
    }
    try {
      console.log('>>>>> TRYING POLLER CALLBACK');
      await callback();
      console.log('>>>>> POLLER CALLBACK SUCCESS');
      // If no error, reset any retrying
      failedAttempts = 0;
      nextPollMs = intervalMs;
    } catch (error) {
      console.warn(`Eppo SDK encountered error polling configurations: ${error.message}`);
      if (++failedAttempts <= maxRetries) {
        const failureWait = Math.pow(2, failedAttempts);
        const jitter = Math.floor(Math.random() * intervalMs * 0.1);
        nextPollMs = failureWait * intervalMs + jitter;
        console.warn(`Eppo SDK will try polling again in ${nextPollMs} ms`);
      } else {
        console.error(
          `Eppo SDK reached maximum of ${failedAttempts} failed polling attempts. Stopping polling`,
        );
        stop();
      }
    }

    setTimeout(poll, nextPollMs);
  }

  return {
    start,
    stop,
  };
}
