import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router';

import { ScrollToTop } from './ScrollToTop';

function setup() {
  const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  const router = createMemoryRouter(
    [
      {
        element: (
          <>
            <ScrollToTop />
            <Outlet />
          </>
        ),
        children: [{ path: '/groups/g/contacts' }, { path: '/groups/g/contacts/c' }],
      },
    ],
    { initialEntries: ['/groups/g/contacts'] },
  );
  render(<RouterProvider router={router} />);
  return { router, scrollTo };
}

describe('ScrollToTop', () => {
  afterEach(() => vi.restoreAllMocks());

  it('nova pot (seznam → kontakt) začne na vrhu strani', async () => {
    const { router, scrollTo } = setup();
    expect(scrollTo).not.toHaveBeenCalled();

    await act(() => router.navigate('/groups/g/contacts/c'));

    expect(scrollTo).toHaveBeenCalledExactlyOnceWith(0, 0);
  });

  it('sprememba samo poizvedbe (iskanje, stran) odmika ne spremeni', async () => {
    const { router, scrollTo } = setup();

    await act(() => router.navigate('/groups/g/contacts?q=nina'));
    await act(() => router.navigate('/groups/g/contacts?q=nina&page=2', { replace: true }));

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('Nazaj (POP) prepusti odmik brskalniku', async () => {
    const { router, scrollTo } = setup();
    await act(() => router.navigate('/groups/g/contacts/c'));
    scrollTo.mockClear();

    await act(() => router.navigate(-1));

    expect(router.state.location.pathname).toBe('/groups/g/contacts');
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
