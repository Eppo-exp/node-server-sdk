import PollingErrorObserver from './polling-error-observer';

interface IPoller {
  start: () => Promise<void>;
  stop: () => void;
}

export default function initPoller(
  interval: number,
  jitterMillis: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  callback: () => Promise<any>,
  pollingErrorObserver: PollingErrorObserver,
): IPoller {
  let stopped = false;
  const stop = () => {
    stopped = true;
  };

  async function poll() {
    if (stopped) {
      return;
    }
    try {
      await callback();
    } catch (error) {
      if (!error.isRecoverable) {
        pollingErrorObserver.notify(error);
        stop();
      }
      console.error(`Error polling configurations: ${error.message}`);
    }
    const intervalWithJitter = interval - Math.random() * jitterMillis;
    setTimeout(poll, intervalWithJitter);
  }

  return {
    start: poll,
    stop,
  };
}
