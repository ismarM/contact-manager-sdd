// Operacije programskega vmesnika /v1 za stran API (FR-019-14, -15). Seznam mora biti enak operacijam v opisu
// `backend/src/main/resources/api/openapi-v1.json` (preveri `apiOperations.test.ts`).

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface ApiOperation {
  method: HttpMethod;
  path: string;
  /** Ključ prevoda opisa v `apiDocs.operations`. */
  text:
    | 'listGroups'
    | 'listContacts'
    | 'getContact'
    | 'createContact'
    | 'updateContact'
    | 'deleteContact'
    | 'description_doc';
  /** Najnižja vloga v skupini; `any` = katerakoli članska vloga, `public` = brez ključa. */
  role: 'VIEWER' | 'EDITOR' | 'any' | 'public';
  /** Pravica ključa: `READ` = branje (velja tudi za ključ z pisanjem), `WRITE` = samo ključ s pisanjem, `none` = brez ključa. */
  permission: 'READ' | 'WRITE' | 'none';
}

export const API_VERSION = '1';

export const API_OPERATIONS: readonly ApiOperation[] = [
  { method: 'GET', path: '/v1/groups', text: 'listGroups', role: 'any', permission: 'READ' },
  {
    method: 'GET',
    path: '/v1/groups/{groupId}/contacts',
    text: 'listContacts',
    role: 'VIEWER',
    permission: 'READ',
  },
  {
    method: 'GET',
    path: '/v1/groups/{groupId}/contacts/{contactId}',
    text: 'getContact',
    role: 'VIEWER',
    permission: 'READ',
  },
  {
    method: 'POST',
    path: '/v1/groups/{groupId}/contacts',
    text: 'createContact',
    role: 'EDITOR',
    permission: 'WRITE',
  },
  {
    method: 'PUT',
    path: '/v1/groups/{groupId}/contacts/{contactId}',
    text: 'updateContact',
    role: 'EDITOR',
    permission: 'WRITE',
  },
  {
    method: 'DELETE',
    path: '/v1/groups/{groupId}/contacts/{contactId}',
    text: 'deleteContact',
    role: 'EDITOR',
    permission: 'WRITE',
  },
  {
    method: 'GET',
    path: '/v1/openapi.json',
    text: 'description_doc',
    role: 'public',
    permission: 'none',
  },
];

/** Naslov opisa vmesnika (prenos na strani API). */
export const OPENAPI_PATH = '/v1/openapi.json';

/** Napake po statusu za register kod (FR-019-14); `RATE_LIMITED` ima status 429. */
export const ERROR_CODES = [
  { status: 400, code: 'VALIDATION_FAILED' },
  { status: 401, code: 'UNAUTHENTICATED' },
  { status: 403, code: 'FORBIDDEN' },
  { status: 404, code: 'NOT_FOUND' },
  { status: 409, code: 'GROUP_ARCHIVED' },
  { status: 409, code: 'VERSION_CONFLICT' },
  { status: 429, code: 'RATE_LIMITED' },
] as const;
