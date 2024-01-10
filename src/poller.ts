import {
  DEFAULT_INITIAL_CONFIG_REQUEST_RETRIES,
  DEFAULT_POLL_CONFIG_REQUEST_RETRIES,
} from './constants';

export interface IPoller {
  start: () => Promise<void>;
  stop: () => void;
}

export default function initPoller(
  intervalMs: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  callback: () => Promise<any>,
  options?: {
    maxPollRetries?: number;
    maxStartRetries?: number;
    errorOnFailedStart?: boolean;
    pollAfterFailedStart?: boolean;
  },
): IPoller {
  let stopped = false;
  let failedAttempts = 0;
  let nextPollMs = intervalMs;

  const start = async () => {
    stopped = false;
    let startRequestSuccess = false;
    let startAttemptsRemaining =
      1 + (options?.maxStartRetries ?? DEFAULT_INITIAL_CONFIG_REQUEST_RETRIES);

    while (!startRequestSuccess && startAttemptsRemaining > 0) {
      try {
        console.log('>>>> TRYING CALLBACK');
        await callback();
        startRequestSuccess = true;
      } catch (pollingError) {
        console.log('>>>> CALLBACK FAIL');
        console.warn(
          `Eppo SDK encountered an error with initial poll of configurations: ${pollingError.message}`,
        );
        if (--startAttemptsRemaining > 0) {
          const jitterMs = Math.floor(Math.random() * intervalMs * 0.1);
          console.warn(`Eppo SDK will retry the initial poll again in ${jitterMs} ms`);
          await new Promise((resolve) => setTimeout(resolve, jitterMs));
        } else {
          if (options?.pollAfterFailedStart) {
            console.warn('Eppo SDK initial poll failed; will attempt regular polling');
          } else {
            console.error('Eppo SDK initial poll failed. Aborting polling');
            stop();
          }

          if (options?.errorOnFailedStart) {
            throw pollingError;
          }
        }
      }
    }

    console.log('>>> done loop');

    if (!stopped) {
      console.log(`Eppo SDK starting regularly polling every ${intervalMs} ms`, { stopped });
      setTimeout(poll, intervalMs);
    }
  };

  const stop = () => {
    if (!stopped) {
      stopped = true;
      console.log('Eppo SDK polling stopped');
    }
  };

  async function poll() {
    console.log('>>>> POLL');
    if (stopped) {
      return;
    }

    try {
      console.log('>>>>> poll callback');
      await callback();
      // If no error, reset any retrying
      failedAttempts = 0;
      nextPollMs = intervalMs;
    } catch (error) {
      console.warn(`Eppo SDK encountered an error polling configurations: ${error.message}`);
      const maxRetries = options?.maxPollRetries ?? DEFAULT_POLL_CONFIG_REQUEST_RETRIES;
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
