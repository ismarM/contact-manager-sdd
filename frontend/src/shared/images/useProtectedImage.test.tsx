import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthContext, type AuthContextValue } from '../../features/auth/authContext';
import { ANA, createAuthFake } from '../../test/authFake';
import { imageReplies, mockImagesApi, trackBlobUrls } from '../../test/imagesApi';
import { createAuthFetchBlob } from '../api/authFetch';
import { imageCache } from './imageCache';
import { useProtectedImage } from './useProtectedImage';

function wrapper() {
  const lost = vi.fn();
  const gateway = createAuthFake({ user: ANA });
  const value = { authFetchBlob: createAuthFetchBlob(gateway, lost) } as AuthContextValue;
  return {
    lost,
    Wrapper: ({ children }: { children: ReactNode }) => (
      <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    ),
  };
}

const PATH = '/groups/g1/members/m1/photo';

describe('useProtectedImage', () => {
  afterEach(() => {
    imageCache.clear();
    vi.unstubAllGlobals();
  });

  it('brez revizije zahtevka ne pošlje in vrne začetnice (src = null)', () => {
    const api = mockImagesApi();
    const { Wrapper } = wrapper();

    const { result } = renderHook(() => useProtectedImage(PATH, null, 96), { wrapper: Wrapper });

    expect(result.current.src).toBeNull();
    expect(api.requests).toHaveLength(0);
  });

  it('prenese sliko z žetonom in ključem v naslovu; po odmontaži prekliče blob URL', async () => {
    const urls = trackBlobUrls();
    const api = mockImagesApi();
    const { Wrapper } = wrapper();

    const { result, unmount } = renderHook(() => useProtectedImage(PATH, 3, 96), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.src).toMatch(/^blob:/));
    expect(api.reads()).toHaveLength(1);
    expect(api.reads()[0]?.authorization).toBe('Bearer token-uid-ana');
    expect(api.reads()[0]?.path).toBe('/api/groups/g1/members/m1/photo');
    expect(api.reads()[0]?.search.get('size')).toBe('96');
    expect(urls.active()).toHaveLength(1);

    unmount();
    expect(urls.created).toBe(1);
    expect(urls.revoked).toBe(1);
    expect(urls.active()).toEqual([]);
  });

  it('dva uporabnika iste slike delita en prenos in en blob URL, preklican šele ob zadnji odmontaži', async () => {
    const urls = trackBlobUrls();
    const api = mockImagesApi();
    const { Wrapper } = wrapper();

    const a = renderHook(() => useProtectedImage(PATH, 3, 96), { wrapper: Wrapper });
    const b = renderHook(() => useProtectedImage(PATH, 3, 96), { wrapper: Wrapper });
    await waitFor(() => expect(a.result.current.src).not.toBeNull());
    await waitFor(() => expect(b.result.current.src).not.toBeNull());
    expect(api.reads()).toHaveLength(1);
    expect(urls.created).toBe(1);

    a.unmount();
    expect(urls.revoked).toBe(0);
    b.unmount();
    expect(urls.revoked).toBe(1);
  });

  it('po imageCache.clear() (odjava) ni aktivnega blob URL-ja; števca sta izenačena', async () => {
    const urls = trackBlobUrls();
    mockImagesApi();
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useProtectedImage(PATH, 3, 96), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.src).not.toBeNull());

    imageCache.clear();

    expect(urls.active()).toEqual([]);
    expect(urls.created).toBe(urls.revoked);
  });

  it.each([
    ['404', imageReplies.notFound],
    ['403', imageReplies.forbidden],
  ])('izguba dostopa (%s) odstrani vnos in pusti začetnice', async (_name, reply) => {
    const urls = trackBlobUrls();
    const api = mockImagesApi({ read: reply });
    const { Wrapper } = wrapper();

    const { result } = renderHook(() => useProtectedImage(PATH, 3, 96), { wrapper: Wrapper });

    await waitFor(() => expect(api.reads()).toHaveLength(1));
    expect(result.current.src).toBeNull();
    expect(imageCache.size).toBe(0);
    expect(urls.created).toBe(0);
  });

  it('401 sproži izgubo seje in pusti začetnice', async () => {
    mockImagesApi({ read: imageReplies.unauthenticated });
    const { Wrapper, lost } = wrapper();

    const { result } = renderHook(() => useProtectedImage(PATH, 3, 96), { wrapper: Wrapper });

    await waitFor(() => expect(lost).toHaveBeenCalled());
    expect(result.current.src).toBeNull();
  });

  it('prenos se začne šele, ko je element viden (IntersectionObserver)', async () => {
    trackBlobUrls();
    const api = mockImagesApi();
    let observed = false;
    let notify: (visible: boolean) => void = () => undefined;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          observed = true;
          notify = (isIntersecting) =>
            callback([{ isIntersecting } as IntersectionObserverEntry], this as never);
        }
        observe() {}
        disconnect() {}
      },
    );
    const { Wrapper } = wrapper();

    const { result } = renderHook(
      () => {
        const image = useProtectedImage(PATH, 3, 96);
        return image;
      },
      { wrapper: Wrapper },
    );
    act(() => result.current.attach(document.createElement('div')));

    await waitFor(() => expect(observed).toBe(true));
    expect(api.reads()).toHaveLength(0);

    act(() => notify(true));
    await waitFor(() => expect(result.current.src).not.toBeNull());
    expect(api.reads()).toHaveLength(1);
  });
});
