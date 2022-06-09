import { createHash } from 'crypto';

import { IExperimentConfiguration } from './experiment/experiment-configuration';
import ExperimentConfigurationRequestor from './experiment/experiment-configuration-requestor';
import { Rule, AttributeValueType } from './rule';
import { matchesAnyRule } from './rule_evaluator';
import { getShard, isShardInRange } from './shard';
import { validateNotBlank } from './validation';

/**
 * The subject of the experiment.
 * @public
 */
export interface ISubject {
  /**
   * A subject ID, e.g. a user ID.
   */
  key: string;

  /**
   * Attributes associated with the subject, e.g. name, email. These attributes are used to evaluate
   * any targeting rules defined on the experiment.
   */
  customAttributes?: Record<string, AttributeValueType>;
}

/**
 * Client for assigning experiment variations.
 * @public
 */
export interface IEppoClient {
  /**
   * Maps a subject to a variation for a given experiment.
   *
   * @param subject an entity or user
   * @param experimentKey experiment identifier
   * @returns a variation value if the subject is part of the experiment sample, otherwise null
   * @public
   */
  getAssignment(subject: ISubject, experimentKey: string): string;

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

  getAssignment(subject: ISubject, experimentKey: string): string {
    validateNotBlank(subject.key, 'Invalid argument: subject cannot be blank');
    validateNotBlank(experimentKey, 'Invalid argument: experimentKey cannot be blank');
    const experimentConfig = this.configurationRequestor.getConfiguration(experimentKey);
    if (
      !experimentConfig?.enabled ||
      !this.subjectAttributesSatisfyRules(subject.customAttributes, experimentConfig.rules) ||
      !this.isInExperimentSample(subject.key, experimentKey, experimentConfig)
    ) {
      return null;
    }
    const override = this.getSubjectVariationOverride(subject.key, experimentConfig);
    if (override) {
      return override;
    }
    const { variations, subjectShards } = experimentConfig;
    const shard = getShard(`assignment-${subject.key}-${experimentKey}`, subjectShards);
    return variations.find((variation) => isShardInRange(shard, variation.shardRange)).name;
  }

  private subjectAttributesSatisfyRules(
    subjectAttributes?: Record<string, AttributeValueType>,
    rules?: Rule[],
  ) {
    if (!rules || rules.length === 0) {
      return true;
    }
    return matchesAnyRule(subjectAttributes || {}, rules);
  }

  private getSubjectVariationOverride(
    subjectKey: string,
    experimentConfig: IExperimentConfiguration,
  ): string {
    const subjectHash = createHash('md5').update(subjectKey).digest('hex');
    return experimentConfig.overrides[subjectHash];
  }

  /**
   * This checks whether the subject is included in the experiment sample.
   * It is used to determine whether the subject should be assigned to a variant.
   * Given a hash function output (bucket), check whether the bucket is between 0 and exposure_percent * total_buckets.
   */
  private isInExperimentSample(
    subjectKey: string,
    experimentKey: string,
    experimentConfig: IExperimentConfiguration,
  ): boolean {
    const { percentExposure, subjectShards } = experimentConfig;
    const shard = getShard(`exposure-${subjectKey}-${experimentKey}`, subjectShards);
    return shard <= percentExposure * subjectShards;
  }
}
