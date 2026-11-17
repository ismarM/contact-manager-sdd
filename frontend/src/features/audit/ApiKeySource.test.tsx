import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { auditEntry, auditPageReply, entryId, GROUP_ID, renderAuditApp } from '../../test/auditApi';
import {
  CONTACT_ID,
  historyEvent,
  historyReply,
  renderHistoryApp,
  tr,
} from '../../test/historyApi';
import { ApiKeySource } from './ApiKeySource';

// Oznaka »prek API ključa »ime«« v sledi in zgodovini kontakta (019, FR-019-12; design.md 9.6).

describe('ApiKeySource', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-019-12: vnos sledi z imenom ključa ima oznako, vnos brez ključa je ne', async () => {
    renderAuditApp(`/groups/${GROUP_ID}/audit`, {
      role: 'VIEWER',
      handlers: {
        list: auditPageReply([
          auditEntry({ id: entryId(2), action: 'UPDATE', apiKeyName: 'Nočni izvoz' }),
          auditEntry({ id: entryId(1), action: 'CREATE', apiKeyName: null }),
        ]),
      },
    });

    const items = within(
      await screen.findByRole('list', { name: tr('audit.list.entries') }),
    ).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent(
      'uredil(a) kontakt Janez Novak prek API ključa »Nočni izvoz«',
    );
    expect(items[1]).not.toHaveTextContent('prek API');
    expect((await axe(document.body)).violations).toEqual([]);
  });

  it('FR-019-12: dogodek zgodovine kontakta ima oznako ključa', async () => {
    renderHistoryApp(`/groups/${GROUP_ID}/contacts/${CONTACT_ID}/history`, {
      role: 'VIEWER',
      history: {
        history: historyReply([
          historyEvent(2, { action: 'UPDATE', apiKeyName: 'Nočni izvoz' }),
          historyEvent(1, { action: 'CREATE', kind: 'ADDED', apiKeyName: null }),
        ]),
      },
    });

    const items = within(
      await screen.findByRole('list', { name: tr('history.page.events') }),
    ).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('prek API ključa »Nočni izvoz«');
    expect(items[1]).not.toHaveTextContent('prek API');
    expect((await axe(document.body)).violations).toEqual([]);
  });

  it('FR-019-12: v angleščini oznaka in brez imena »prek API«; brez ključa ni oznake', async () => {
    await i18n.changeLanguage('en');
    const { container, rerender } = render(<ApiKeySource name="Nightly export" />);
    expect(container).toHaveTextContent('via API key “Nightly export”');

    rerender(<ApiKeySource name="" />);
    expect(container).toHaveTextContent('via API');
    expect(container).not.toHaveTextContent('key');

    rerender(<ApiKeySource name={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
