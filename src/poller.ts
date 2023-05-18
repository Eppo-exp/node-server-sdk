export interface IPoller {
  start: () => Promise<void>;
  stop: () => void;
}

export default function initPoller(
  interval: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  callback: () => Promise<any>,
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
        stop();
      }
      console.error(`Error polling configurations: ${error.message}`);
    }
    setTimeout(poll, interval);
  }

  return {
    start: poll,
    stop,
  };
}
