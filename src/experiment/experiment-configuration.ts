import { IVariation } from './variation';

export interface IExperimentConfiguration {
  name: string;
  percentExposure: number;
  enabled: boolean;
  subjectShards: number;
  variations: IVariation[];
}
