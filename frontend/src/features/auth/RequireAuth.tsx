import type { ReactNode } from 'react';

// Zaščita poti (FR-001-06) – implementacija v T034.
export function RequireAuth({ children }: { children: ReactNode }) {
  return children;
}
