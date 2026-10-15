import type { Result as WireResult } from '../../shared/clinic-api';
import type {
  ReferralsRequests,
  ReferralsResponses,
} from '../../shared/referrals-api';
import type { ClinicError, Result } from './contract';
import type { ReferralsApi } from './referrals-contract';

type ReferralBridge = {
  [K in keyof ReferralsRequests]: (
    input: ReferralsRequests[K],
  ) => Promise<WireResult<ReferralsResponses[K]>>;
};
export function createReferralsClient(bridge: ReferralBridge): ReferralsApi {
  async function result<T>(
    operation: Promise<WireResult<T>>,
  ): Promise<Result<T>> {
    const response = await operation;
    if (response.ok) return response;
    const error = response.error;
    const code: ClinicError['code'] =
      error.code === 'FORBIDDEN'
        ? 'DENIED'
        : error.code === 'SESSION_CHANGED'
          ? 'UNAUTHENTICATED'
          : error.code === 'VALIDATION' ||
              error.code === 'UNAUTHENTICATED' ||
              error.code === 'NOT_FOUND' ||
              error.code === 'CONFLICT'
            ? error.code
            : 'UNAVAILABLE';
    return {
      ok: false,
      error: {
        code,
        message: error.message,
        fieldErrors: error.fieldErrors,
        latestRevision: error.currentRevision,
      },
    };
  }
  return {
    listReferrals: (input) => result(bridge.listReferrals(input)),
    listReferralInbox: (input) => result(bridge.listReferralInbox(input)),
    listSentReferrals: (input) => result(bridge.listSentReferrals(input)),
    createReferral: (input) => result(bridge.createReferral(input)),
    acceptReferral: (input) => result(bridge.acceptReferral(input)),
    startReferral: (input) => result(bridge.startReferral(input)),
    completeReferral: (input) => result(bridge.completeReferral(input)),
    cancelReferral: (input) => result(bridge.cancelReferral(input)),
    rejectReferral: (input) => result(bridge.rejectReferral(input)),
  };
}
