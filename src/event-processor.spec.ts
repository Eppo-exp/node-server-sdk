import * as td from 'testdouble';

import EventProcessor, { EventType, IEvent } from './event-processor';
import HttpClient from './http-client';

describe('EventProcessor', () => {
  jest.useFakeTimers();
  const httpClient = td.object<HttpClient>();
  httpClient.isUnauthorized = false;
  const testInterval = 1000;
  let eventProcessor: EventProcessor;
  const errorEvent: IEvent = {
    type: EventType.ERROR,
    properties: {},
  };

  beforeEach(() => {
    eventProcessor = new EventProcessor(httpClient, 10, testInterval);
  });

  afterEach(() => {
    td.reset();
    jest.clearAllTimers();
  });

  describe('flush()', () => {
    it('reports enqueued events at intervals', async () => {
      eventProcessor.enqueue(errorEvent);
      eventProcessor.enqueue(errorEvent);
      jest.advanceTimersByTime(testInterval + 500);
      await new Promise(jest.requireActual('timers').setImmediate);
      td.verify(httpClient.post('/events', [errorEvent, errorEvent]), { times: 1 });
    });
  });
});
