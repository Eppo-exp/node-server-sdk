import { createHash } from 'crypto';

import { IVariation } from './experiment/variation';

export function getBucket(input: string, totalBuckets: number): number {
  const hashOutput = createHash('md5').update(input).digest('hex');
  // get the first 4 bytes of the md5 hex string and parse it using base 16
  // (8 hex characters represent 4 bytes, e.g. 0xffffffff represents the max 4-byte integer)
  const intFromHash = parseInt(hashOutput.slice(0, 8), 16);
  return intFromHash % totalBuckets;
}

export interface IBucketRange {
  variation: string;
  start: number;
  end: number;
}

export function isBucketInRange(bucket: number, range: IBucketRange) {
  return bucket >= range.start && bucket <= range.end;
}

export function getBucketRanges(variations: IVariation[], totalBuckets: number): IBucketRange[] {
  const bucketsPerVariant = totalBuckets / variations.length;
  const lastVariationIndex = variations.length - 1;
  return variations.map((variation, index) => {
    const start = index * Math.floor(bucketsPerVariant);
    // the last variant is assigned 1 extra bucket if there is an uneven split (e.g. split 33 / 33 / 34 when totalBuckets = 100)
    const numBuckets =
      index === lastVariationIndex ? Math.ceil(bucketsPerVariant) : Math.floor(bucketsPerVariant);
    const end = start + numBuckets - 1;
    return {
      variation: variation.value,
      start,
      end,
    };
  });
}
