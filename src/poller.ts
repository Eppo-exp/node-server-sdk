import EventProcessor, { EventType } from './event-processor';

interface IPoller {
  start: () => Promise<void>;
  stop: () => void;
}

export default function initPoller(
  interval: number,
  jitterMillis: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  callback: () => Promise<any>,
  eventProcessor: EventProcessor,
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
      eventProcessor.enqueue({
        type: EventType.ERROR,
        properties: {
          message: `Error polling configurations: ${error.message}`,
        },
      });
    }
    const intervalWithJitter = interval - Math.random() * jitterMillis;
    setTimeout(poll, intervalWithJitter);
  }

  return {
    start: poll,
    stop,
  };
}
