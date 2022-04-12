import { IVariation } from './variation';

export interface IExperimentConfiguration {
  name?: string;
  value: string;
  exposurePercentage: number;
  totalBuckets: number;
  variations: IVariation[];
}
