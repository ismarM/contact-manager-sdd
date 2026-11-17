import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { ANA, createAuthFake } from '../../test/authFake';
import { mockProfileApi, renderApp } from '../../test/renderApp';
import { tr } from '../../test/smartAttributes';
import { API_OPERATIONS } from './apiOperations';

// Javna stran API (FR-019-14, -15, -19; design.md 8.1, 9).

describe('ApiDocsPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-019-14: neprijavljen vidi vse razdelke, varnostna priporočila in povezavo na prijavo', async () => {
    renderApp('/api-docs');

    expect(
      await screen.findByRole('heading', { level: 1, name: tr('apiDocs.heading') }),
    ).toBeInTheDocument();
    for (const section of [
      'security',
      'create',
      'auth',
      'operations',
      'examples',
      'pagination',
      'errors',
      'limits',
      'versions',
    ]) {
      expect(
        screen.getByRole('heading', { level: 2, name: tr(`apiDocs.${section}.heading`) }),
      ).toBeInTheDocument();
    }
    const main = screen.getByRole('main');
    expect(main).toHaveTextContent(tr('apiDocs.security.secret'));
    expect(main).toHaveTextContent(tr('apiDocs.security.memberSees'));
    expect(main).toHaveTextContent(tr('apiDocs.security.noCors'));
    expect(screen.getByRole('link', { name: tr('apiDocs.backToLogin') })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(screen.getByRole('link', { name: tr('apiDocs.create.link') })).toHaveAttribute(
      'href',
      '/account',
    );
    expect(document.title).toBe(`${tr('apiDocs.title')} – ${tr('app.name')}`);
  });

  it('FR-019-14: prijavljen dobi povezavo na Moj račun', async () => {
    mockProfileApi();
    renderApp('/api-docs', { gateway: createAuthFake({ user: ANA }) });

    expect(await screen.findByRole('link', { name: tr('apiDocs.backToAccount') })).toHaveAttribute(
      'href',
      '/account',
    );
  });

  it('FR-019-14: našteje vse operacije z najnižjo vlogo in pravico ključa', async () => {
    renderApp('/api-docs');

    const list = await screen.findByRole('list', { name: tr('apiDocs.operations.caption') });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(API_OPERATIONS.length);
    const create = items.find((item) => item.textContent?.includes('POST /v1/groups/'))!;
    expect(create).toHaveTextContent(tr('roles.EDITOR'));
    expect(create).toHaveTextContent(tr('apiDocs.operations.permissionWrite'));
    const groups = items.find((item) => item.textContent?.startsWith('GET /v1/groups'))!;
    expect(groups).toHaveTextContent(tr('apiDocs.operations.roleAny'));
  });

  it('FR-019-15: prenos opisa vmesnika kaže na /v1/openapi.json', async () => {
    renderApp('/api-docs');

    const download = await screen.findByRole('link', { name: tr('apiDocs.download') });
    expect(download).toHaveAttribute('href', '/v1/openapi.json');
    expect(download).toHaveAttribute('download');
  });

  it('FR-019-14: kode napak in omejitev pogostosti so naštete', async () => {
    renderApp('/api-docs');

    const errors = await screen.findByRole('list', { name: tr('apiDocs.errors.caption') });
    for (const code of ['UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'RATE_LIMITED']) {
      expect(errors).toHaveTextContent(code);
    }
    expect(screen.getByRole('main')).toHaveTextContent(tr('apiDocs.limits.rate', { limit: 120 }));
  });

  it('FR-019-14: gumb Kopiraj kopira primer in sporoči izid; neuspeh je viden', async () => {
    const { user } = renderApp('/api-docs');
    const written: string[] = [];
    const clipboard = {
      writeText: (text: string) => {
        written.push(text);
        return Promise.resolve();
      },
    };
    Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });

    const name = `${tr('apiDocs.examples.listGroups')} – ${tr('apiDocs.examples.request')}`;
    await user.click(
      await screen.findByRole('button', { name: tr('apiDocs.copyExample', { name }) }),
    );

    expect(written).toHaveLength(1);
    expect(written[0]).toContain('curl -H "Authorization: Bearer cmk_…"');
    expect(written[0]).toContain('/v1/groups');
    expect(await screen.findByText(tr('apiDocs.copied'))).toBeInTheDocument();

    clipboard.writeText = () => Promise.reject(new Error('denied'));
    await user.click(screen.getByRole('button', { name: tr('apiDocs.copyExample', { name }) }));
    expect(await screen.findByText(tr('apiDocs.copyFailed'))).toBeInTheDocument();
    expect(screen.queryByText(tr('apiDocs.copied'))).not.toBeInTheDocument();
  });

  it('FR-019-14: preklop jezika prevede stran; v angleščini ni slovenskih besedil', async () => {
    const { user } = renderApp('/api-docs');
    const slovenianIntro = tr('apiDocs.intro');

    await user.click(await screen.findByRole('button', { name: 'English' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: tr('apiDocs.heading', { lng: 'en' }) }),
    ).toBeInTheDocument();
    expect(screen.queryByText(slovenianIntro)).not.toBeInTheDocument();
  });

  it('FR-019-14: brez kršitev axe (sl in en)', async () => {
    const { container, user } = renderApp('/api-docs');
    await screen.findByRole('heading', { level: 1, name: tr('apiDocs.heading') });
    expect((await axe(container)).violations).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'English' }));
    await screen.findByRole('heading', { level: 1, name: tr('apiDocs.heading', { lng: 'en' }) });
    expect((await axe(container)).violations).toEqual([]);
  });

  it('FR-019-14: povezava s prijave vodi na stran API', async () => {
    renderApp('/login');

    expect(await screen.findByRole('link', { name: tr('login.apiDocsLink') })).toHaveAttribute(
      'href',
      '/api-docs',
    );
  });
});
