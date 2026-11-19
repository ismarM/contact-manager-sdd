import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { i18n } from '../../i18n';
import {
  CONTACT_ID,
  contactDetail,
  contactSummaries,
  contactPageReply,
  GROUP_ID,
  renderContactsApp,
} from '../../test/contactsApi';
import { mockHistoryApi, renderHistoryApp, tr } from '../../test/historyApi';

// Vstopne točke v zgodovino (FR-015-05, FR-015-22; design.md 9.3, 9.4) in poti, ki jih razreši okvir skupine.

describe('Povezave na zgodovino', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-015-05: pogled kontakta ima razdelek Zgodovina s povezavama na zgodovino kontakta in na sled', async () => {
    renderContactsApp(`/groups/${GROUP_ID}/contacts/${CONTACT_ID}`, {
      role: 'VIEWER',
      contacts: { get: () => ({ status: 200, body: contactDetail() }) },
    });

    const section = await screen.findByRole('region', { name: tr('contacts.view.historyHeading') });
    expect(
      within(section).getByRole('link', { name: tr('contacts.view.historyLink') }),
    ).toHaveAttribute('href', `/groups/${GROUP_ID}/contacts/${CONTACT_ID}/history`);
    expect(
      within(section).getByRole('link', { name: tr('contacts.view.auditLink') }),
    ).toHaveAttribute('href', `/groups/${GROUP_ID}/audit?contact=${CONTACT_ID}`);
  });

  it('FR-015-22: skupina ima zavihek Izbrisani kontakti (tudi za bralca)', async () => {
    renderContactsApp(`/groups/${GROUP_ID}/contacts`, {
      role: 'VIEWER',
      contacts: { list: contactPageReply(contactSummaries(3)) },
    });

    const sections = await screen.findByRole('navigation', { name: tr('groups.header.sections') });
    expect(
      within(sections).getByRole('link', { name: tr('contacts.deletedLink') }),
    ).toHaveAttribute('href', `/groups/${GROUP_ID}/deleted-contacts`);
  });

  it('FR-015-05: povezava Zgodovina kontakta vodi na časovnico', async () => {
    mockHistoryApi();
    const { user } = renderContactsApp(`/groups/${GROUP_ID}/contacts/${CONTACT_ID}`, {
      role: 'VIEWER',
      contacts: { get: () => ({ status: 200, body: contactDetail() }) },
    });

    await user.click(await screen.findByRole('link', { name: tr('contacts.view.historyLink') }));

    expect(window.location.pathname).toBe(`/groups/${GROUP_ID}/contacts/${CONTACT_ID}/history`);
  });

  it('neznane podpoti zgodovine so »Te strani ni«', async () => {
    for (const path of [
      `contacts/${CONTACT_ID}/history/a/b`,
      `contacts/${CONTACT_ID}/compare/x`,
      `contacts/${CONTACT_ID}/versions`,
      'deleted-contacts/x',
    ]) {
      const view = renderHistoryApp(`/groups/${GROUP_ID}/${path}`, { role: 'VIEWER' });
      expect(
        await screen.findByRole('heading', { level: 1, name: tr('notFound.heading') }),
      ).toBeVisible();
      view.unmount();
    }
  });
});
