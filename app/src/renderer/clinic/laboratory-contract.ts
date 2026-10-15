import type { Result } from './contract';
import type {
  LaboratoryRequests,
  LaboratoryResponses,
} from '../../shared/laboratory-api';

export type LaboratoryApi = {
  [K in keyof LaboratoryRequests]: (
    input: LaboratoryRequests[K],
  ) => Promise<Result<LaboratoryResponses[K]>>;
};
