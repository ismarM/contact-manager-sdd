import { useEffect } from 'react';

/** Edinstven naslov strani v izbranem jeziku (FR-001-18, design.md 9); posodobi se ob menjavi jezika. */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
