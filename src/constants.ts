const SECOND_MILLIS = 1000;
const MINUTE_MILLIS = 60 * SECOND_MILLIS;

export const POLL_INTERVAL_MILLIS = 5 * MINUTE_MILLIS;
export const JITTER_MILLIS = 30 * SECOND_MILLIS;
export const CACHE_TTL_MILLIS = 15 * MINUTE_MILLIS;
export const REQUEST_TIMEOUT_MILLIS = SECOND_MILLIS;

// Event processor: this configuration allows for reporting 10 error events per minute.
export const EVENT_FLUSH_INTERVAL_MILLIS = MINUTE_MILLIS;
export const EVENT_QUEUE_CAPACITY = 10;

// TODO: replace this once we have a real endpoint
export const BASE_URL = 'http://localhost:4000/api/internal';
