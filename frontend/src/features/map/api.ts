import type { AuthFetch, AuthFetchBlob } from '../../shared/api/authFetch';

/** Lokacija naslova (contracts/openapi.yaml – AddressLocation); koordinate so `null` pri `NOT_FOUND`. */
export interface AddressLocation {
  status: 'EXACT' | 'APPROXIMATE' | 'NOT_FOUND';
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * `GET …/contacts/{contactId}/address-location` (016, FR-016-21): lokacija predefiniranega naslova (brez `key`) ali
 * atributa tipa *Naslov*. Zaledje prebere naslov iz kontakta in ga posreduje kartografski storitvi; brskalnik ne kliče
 * nobene tuje storitve (FR-016-23).
 */
export function fetchAddressLocation(
  authFetch: AuthFetch,
  groupId: string,
  contactId: string,
  key: string | undefined,
  language: 'sl' | 'en',
): Promise<AddressLocation> {
  const params = new URLSearchParams({ language });
  if (key !== undefined) params.set('key', key);
  return authFetch<AddressLocation>(
    `/groups/${groupId}/contacts/${contactId}/address-location?${params.toString()}`,
  );
}

/** `GET /api/map-tiles/{z}/{x}/{y}.png` (016, FR-016-21): ploščica podlage prek našega strežnika z žetonom. */
export async function fetchMapTile(
  authFetchBlob: AuthFetchBlob,
  z: number,
  x: number,
  y: number,
  signal: AbortSignal,
): Promise<Blob> {
  const { blob } = await authFetchBlob(`/map-tiles/${z}/${x}/${y}.png`, { signal });
  return blob;
}
