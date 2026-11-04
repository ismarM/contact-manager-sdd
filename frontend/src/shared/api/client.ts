// Odjemalec API (FR-000-10): poti so relativne na /api (isti izvor), napake nosijo kodo iz telesa {"code"}.
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`API ${status} ${code}`);
    this.name = 'ApiError';
  }
}

async function errorCode(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object' && 'code' in body && typeof body.code === 'string') {
      return body.code;
    }
  } catch {
    // Telo ni JSON (npr. 502 iz nginx).
  }
  return 'UNKNOWN';
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');
  const response = await fetch(`/api${path}`, { ...init, headers });
  if (!response.ok) {
    throw new ApiError(response.status, await errorCode(response));
  }
  return (await response.json()) as T;
}
