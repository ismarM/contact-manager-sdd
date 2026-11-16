import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import {
  auditEntry,
  auditPageReply,
  changePageReply,
  contactChange,
  entryId,
  GROUP_ID,
  renderAuditApp,
  summaryOf,
} from '../../test/auditApi';
import {
  CONTACT_ID,
  historyEvent,
  historyReply,
  renderHistoryApp,
  tr,
} from '../../test/historyApi';
import type { PhotoChange } from './types';

// Dogodek slike kontakta v sledi in zgodovini (FR-018-10, -17): stavek »dodal(a) / zamenjal(a) / odstranil(a) sliko«,
// nikoli »Ni sprememb«, vnos samo s sliko ni obnovljiv.

const PHOTO_EVENTS: PhotoChange[] = ['ADDED', 'REPLACED', 'REMOVED'];
const ENTRY = entryId(1);

describe('Dogodek slike v sledi', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it.each(PHOTO_EVENTS)(
    'vnos sledi %s: stavek o sliki, podrobnosti brez preglednice in brez »Ni sprememb«',
    async (photoChange) => {
      const { user, container } = renderAuditApp(`/groups/${GROUP_ID}/audit`, {
        role: 'VIEWER',
        handlers: {
          list: auditPageReply([auditEntry({ id: ENTRY, action: 'UPDATE', photoChange })]),
          changes: changePageReply([contactChange({ fields: [] })]),
        },
      });

      const item = within(
        await screen.findByRole('list', { name: tr('audit.list.entries') }),
      ).getAllByRole('listitem')[0] as HTMLElement;
      expect(item).toHaveTextContent(
        tr(`audit.sentence.PHOTO_${photoChange}_named`, { name: 'Janez Novak' }),
      );
      expect(item).not.toHaveTextContent(
        tr('audit.sentence.UPDATE_named', { name: 'Janez Novak' }),
      );

      await user.click(
        summaryOf(within(item).getByRole('group', { name: tr('audit.details.summary') })),
      );
      expect(await within(item).findByText(tr(`images.audit.${photoChange}`))).toBeInTheDocument();
      expect(within(item).queryByRole('table')).not.toBeInTheDocument();
      expect(within(item).getByText('Janez Novak', { selector: 'li' })).toBeInTheDocument();
      expect(item).not.toHaveTextContent(/ni sprememb/i);
      expect((await axe(container)).violations).toEqual([]);
    },
  );

  it('vnos brez dogodka slike ostane običajen stavek (UPDATE)', async () => {
    renderAuditApp(`/groups/${GROUP_ID}/audit`, {
      role: 'VIEWER',
      handlers: { list: auditPageReply([auditEntry({ id: ENTRY, action: 'UPDATE' })]) },
    });

    const list = await screen.findByRole('list', { name: tr('audit.list.entries') });
    expect(list).toHaveTextContent(tr('audit.sentence.UPDATE_named', { name: 'Janez Novak' }));
  });

  it('angleški stavek o sliki', async () => {
    await i18n.changeLanguage('en');
    renderAuditApp(`/groups/${GROUP_ID}/audit`, {
      role: 'VIEWER',
      handlers: {
        list: auditPageReply([
          auditEntry({ id: ENTRY, action: 'UPDATE', photoChange: 'REPLACED' }),
        ]),
      },
    });

    expect(
      await screen.findByText(/replaced the picture of contact Janez Novak/),
    ).toBeInTheDocument();
  });
});

describe('Dogodek slike v zgodovini kontakta', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  const path = `/groups/${GROUP_ID}/contacts/${CONTACT_ID}/history`;

  function renderHistory(events: ReturnType<typeof historyEvent>[]) {
    return renderHistoryApp(path, {
      role: 'EDITOR',
      history: { history: historyReply(events) },
    });
  }

  it.each(PHOTO_EVENTS)(
    '%s samo s sliko: stavek, oznaka dogodka, brez gumba obnove, z razlago',
    async (photoChange) => {
      const { container } = renderHistory([
        historyEvent(3),
        historyEvent(2, { photoChange, fields: [] }),
        historyEvent(1),
      ]);

      const list = await screen.findByRole('list', { name: tr('history.page.events') });
      const item = within(list)
        .getAllByRole('listitem')
        .find((entry) => entry.textContent?.includes(tr(`images.audit.${photoChange}`)));
      if (!item) throw new Error('dogodek slike ni prikazan');
      expect(item).toHaveTextContent(tr(`audit.sentence.PHOTO_${photoChange}`));
      expect(item).toHaveTextContent(tr('images.audit.notRestorable'));
      expect(item).not.toHaveTextContent(/ni sprememb/i);
      expect(within(item).queryByRole('button')).not.toBeInTheDocument();
      expect(
        within(item).queryByRole('group', { name: tr('history.event.details') }),
      ).not.toBeInTheDocument();
      // Drugi dogodki imajo gumb obnove.
      expect(
        within(list).getAllByRole('button', { name: new RegExp(tr('history.restore.button')) })
          .length,
      ).toBeGreaterThan(0);
      expect((await axe(container)).violations).toEqual([]);
    },
  );

  it('pomešan vnos (polje in slika): preglednica polj ostane, gumb obnove je na voljo', async () => {
    renderHistory([historyEvent(3), historyEvent(2, { photoChange: 'ADDED' }), historyEvent(1)]);

    const list = await screen.findByRole('list', { name: tr('history.page.events') });
    const item = within(list)
      .getAllByRole('listitem')
      .find((entry) => entry.textContent?.includes(tr('images.audit.ADDED')));
    if (!item) throw new Error('dogodek ni prikazan');
    expect(
      within(item).getByRole('group', { name: tr('history.event.details') }),
    ).toBeInTheDocument();
    expect(item).not.toHaveTextContent(tr('images.audit.notRestorable'));
    expect(
      within(item).getByRole('button', { name: new RegExp(tr('history.restore.button')) }),
    ).toBeInTheDocument();
  });
});
