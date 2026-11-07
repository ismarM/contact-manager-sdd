import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import {
  CONTACT_ID,
  contactDetail,
  contactPageReply,
  contactSummaries,
  GROUP_ID,
  renderContactsApp,
} from '../../test/contactsApi';
import { currentLocation } from '../../test/renderApp';

// Varovalo pred izgubo neshranjenih sprememb (FR-004-05; design.md 8.12, 9.6).

const LIST = `/groups/${GROUP_ID}/contacts`;
const NEW = `${LIST}/new`;
const EDIT = `${LIST}/${CONTACT_ID}/edit`;

async function openNew() {
  const view = renderContactsApp(NEW, {
    role: 'EDITOR',
    contacts: { list: contactPageReply(contactSummaries(2)) },
  });
  await screen.findByRole('heading', { level: 2, name: 'Nov kontakt' });
  return view;
}

describe('ContactFormGuard', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-004-05: Prekliči brez sprememb gre takoj na seznam, brez dialoga', async () => {
    const { user } = await openNew();

    await user.click(screen.getByRole('button', { name: 'Prekliči' }));

    await waitFor(() => expect(currentLocation()).toBe(LIST));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('FR-004-05: Prekliči z vnosom odpre dialog; fokus na Nadaljuj z urejanjem; Nadaljuj ohrani podatke', async () => {
    const { user } = await openNew();
    await user.type(screen.getByRole('textbox', { name: 'Ime' }), 'Janez');

    await user.click(screen.getByRole('button', { name: 'Prekliči' }));

    const dialog = await screen.findByRole('dialog', { name: 'Zavržem spremembe?' });
    expect(within(dialog).getByRole('button', { name: 'Nadaljuj z urejanjem' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Nadaljuj z urejanjem' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(currentLocation()).toBe(NEW);
    expect(screen.getByRole('textbox', { name: 'Ime' })).toHaveValue('Janez');
  });

  it('FR-004-05: Zavrzi spremembe zapusti obrazec in gre na seznam', async () => {
    const { user } = await openNew();
    await user.type(screen.getByRole('textbox', { name: 'Ime' }), 'Janez');
    await user.click(screen.getByRole('button', { name: 'Prekliči' }));

    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Zavrzi spremembe' }),
    );

    await waitFor(() => expect(currentLocation()).toBe(LIST));
  });

  it('FR-004-05: Esc v dialogu je enak kot Nadaljuj z urejanjem', async () => {
    const { user } = await openNew();
    await user.type(screen.getByRole('textbox', { name: 'Ime' }), 'Janez');
    await user.click(screen.getByRole('button', { name: 'Prekliči' }));
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(currentLocation()).toBe(NEW);
  });

  it('FR-004-05: navigacija po povezavi z neshranjenimi spremembami odpre dialog', async () => {
    const { user } = await openNew();
    await user.type(screen.getByRole('textbox', { name: 'Ime' }), 'Janez');

    await user.click(screen.getByRole('link', { name: 'Nastavitve' }));

    await screen.findByRole('dialog', { name: 'Zavržem spremembe?' });
    expect(currentLocation()).toBe(NEW);
    await user.click(screen.getByRole('button', { name: 'Zavrzi spremembe' }));
    await waitFor(() => expect(currentLocation()).toBe(`/groups/${GROUP_ID}/settings`));
  });

  it.each([
    [
      'Nadaljuj z urejanjem',
      async (user: ReturnType<typeof renderContactsApp>['user']) => {
        await user.click(screen.getByRole('button', { name: 'Nadaljuj z urejanjem' }));
      },
    ],
    [
      'Esc',
      async (user: ReturnType<typeof renderContactsApp>['user']) => {
        await user.keyboard('{Escape}');
      },
    ],
  ])(
    'FR-004-05: navigacija po povezavi, zavrnjena z »%s« – pot ostane, obrazec in vnos ostaneta',
    async (_name, reject) => {
      const { user } = await openNew();
      await user.type(screen.getByRole('textbox', { name: 'Ime' }), 'Janez');
      await user.click(screen.getByRole('link', { name: 'Nastavitve' }));
      await screen.findByRole('dialog', { name: 'Zavržem spremembe?' });

      await reject(user);

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(currentLocation()).toBe(NEW);
      expect(screen.getByRole('form', { name: 'Nov kontakt' })).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'Ime' })).toHaveValue('Janez');
      // Varovalo še velja: ponovni klik na povezavo znova vpraša.
      await user.click(screen.getByRole('link', { name: 'Nastavitve' }));
      expect(await screen.findByRole('dialog', { name: 'Zavržem spremembe?' })).toBeInTheDocument();
      expect(currentLocation()).toBe(NEW);
    },
  );

  it('FR-004-05: urejanje – sprememba polja šteje kot sprememba', async () => {
    const { user } = renderContactsApp(EDIT, {
      role: 'EDITOR',
      contacts: { get: () => ({ status: 200, body: contactDetail() }) },
    });
    await screen.findByRole('heading', { level: 2, name: 'Uredi kontakt' });
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Ime' })).toHaveValue('Janez'));
    await user.type(screen.getByRole('textbox', { name: 'Ime' }), 'x');
    await user.click(screen.getByRole('button', { name: 'Prekliči' }));
    await screen.findByRole('dialog', { name: 'Zavržem spremembe?' });
  });

  it('FR-004-05: zapiranje ali osvežitev zavihka z neshranjenimi spremembami sproži beforeunload', async () => {
    const { user } = await openNew();
    const unload = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(unload()).toBe(false);

    await user.type(screen.getByRole('textbox', { name: 'Ime' }), 'Janez');
    expect(unload()).toBe(true);
    await user.clear(screen.getByRole('textbox', { name: 'Ime' }));
    expect(unload()).toBe(false);
  });

  it('FR-004-05: sprememba in povrnitev na izvorno vrednost ni sprememba', async () => {
    const { user } = renderContactsApp(EDIT, {
      role: 'EDITOR',
      contacts: { get: () => ({ status: 200, body: contactDetail() }) },
    });
    await screen.findByRole('heading', { level: 2, name: 'Uredi kontakt' });
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Ime' })).toHaveValue('Janez'));
    await user.type(screen.getByRole('textbox', { name: 'Ime' }), 'x');
    await user.keyboard('{Backspace}');

    await user.click(screen.getByRole('button', { name: 'Prekliči' }));

    await waitFor(() => expect(currentLocation()).not.toBe(`${EDIT}`));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('FR-004-05: po uspešnem shranjevanju varovalo ne zahteva potrditve', async () => {
    const { user } = await openNew();
    await user.type(screen.getByRole('textbox', { name: 'Ime' }), 'Janez');

    await user.click(screen.getByRole('button', { name: 'Shrani kontakt' }));

    await waitFor(() => expect(currentLocation()).not.toBe(NEW));
    expect(screen.queryByRole('dialog', { name: 'Zavržem spremembe?' })).not.toBeInTheDocument();
  });

  it('FR-004-05: brez kršitev axe z odprtim dialogom (sl in en)', async () => {
    const { user } = await openNew();
    await user.type(screen.getByRole('textbox', { name: 'Ime' }), 'Janez');
    await user.click(screen.getByRole('button', { name: 'Prekliči' }));
    await screen.findByRole('dialog');
    expect((await axe(document.body)).violations).toEqual([]);

    await i18n.changeLanguage('en');
    expect(await screen.findByRole('dialog', { name: 'Discard changes?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep editing' })).toBeInTheDocument();
    expect((await axe(document.body)).violations).toEqual([]);
  });
});
