import type {
  ReferralsRequests,
  ReferralsResponses,
} from '../../shared/referrals-api';
import type { Result } from './contract';

export type ReferralsApi = {
  [K in keyof ReferralsRequests]: (
    input: ReferralsRequests[K],
  ) => Promise<Result<ReferralsResponses[K]>>;
};
