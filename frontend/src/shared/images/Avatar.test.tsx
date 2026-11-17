import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { AuthContext, type AuthContextValue } from '../../features/auth/authContext';
import { i18n } from '../../i18n';
import { ANA, createAuthFake } from '../../test/authFake';
import { imageText, mockImagesApi, trackBlobUrls } from '../../test/imagesApi';
import { createAuthFetchBlob } from '../api/authFetch';
import { Avatar } from './Avatar';
import { AVATAR_CLASS, avatarColor, avatarColorFor, initials } from './avatarColor';
import { imageCache } from './imageCache';

function withAuth(children: ReactNode) {
  const value = {
    authFetchBlob: createAuthFetchBlob(createAuthFake({ user: ANA }), () => undefined),
  } as AuthContextValue;
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

describe('Avatar', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });
  afterEach(() => imageCache.clear());

  it('začetnice: največ dve (prva črka prve in zadnje besede), tudi iz e-naslova in šumnikov', () => {
    expect(initials('Ana Novak')).toBe('AN');
    expect(initials('Janez Marija Čuk')).toBe('JČ');
    expect(initials('ana@primer.si')).toBe('A');
    expect(initials('  ')).toBe('?');
  });

  it('barva je stabilna po id-ju in vedno ena od osmih barv skupin; skupina uporabi svojo barvo', () => {
    expect(avatarColor('ana@primer.si')).toBe(avatarColor('ana@primer.si'));
    const colors = new Set(Array.from({ length: 200 }, (_, i) => avatarColor(`uid-${i}`)));
    expect(colors.size).toBe(8);
    for (const color of colors) expect(AVATAR_CLASS[color]).toMatch(/text-group-/);
    expect(avatarColorFor('group', 'oker')).toBe('oker');
  });

  it('brez slike: začetnice v barvi skupine kot besedilo z robom 1 px; dostopno ime je ime', () => {
    render(<Avatar kind="user" name="Ana Novak" colorSeed="ana@primer.si" size={40} />);

    const avatar = screen.getByRole('img', { name: 'Ana Novak' });
    expect(avatar).toHaveTextContent('AN');
    const color = AVATAR_CLASS[avatarColor('ana@primer.si')];
    for (const token of color.split(' ')) expect(avatar).toHaveClass(token);
    expect(avatar).toHaveClass('border');
    expect(avatar).toHaveClass('size-10');
  });

  it('alt="" (ime stoji ob avatarju): avatar je okras, dostopnega imena ni', () => {
    const { container } = render(
      <Avatar kind="user" name="Ana Novak" colorSeed="ana@primer.si" size={32} alt="" />,
    );

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    // Okras nima vloge, zato ga ni mogoče poiskati po vlogi: preverimo samo skrivanje korena.
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('izbrisan uporabnik: nevtralen avatar z ikono, brez začetnic', () => {
    render(
      <Avatar
        kind="user"
        name={null}
        colorSeed=""
        size={32}
        alt={imageText('images.deletedUser')}
      />,
    );

    const avatar = screen.getByRole('img', { name: 'Izbrisan uporabnik' });
    expect(avatar).toHaveClass(AVATAR_CLASS.grafit.split(' ')[0] ?? '');
    expect(avatar.textContent).toBe('');
  });

  it('s sliko: prenese sliko z žetonom in jo prikaže z imenom kot alt; po odmontaži prekliče blob URL', async () => {
    const urls = trackBlobUrls();
    const api = mockImagesApi();

    const { unmount } = render(
      withAuth(
        <Avatar
          kind="user"
          name="Ana Novak"
          colorSeed="ana@primer.si"
          size={64}
          photo={{ path: '/me/photo', revision: 5 }}
        />,
      ),
    );

    await waitFor(() => expect(screen.getByRole('img', { name: 'Ana Novak' }).tagName).toBe('IMG'));
    const image = screen.getByRole('img', { name: 'Ana Novak' });
    expect(image).toHaveAttribute('src', expect.stringMatching(/^blob:/));
    expect(api.reads()[0]?.search.get('size')).toBe('256');
    unmount();
    await waitFor(() => expect(urls.active()).toEqual([]));
    expect(urls.created).toBe(urls.revoked);
  });

  it('revizija null: zahtevka ni, prikažejo se začetnice', () => {
    const api = mockImagesApi();
    render(
      withAuth(
        <Avatar
          kind="user"
          name="Ana Novak"
          colorSeed="ana@primer.si"
          size={40}
          photo={{ path: '/me/photo', revision: null }}
        />,
      ),
    );

    expect(screen.getByRole('img', { name: 'Ana Novak' })).toHaveTextContent('AN');
    expect(api.requests).toHaveLength(0);
  });

  it('vitest-axe: brez kršitev (začetnice, okras, nevtralen avatar)', async () => {
    const { container } = render(
      <div>
        <Avatar kind="user" name="Ana Novak" colorSeed="a" size={40} />
        <Avatar kind="contact" name="Bojan Kralj" colorSeed="b" size={24} alt="" />
        <Avatar kind="user" name={null} colorSeed="" size={32} alt="Izbrisan uporabnik" />
        <Avatar kind="group" name="Projekt FERI" colorSeed="mah" size={128} />
      </div>,
    );

    expect((await axe(container)).violations).toEqual([]);
  });
});
