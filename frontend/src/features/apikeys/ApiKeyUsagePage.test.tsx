import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { apiKey, keyId, mockApiKeysApi, replies, usage } from '../../test/apiKeysApi';
import { renderAccountApp } from '../../test/myDataApi';
import { tr } from '../../test/smartAttributes';

// Statistika ključa (FR-019-20; design.md 13.4: graf z enakovredno tabelo).

const path = (id: string) => `/account/api-keys/${id}`;

describe('Statistika ključa (FR-019-20)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('prikaže skupna števila, graf kot aria-hidden in enakovredno tabelo po dnevih z ničlami', async () => {
    // [branja, pisanja, napake, zavrnitve] od najnovejšega dne nazaj: danes 40/5/3/2, včeraj 1/0/0/0
    const api = mockApiKeysApi({
      list: replies.list([apiKey()]),
      usage: replies.usage(
        usage(7, [
          [40, 5, 3, 2],
          [1, 0, 0, 0],
        ]),
      ),
    });
    const { container } = renderAccountApp({}, { path: path(keyId(1)) });

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: tr('apiKeys.usage.heading', { name: 'Nočni izvoz' }),
      }),
    ).toBeInTheDocument();
    const totals = screen.getByRole('region', { name: tr('apiKeys.usage.totals') });
    expect(
      within(totals).getByText(tr('apiKeys.usage.total')).nextElementSibling,
    ).toHaveTextContent('51');
    expect(
      within(totals).getByText(tr('apiKeys.usage.successful')).nextElementSibling,
    ).toHaveTextContent('46');
    expect(
      within(totals).getByText(tr('apiKeys.usage.reads')).nextElementSibling,
    ).toHaveTextContent('41');
    expect(
      within(totals).getByText(tr('apiKeys.usage.writes')).nextElementSibling,
    ).toHaveTextContent('5');
    expect(
      within(totals).getByText(tr('apiKeys.usage.errors')).nextElementSibling,
    ).toHaveTextContent('3');
    expect(
      within(totals).getByText(tr('apiKeys.usage.rateLimited')).nextElementSibling,
    ).toHaveTextContent('2');

    const chart = screen.getByTestId('usage-chart');
    expect(chart).toHaveAttribute('aria-hidden', 'true');
    const table = screen.getByRole('table', { name: tr('apiKeys.usage.tableCaption') });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual([
      tr('apiKeys.usage.day'),
      tr('apiKeys.usage.successful'),
      tr('apiKeys.usage.errors'),
      tr('apiKeys.usage.rateLimited'),
    ]);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(7);
    // najnovejši dan prvi: 45 uspešnih, 3 napake, 2 zavrnitvi; dnevi brez zahtev imajo 0
    expect(
      within(rows[0]!)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['45', '3', '2']);
    expect(
      within(rows[1]!)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['1', '0', '0']);
    expect(
      within(rows[6]!)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['0', '0', '0']);
    expect(api.usageRequests()[0]?.search).toBe('?days=7');
    expect(api.usageRequests()[0]?.authorization).toMatch(/^Bearer /);
    expect((await axe(container)).violations).toEqual([]);
  });

  it('izbira obdobja 30 dni naloži 30 vrstic', async () => {
    const api = mockApiKeysApi({
      usage: (_call, _id, days) => replies.usage(usage(days === 30 ? 30 : 7)),
    });
    const { user } = renderAccountApp({}, { path: path(keyId(1)) });
    const table = await screen.findByRole('table', { name: tr('apiKeys.usage.tableCaption') });
    expect(within(table).getAllByRole('row')).toHaveLength(8);

    await user.click(screen.getByRole('radio', { name: tr('apiKeys.usage.period30') }));

    await waitFor(() =>
      expect(
        within(screen.getByRole('table', { name: tr('apiKeys.usage.tableCaption') })).getAllByRole(
          'row',
        ),
      ).toHaveLength(31),
    );
    expect(api.usageRequests().map((r) => r.search)).toEqual(['?days=7', '?days=30']);
  });

  it('neobstoječ ali tuj ključ (404) pokaže »Te strani ni«', async () => {
    mockApiKeysApi({ usage: replies.notFound });
    renderAccountApp({}, { path: path(keyId(9)) });

    expect(
      await screen.findByRole('heading', { name: tr('notFound.heading') }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('napaka nalaganja je vidna in Poskusi znova naloži statistiko', async () => {
    mockApiKeysApi({
      usage: (call) => (call === 1 ? replies.serverError : replies.usage(usage(7))),
    });
    const { user } = renderAccountApp({}, { path: path(keyId(1)) });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(tr('apiKeys.usage.loadFailed'));
    await user.click(within(alert).getByRole('button', { name: tr('apiKeys.usage.retry') }));

    expect(
      await screen.findByRole('table', { name: tr('apiKeys.usage.tableCaption') }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('s seznama ključev vodi povezava na statistiko; število zahtev v 24 urah je na seznamu', async () => {
    mockApiKeysApi({
      list: replies.list([apiKey({ lastUsedAt: '2026-11-16T09:00:00Z', requestsLast24h: 48 })]),
    });
    const { user } = renderAccountApp();

    expect(
      await screen.findByText(new RegExp(tr('apiKeys.requests24h', { count: 48 }))),
    ).toBeInTheDocument();
    await user.click(
      await screen.findByRole('link', { name: tr('apiKeys.usageLink', { name: 'Nočni izvoz' }) }),
    );

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: tr('apiKeys.usage.heading', { name: 'Nočni izvoz' }),
      }),
    ).toBeInTheDocument();
  });

  it('v angleščini: brez kršitev axe', async () => {
    await i18n.changeLanguage('en');
    mockApiKeysApi();
    const { container } = renderAccountApp({}, { path: path(keyId(1)) });

    await screen.findByRole('table', { name: tr('apiKeys.usage.tableCaption') });
    expect((await axe(container)).violations).toEqual([]);
  });
});
