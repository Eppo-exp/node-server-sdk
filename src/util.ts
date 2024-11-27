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
