// Odjemalec API (FR-000-10): poti so relativne na /api (isti izvor), napake nosijo kodo iz telesa {"code"} in celotno
// razčlenjeno telo (002, research R-08: napake po poljih pri 400, trenutno stanje pri 409 VERSION_CONFLICT).
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly body: unknown = null,
  ) {
    super(`API ${status} ${code}`);
    this.name = 'ApiError';
  }
}

async function errorBody(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    return text ? (JSON.parse(text) as unknown) : null;
  } catch {
    // Telo ni JSON (npr. 502 iz nginx).
    return null;
  }
}

function codeOf(body: unknown): string {
  if (body && typeof body === 'object' && 'code' in body && typeof body.code === 'string') {
    return body.code;
  }
  return 'UNKNOWN';
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');
  const response = await fetch(`/api${path}`, { ...init, headers });
  if (!response.ok) {
    const body = await errorBody(response);
    throw new ApiError(response.status, codeOf(body), body);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Uspešen odgovor z datoteko (010): telo kot `Blob` in glave odgovora. */
export interface BlobResponse {
  blob: Blob;
  headers: Headers;
}

/** Kot {@link apiFetch}, vendar telo uspešnega odgovora ni JSON, temveč datoteka; napake so enake (`ApiError`). */
export function apiFetchBlob(path: string, init?: RequestInit): Promise<BlobResponse> {
  void path;
  void init;
  return Promise.reject(new Error('not implemented'));
}
