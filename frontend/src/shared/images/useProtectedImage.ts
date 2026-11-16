import { useCallback, useContext, useEffect, useState } from 'react';

import { AuthContext } from '../../features/auth/authContext';
import { ApiError } from '../api/client';
import { photoUrl } from './imageApi';
import { imageCache } from './imageCache';
import type { PhotoSize } from './photoTypes';

export interface ProtectedImage {
  /** Blob URL slike ali `null` (brez slike, še se nalaga, ali izguba dostopa): prikaži začetnice. */
  src: string | null;
  /** Pritrdi na element, ki sproži prenos, ko postane viden (`IntersectionObserver`). */
  attach: (element: Element | null) => void;
}

/**
 * Slika, zaščitena z ID žetonom (research R-05): prenos prek `authFetchBlob` šele, ko je element viden; brez slike
 * (`revision == null`) zahtevka ni. `401/403/404` odstranijo vnos in pustijo začetnice; druge napake tudi (brez ponavljanja).
 */
export function useProtectedImage(
  path: string | null,
  revision: number | null | undefined,
  size: PhotoSize,
): ProtectedImage {
  // Brez prijave (npr. izris samo začetnic) slike ni, zato avatar ne zahteva AuthProvider.
  const authFetchBlob = useContext(AuthContext)?.authFetchBlob ?? null;
  const [element, setElement] = useState<Element | null>(null);
  const [visible, setVisible] = useState(typeof IntersectionObserver === 'undefined');
  const [loaded, setLoaded] = useState<{ key: string; url: string } | null>(null);

  const attach = useCallback((next: Element | null) => {
    setElement(next);
  }, []);

  useEffect(() => {
    if (visible || !element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, visible]);

  const wanted = path !== null && revision != null && visible;
  const key = wanted ? photoUrl(path, size, revision) : null;

  useEffect(() => {
    if (key === null || path === null || authFetchBlob === null) return;
    let cancelled = false;
    let release: (() => void) | null = null;
    imageCache
      .acquire(key, path, async () => (await authFetchBlob(key)).blob)
      .then((handle) => {
        if (cancelled) {
          handle.release();
          return;
        }
        release = () => {
          handle.release();
        };
        setLoaded({ key, url: handle.url });
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
          imageCache.remove(key);
        }
      });
    return () => {
      cancelled = true;
      release?.();
    };
  }, [authFetchBlob, key, path]);

  return { src: key !== null && loaded?.key === key ? loaded.url : null, attach };
}
