import type {
  BulkDeleteRequest,
  BulkDeleteResult,
  BulkUpdateRequest,
  BulkUpdateResult,
  ContactIds,
  SelectionCheckRequest,
  SelectionCheckResult,
} from '../types';
import type { SelectionParams } from './selection';

// Odjemalec endpointov izbora in množičnih operacij (plan.md – REST endpoints); izvedba v T041.

export const contactIds: (groupId: string, params: SelectionParams) => Promise<ContactIds> = () => {
  throw new Error('not implemented');
};

export const selectionCheck: (
  groupId: string,
  request: SelectionCheckRequest,
) => Promise<SelectionCheckResult> = () => {
  throw new Error('not implemented');
};

export const bulkUpdate: (
  groupId: string,
  request: BulkUpdateRequest,
) => Promise<BulkUpdateResult> = () => {
  throw new Error('not implemented');
};

export const bulkDelete: (
  groupId: string,
  request: BulkDeleteRequest,
) => Promise<BulkDeleteResult> = () => {
  throw new Error('not implemented');
};
