import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { auditEntry, auditPageReply, entryId, GROUP_ID, renderAuditApp } from '../../test/auditApi';
import { tr } from '../../test/historyApi';

// Vrsta dejanja ATTRIBUTE_TYPE v sledi (016, FR-016-26): stavek s ključem in tipoma, filter po vrsti.

const PATH = `/groups/${GROUP_ID}/audit`;

const ENTRIES = [
  auditEntry({
    id: entryId(2),
    action: 'ATTRIBUTE_TYPE',
    contactCount: 3,
    contactName: null,
    attributeKey: 'Mobilni',
    typeBefore: 'OTHER',
    typeAfter: 'PHONE',
  }),
  auditEntry({
    id: entryId(1),
    action: 'ATTRIBUTE_TYPE',
    contactCount: 1,
    contactName: 'Ana Kos',
    attributeKey: 'Domov',
    typeBefore: 'OTHER',
    typeAfter: 'ADDRESS',
  }),
];

describe('AuditAttributeType', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-016-26: stavek navede ključ, tip pred in po ter število kontaktov', async () => {
    renderAuditApp(PATH, { role: 'VIEWER', handlers: { list: auditPageReply(ENTRIES) } });

    const items = within(
      await screen.findByRole('list', { name: tr('audit.list.entries') }),
    ).getAllByRole('listitem');

    expect(items[0]).toHaveTextContent(
      'Ana Novak spremenil(a) tip ključa »Mobilni« iz Drugo v Telefon (3 kontakti)',
    );
    expect(items[1]).toHaveTextContent(
      'Ana Novak spremenil(a) tip ključa »Domov« iz Drugo v Naslov (1 kontakt)',
    );
  });

  it('FR-016-26: stavek v angleščini', async () => {
    await i18n.changeLanguage('en');
    renderAuditApp(PATH, { role: 'VIEWER', handlers: { list: auditPageReply(ENTRIES) } });

    const items = within(
      await screen.findByRole('list', { name: tr('audit.list.entries') }),
    ).getAllByRole('listitem');

    expect(items[0]).toHaveTextContent(
      'changed the type of the key “Mobilni” from Other to Phone (3 contacts)',
    );
  });

  it('FR-016-26: filter po vrsti ponuja Sprememba tipa atributa; seznam brez kršitev axe', async () => {
    const { container, api } = renderAuditApp(`${PATH}?action=ATTRIBUTE_TYPE`, {
      role: 'VIEWER',
      handlers: { list: auditPageReply(ENTRIES) },
    });

    await screen.findByRole('list', { name: tr('audit.list.entries') });
    expect(
      api
        .of('GET', `/api/groups/${GROUP_ID}/audit`)
        .some((call) => call.search.getAll('action').includes('ATTRIBUTE_TYPE')),
    ).toBe(true);
    expect((await axe(container)).violations).toEqual([]);
  });
});
