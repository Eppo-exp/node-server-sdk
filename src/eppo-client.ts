import { IExperimentConfiguration } from './experiment/experiment-configuration';
import ExperimentConfigurationRequestor from './experiment/experiment-configuration-requestor';
import { getShard, isShardInRange } from './shard';

/**
 * Client for assigning experiment variations.
 * @public
 */
export interface IEppoClient {
  /**
   * Maps a subject to a variation for a given experiment.
   *
   * @param subject an entity ID, e.g. userId
   * @param flag experiment identifier
   * @returns a variation value if the subject is part of the experiment sample, otherwise null
   * @public
   */
  getAssignment(subject: string, flag: string): Promise<string>;
}

export default class EppoClient implements IEppoClient {
  constructor(private configurationRequestor: ExperimentConfigurationRequestor) {}

  async getAssignment(subject: string, flag: string): Promise<string> {
    const experimentConfig = await this.configurationRequestor.getConfiguration(flag);
    if (!experimentConfig?.enabled || !this.isInExperimentSample(subject, flag, experimentConfig)) {
      return null;
    }
    const { variations, subjectShards } = experimentConfig;
    const shard = getShard(`assignment-${subject}-${flag}`, subjectShards);
    return variations.find((variation) => isShardInRange(shard, variation.shardRange)).name;
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
    const shard = getShard(`exposure-${subject}-${experiment}`, subjectShards);
    return shard <= percentExposure * subjectShards;
  }
}
