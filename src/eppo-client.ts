import { getBucket, getBucketRanges, isBucketInRange } from './bucket';
import { IConfigurationStore } from './configuration-store';
import { IExperimentConfiguration } from './experiment/experiment-configuration';

/**
 * Total buckets used to determine whether a user is part of an experiment.
 * This is different from the buckets used for assigning a variant.
 * Using 10000 instead of 100 buckets allows for more precise sample sizes up to 2 decimal places:
 * e.g. only show the experiment to 4.25% of users.
 */
const EXPERIMENT_EXPOSURE_NUM_BUCKETS = 10000;

/**
 * Client for assigning experiment variations.
 * @public
 */
export default class EppoClient {
  constructor(
    private accessToken: string,
    private configurationStore: IConfigurationStore<IExperimentConfiguration>,
  ) {}

  /**
   * Maps a subject to a variation for a given experiment.
   *
   * @param subject an entity ID, e.g. userId
   * @param experiment experiment identifier
   * @returns a variation value if the subject is part of the experiment sample, otherwise null
   * @public
   */
  async getAssignment(subject: string, experiment: string): Promise<string> {
    const experimentConfig = await this.configurationStore.getConfiguration(experiment);
    if (
      !experimentConfig ||
      !this.isInExperimentSample(subject, experiment, experimentConfig.exposurePercentage)
    ) {
      return null;
    }
    const { variations, totalBuckets } = experimentConfig;
    const variationBucketRanges = getBucketRanges(variations, totalBuckets);
    const bucket = getBucket(`assignment-${subject}-${experiment}`, totalBuckets);
    return variationBucketRanges.find((range) => isBucketInRange(bucket, range)).variation;
  }

  /**
   * This checks whether the subject is included in the experiment sample.
   * It is used to determine whether the subject should be assigned to a variant.
   * Given a hash function output (bucket), check whether the bucket is between 0 and exposure_percent * total_buckets.
   */
  private isInExperimentSample(
    subject: string,
    experiment: string,
    exposurePercentage: number,
  ): boolean {
    const bucket = getBucket(`exposure-${subject}-${experiment}`, EXPERIMENT_EXPOSURE_NUM_BUCKETS);
    return bucket <= exposurePercentage * EXPERIMENT_EXPOSURE_NUM_BUCKETS;
  }
}
