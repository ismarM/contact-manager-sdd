import type {
  Comparison,
  DuplicateCategory,
  DuplicatePage,
  MergeRequest,
  MergeResponse,
} from './types';

// Odjemalec API dvojnikov (plan.md – REST endpoints). Ogrodje: brez izvedbe.

/** Zavrnjen obet z znanim sporočilom; argumenti so tu samo zato, da ogrodje ohrani končne podpise. */
function notImplemented<T>(...call: unknown[]): Promise<T> {
  return Promise.reject(new Error(`not implemented (${call.length})`));
}

export function searchDuplicates(
  groupId: string,
  query: { category: DuplicateCategory; page: number; size: number },
): Promise<DuplicatePage> {
  return notImplemented(groupId, query);
}

export function compareContacts(groupId: string, ids: string[]): Promise<Comparison> {
  return notImplemented(groupId, ids);
}

export function mergeContacts(groupId: string, request: MergeRequest): Promise<MergeResponse> {
  return notImplemented(groupId, request);
}
