import { randomBytes } from 'crypto';

import * as base64 from 'js-base64';

/* Returns elements from arr until the predicate returns false. */
export function takeWhile<T>(arr: T[], predicate: (item: T) => boolean): T[] {
  const result = [];
  for (const item of arr) {
    if (!predicate(item)) {
      break;
    }
    result.push(item);
  }
  return result;
}

export function generateSalt(length = 16): string {
  const getRandomValues = (length: number) => new Uint8Array(randomBytes(length));
  return base64.fromUint8Array(getRandomValues(length));
}
