import { IExperimentConfiguration } from './experiment/experiment-configuration';
import ExperimentConfigurationRequestor from './experiment/experiment-configuration-requestor';
import { getShard, isShardInRange } from './shard';
import { validateNotBlank } from './validation';

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
  getAssignment(subject: string, flag: string): string;

  /**
   * Returns a Promise that resolves once the client polling process has started.
   * @public
   */
  waitForInitialization: () => Promise<void>;
}

export default class EppoClient implements IEppoClient {
  constructor(
    public waitForInitialization: () => Promise<void>,
    private configurationRequestor: ExperimentConfigurationRequestor,
  ) {}

  getAssignment(subject: string, experimentKey: string): string {
    validateNotBlank(subject, 'Invalid argument: subject cannot be blank');
    validateNotBlank(experimentKey, 'Invalid argument: experimentKey cannot be blank');
    const experimentConfig = this.configurationRequestor.getConfiguration(experimentKey);
    if (
      !experimentConfig?.enabled ||
      !this.isInExperimentSample(subject, experimentKey, experimentConfig)
    ) {
      return null;
    }
    const { variations, subjectShards } = experimentConfig;
    const shard = getShard(`assignment-${subject}-${experimentKey}`, subjectShards);
    return variations.find((variation) => isShardInRange(shard, variation.shardRange)).name;
  }

  /**
   * This checks whether the subject is included in the experiment sample.
   * It is used to determine whether the subject should be assigned to a variant.
   * Given a hash function output (bucket), check whether the bucket is between 0 and exposure_percent * total_buckets.
   */
  private isInExperimentSample(
    subject: string,
    experimentKey: string,
    experimentConfig: IExperimentConfiguration,
  ): boolean {
    const { percentExposure, subjectShards } = experimentConfig;
    const shard = getShard(`exposure-${subject}-${experimentKey}`, subjectShards);
    return shard <= percentExposure * subjectShards;
  }
}
