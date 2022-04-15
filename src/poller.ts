interface IPoller {
  start: () => Promise<void>;
  stop: () => void;
}

export default function initPoller<T>(
  interval: number,
  jitterMillis: number,
  callback: () => Promise<void>,
): IPoller {
  let stopped = false;

  async function poll() {
    if (stopped) {
      return;
    }
    try {
      await callback();
    } catch (error) {
      console.error(`Error polling configurations ${error.message}`);
    }
    const intervalWithJitter = interval + Math.random() * jitterMillis;
    setTimeout(poll, intervalWithJitter);
  }

  return {
    start: poll,
    stop: () => {
      stopped = true;
    },
  };
}
