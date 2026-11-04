// Odjemalec API (FR-000-10). Ogrodje – vedenje doda T047.
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`API ${status} ${code}`);
    this.name = 'ApiError';
  }
}

export function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  void path;
  void init;
  return Promise.reject(new Error('not implemented'));
}
