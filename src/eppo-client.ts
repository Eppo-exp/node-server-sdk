import { getBucket, isBucketInRange } from './bucket';
import { IConfigurationStore } from './configuration-store';
import { IExperimentConfiguration } from './experiment/experiment-configuration';

/**
 * Client for assigning experiment variations.
 * @public
 */
export default class EppoClient {
  constructor(private configurationStore: IConfigurationStore<IExperimentConfiguration>) {}

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
      !experimentConfig?.enabled ||
      !this.isInExperimentSample(subject, experiment, experimentConfig)
    ) {
      return null;
    }
    const { variations, subjectShards } = experimentConfig;
    const bucket = getBucket(`assignment-${subject}-${experiment}`, subjectShards);
    return variations.find((variation) => isBucketInRange(bucket, variation.shardRange)).name;
  }

  /**
   * This checks whether the subject is included in the experiment sample.
   * It is used to determine whether the subject should be assigned to a variant.
   * Given a hash function output (bucket), check whether the bucket is between 0 and exposure_percent * total_buckets.
   */
  private isInExperimentSample(
    subject: string,
    experiment: string,
    experimentConfig: IExperimentConfiguration,
  ): boolean {
    const { percentExposure, subjectShards } = experimentConfig;
    const bucket = getBucket(`exposure-${subject}-${experiment}`, subjectShards);
    return bucket <= (percentExposure / 100) * subjectShards;
  }
}
