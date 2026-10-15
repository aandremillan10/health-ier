import type { MembershipApi } from '../../shared/membership';

// Keep renderer calls fixed to the named preload contract.
export function createMembershipDesktopClient(
  wire: MembershipApi,
): MembershipApi {
  return {
    readPatientFamily: (input) => wire.readPatientFamily(input),
    createMembership: (input) => wire.createMembership(input),
    updateMembership: (input) => wire.updateMembership(input),
    correctMembership: (input) => wire.correctMembership(input),
    linkDependent: (input) => wire.linkDependent(input),
    updateDependent: (input) => wire.updateDependent(input),
    correctDependent: (input) => wire.correctDependent(input),
    unlinkDependent: (input) => wire.unlinkDependent(input),
    readMembershipHistory: (input) => wire.readMembershipHistory(input),
    readDependentHistory: (input) => wire.readDependentHistory(input),
  };
}
