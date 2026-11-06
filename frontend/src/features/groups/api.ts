import type { AuthFetch } from '../../shared/api/authFetch';
import type { GroupDetail, GroupInput, GroupSections, Role } from './types';

// Odjemalec API skupin (plan.md – REST endpoints). Ogrodje (T008): implementacija v US1–US4.

export interface ListParams {
  role?: Role;
  page?: number;
  size: number;
  lang: 'sl' | 'en';
}

export function createGroupsApi(authFetch: AuthFetch) {
  void authFetch;
  return {
    listGroups(params: ListParams): Promise<GroupSections> {
      void params;
      throw new Error('not implemented');
    },
    getGroup(groupId: string): Promise<GroupDetail> {
      void groupId;
      throw new Error('not implemented');
    },
    createGroup(input: GroupInput): Promise<GroupDetail> {
      void input;
      throw new Error('not implemented');
    },
    updateGroup(groupId: string, input: GroupInput & { version: number }): Promise<GroupDetail> {
      void groupId;
      void input;
      throw new Error('not implemented');
    },
  };
}
