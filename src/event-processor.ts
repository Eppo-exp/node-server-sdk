import HttpClient from './http-client';

export enum EventType {
  ERROR = 'Error',
}

export interface IEvent {
  type: EventType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  properties: Record<string, any>;
}

/**
 * Used for reporting batches of events to an ingestion endpoint.
 * Events are queued so that the ingestion endpoint is not overwhelmed with requests.
 * @internal
 */
export default class EventProcessor {
  private eventQueue: IEvent[] = [];
  private flushIntervalTimer: NodeJS.Timer;

  /**
   * @param httpClient sends requests to the event ingestion endpoint.
   * @param capacity the capacity of the event queue.
   * @param flushIntervalMillis how often to send queued events to the ingestion endpoint.
   */
  constructor(
    private httpClient: HttpClient,
    private capacity: number,
    flushIntervalMillis: number,
  ) {
    this.flushIntervalTimer = setInterval(this.flush.bind(this), flushIntervalMillis);
  }

  /**
   * Called at a regular interval to send enqueued events to an ingestion endpoint.
   */
  async flush() {
    if (this.eventQueue.length === 0 || this.httpClient.isUnauthorized) {
      return;
    }
    try {
      await this.httpClient.post<IEvent[]>('/events', this.eventQueue);
    } catch (error) {
      console.error(`Event ingestion error: ${error.message}`);
    } finally {
      this.eventQueue = [];
    }
  }

  stop() {
    clearInterval(this.flushIntervalTimer);
  }

  /**
   * @param event event to be queued for ingestion. The event is dropped if the queue is full.
   */
  enqueue(event: IEvent) {
    if (this.eventQueue.length < this.capacity) {
      this.eventQueue.push(event);
    } else {
      console.warn(`Event queue is at capacity. Dropping ${event.type} event`);
    }
  }
}
