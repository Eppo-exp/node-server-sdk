import { getBucket, getBucketRanges } from './bucket';

describe('bucket calculation', () => {
  describe('getBucket', () => {
    const totalBuckets = 10000;
    it('is deterministic', () => {
      const bucket1 = getBucket('assign-experiment-1user-2', totalBuckets);
      const bucket2 = getBucket('assign-experiment-1user-2', totalBuckets);
      expect(bucket1).toEqual(bucket2);
      expect(bucket1 < totalBuckets).toEqual(true);
    });
  });

  describe('getBucketRanges', () => {
    it('calculates bucket ranges with uneven variation split', () => {
      const totalBuckets = 10000;
      const bucketRanges = getBucketRanges(
        [
          {
            value: 'control',
            name: 'Control',
          },
          {
            value: 'red',
            name: 'Red Variation',
          },
          {
            value: 'green',
            name: 'Green Variation',
          },
        ],
        totalBuckets,
      );
      expect(bucketRanges).toEqual([
        {
          variation: 'control',
          start: 0,
          end: 3332,
        },
        {
          variation: 'red',
          start: 3333,
          end: 6665,
        },
        {
          variation: 'green',
          start: 6666,
          end: 9999,
        },
      ]);
    });

    it('calculates bucket ranges with even variation split', () => {
      const totalBuckets = 10000;
      const bucketRanges = getBucketRanges(
        [
          {
            value: 'control',
            name: 'Control',
          },
          {
            value: 'red',
            name: 'Red Variation',
          },
          {
            value: 'green',
            name: 'Green Variation',
          },
          {
            value: 'purple',
            name: 'Purple Variation',
          },
        ],
        totalBuckets,
      );
      expect(bucketRanges).toEqual([
        {
          variation: 'control',
          start: 0,
          end: 2499,
        },
        {
          variation: 'red',
          start: 2500,
          end: 4999,
        },
        {
          variation: 'green',
          start: 5000,
          end: 7499,
        },
        {
          variation: 'purple',
          start: 7500,
          end: 9999,
        },
      ]);
    });
  });
});
