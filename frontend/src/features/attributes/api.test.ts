import { describe, expect, it } from 'vitest';

import { ApiError, apiFetch } from '../../shared/api/client';
import {
  attributeKey,
  attributeKeyPageReply,
  attributeKeys,
  GROUP_ID,
  keyVersionConflictReply,
  mockAttributesApi,
  typeConflictReply,
} from '../../test/typedAttributesApi';
import { createAttributesApi, keyConflictCurrent, typeConflictDetails } from './api';

const api = createAttributesApi(apiFetch);

async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('pričakovana napaka');
}

describe('API ključev atributov', () => {
  it('FR-016-05: seznam pošlje q, page in size ter vrne stran', async () => {
    const { requests } = mockAttributesApi({
      list: attributeKeyPageReply([
        attributeKey({ key: 'Mobilni', type: 'PHONE', contactCount: 3 }),
        attributeKey({ key: 'Mobilni 2' }),
        attributeKey({ key: 'Drugo' }),
      ]),
    });

    const page = await api.listKeys(GROUP_ID, { q: 'mobilni', page: 0, size: 25 });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.search.get('q')).toBe('mobilni');
    expect(requests[0]?.search.get('page')).toBe('0');
    expect(requests[0]?.search.get('size')).toBe('25');
    expect(page.total).toBe(2);
    expect(page.items.map((item) => item.key)).toEqual(['Mobilni', 'Mobilni 2']);
    expect(page.items[0]?.type).toBe('PHONE');
  });

  it('FR-016-05: brez poizvedbe ne pošlje parametrov', async () => {
    const { requests } = mockAttributesApi({ list: attributeKeyPageReply(attributeKeys(3)) });

    const page = await api.listKeys(GROUP_ID);

    expect(requests[0]?.search.toString()).toBe('');
    expect(page.items).toHaveLength(3);
  });

  it('FR-016-05: sprememba tipa pošlje ključ, tip in verzijo', async () => {
    const { requests } = mockAttributesApi();

    const changed = await api.changeType(GROUP_ID, { key: 'mobilni', type: 'PHONE', version: 4 });

    expect(requests[0]?.method).toBe('POST');
    expect(requests[0]?.path).toBe(`/api/groups/${GROUP_ID}/attribute-keys/change-type`);
    expect(requests[0]?.body).toEqual({ key: 'mobilni', type: 'PHONE', version: 4 });
    expect(changed).toMatchObject({ key: 'mobilni', type: 'PHONE', version: 5 });
  });

  it('FR-016-05: konflikt tipa nosi seznam kontaktov in skupno število', async () => {
    mockAttributesApi({
      changeType: () =>
        typeConflictReply([{ contactId: 'c1', displayName: 'Ana Novak', value: 'abc' }], 120),
    });

    const error = await failure(api.changeType(GROUP_ID, { key: 'k', type: 'EMAIL', version: 0 }));

    expect(error).toBeInstanceOf(ApiError);
    expect(typeConflictDetails(error)).toEqual({
      contacts: [{ contactId: 'c1', displayName: 'Ana Novak', value: 'abc' }],
      total: 120,
    });
    expect(keyConflictCurrent(error)).toBeNull();
  });

  it('FR-016-05: konflikt verzije vrne trenutni ključ', async () => {
    const current = attributeKey({ key: 'Mobilni', type: 'PHONE', version: 7 });
    mockAttributesApi({ changeType: () => keyVersionConflictReply(current) });

    const error = await failure(api.changeType(GROUP_ID, { key: 'k', type: 'EMAIL', version: 0 }));

    expect(keyConflictCurrent(error)).toEqual(current);
    expect(typeConflictDetails(error)).toBeNull();
  });

  it('druge napake niso konflikt tipa ali verzije', async () => {
    mockAttributesApi({ changeType: () => ({ status: 403, body: { code: 'FORBIDDEN' } }) });

    const error = await failure(api.changeType(GROUP_ID, { key: 'k', type: 'EMAIL', version: 0 }));

    expect(typeConflictDetails(error)).toBeNull();
    expect(keyConflictCurrent(error)).toBeNull();
    expect(typeConflictDetails(new Error('x'))).toBeNull();
    expect(keyConflictCurrent(undefined)).toBeNull();
  });
});
