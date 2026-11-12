import { screen, waitFor, within } from '@testing-library/react';
import type { JsonBodyType } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { i18n } from '../../i18n';
import { deferred } from '../../test/contactsApi';
import {
  compareContact,
  compareReply,
  compareSet,
  compareTrio,
  duplicateGroup,
  duplicatesReply,
  forbidden,
  GROUP_ID,
  groupArchived,
  mergeConflict,
  mergeReply,
  mergeServerError,
  mergeValidation,
  renderDuplicatesApp,
} from '../../test/duplicatesApi';
import { groupDetail, type Reply } from '../../test/groupsApi';
import type { CompareContact, MergeRequest } from './types';

// Združevanje: odjemalska validacija, potrditev, pošiljanje in izidi (FR-011-13 … 18; specs/011-dvojniki/plan.md –
// Key elements, Sklanjanje).

const PAGE = `/groups/${GROUP_ID}/duplicates`;
const COMPARE = `${PAGE}/compare`;
const [A, B, C] = compareTrio();

type Handlers = NonNullable<Parameters<typeof renderDuplicatesApp>[1]>['duplicates'];
type Extra = Parameters<typeof renderDuplicatesApp>[1];

const REMAINING = duplicateGroup('email', 'ana@primer.si', [
  { n: 11, name: 'Ana Kos' },
  { n: 12, name: 'Ana Kos' },
]);

/** Kontakti, ki jih strežnik ob vsakem `compare` vrne glede na zahtevane `ids` (po vrstnem redu kontaktov). */
function compareFor(contacts: CompareContact[]) {
  return (ids: string[]) => compareReply(contacts.filter((contact) => ids.includes(contact.id)));
}

function app(
  contacts: CompareContact[],
  handlers: Handlers = {},
  extra: Extra = {},
  total = contacts.length,
) {
  const ids = contacts.map((contact) => contact.id).join(',');
  return renderDuplicatesApp(`${COMPARE}?category=email&page=1&size=25&ids=${ids}&total=${total}`, {
    role: 'EDITOR',
    ...extra,
    duplicates: {
      compare: compareFor(contacts),
      search: () => duplicatesReply([REMAINING]),
      ...handlers,
    },
  });
}

const mergeButton = () => screen.findByRole('button', { name: 'Združi kontakte' });
const row = async (name: string) => within(await screen.findByRole('group', { name }));

async function openDialog(view: ReturnType<typeof app>) {
  await view.user.click(await mergeButton());
  return within(await screen.findByRole('alertdialog'));
}

async function confirm(view: ReturnType<typeof app>, name: string) {
  const dialog = await openDialog(view);
  await view.user.click(dialog.getByRole('button', { name }));
}

/** Izloči kontakt s stolpcem z danim imenom. */
async function exclude(view: ReturnType<typeof app>, name: string) {
  await view.user.click(
    within(await screen.findByRole('group', { name })).getByRole('button', {
      name: 'Izloči iz združevanja',
    }),
  );
  await waitFor(() => expect(screen.queryByRole('group', { name })).toBeNull());
}

const body = (view: ReturnType<typeof app>, index = 0): MergeRequest => {
  const recorded = view.duplicatesApi.recordedBody()[index];
  if (!recorded) throw new Error(`zahtevek merge ${index} ni bil poslan`);
  return recorded;
};

/** Besedila vseh trenutnih obvestil `status`. */
const statusTexts = () => screen.queryAllByRole('status').map((element) => element.textContent);

/** Kontakta, kjer lahko izbereš (prazno) tako pri imenu kot pri priimku. */
const NAME_PAIR = [
  compareContact({ n: 1, version: 1, firstName: 'Janez', lastName: null }),
  compareContact({ n: 2, version: 2, firstName: null, lastName: 'Novak' }),
];

const tags = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => `znacka${String(from + i).padStart(2, '0')}`);

describe('MergeFlow', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-011-13: (prazno) pri »Ime« in »Priimek« – dialog se ne odpre, alert ob vrstici »Ime«, brez POST', async () => {
    const view = app(NAME_PAIR);
    await view.user.click((await row('Ime')).getByRole('radio', { name: '(prazno)' }));
    await view.user.click((await row('Priimek')).getByRole('radio', { name: '(prazno)' }));

    await view.user.click(await mergeButton());

    const alert = await (await row('Ime')).findByRole('alert');
    expect(alert).toHaveTextContent('Vsaj ime ali priimek mora biti izpolnjen.');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(view.duplicatesApi.recordedBody()).toHaveLength(0);
  });

  it('FR-011-13: unija 32 značk – alert »Kontakt ima lahko največ 30 značk – odkljukaj vsaj 2.«, brez dialoga in POST', async () => {
    const view = app([
      compareContact({ n: 1, version: 1, tags: tags(1, 16) }),
      compareContact({ n: 2, version: 2, tags: tags(17, 16) }),
    ]);

    await view.user.click(await mergeButton());

    const alert = await (await row('Značke')).findByRole('alert');
    expect(alert).toHaveTextContent('Kontakt ima lahko največ 30 značk – odkljukaj vsaj 2.');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(view.duplicatesApi.recordedBody()).toHaveLength(0);

    await view.user.click(
      within(screen.getByRole('group', { name: 'Značke' })).getByRole('checkbox', {
        name: 'znacka01',
      }),
    );
    await view.user.click(
      within(screen.getByRole('group', { name: 'Značke' })).getByRole('checkbox', {
        name: 'znacka02',
      }),
    );
    await view.user.click(screen.getByRole('button', { name: 'Združi kontakte' }));
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
  });

  it('FR-011-14: veljavno – alertdialog »Združim 3 kontakte?« z razlago, fokus na »Prekliči«, gumb »Združi 3 kontakte«', async () => {
    const view = app([A, B, C]);

    const dialog = await openDialog(view);

    expect(screen.getByRole('alertdialog', { name: 'Združim 3 kontakte?' })).toHaveTextContent(
      'Nastal bo en kontakt ‹Janez Novak›, ostala 2 bosta izbrisana. Združevanje bo zabeleženo v revizijski sledi.',
    );
    expect(dialog.getByRole('button', { name: 'Prekliči' })).toHaveFocus();
    expect(dialog.getByRole('button', { name: 'Združi 3 kontakte' })).toBeInTheDocument();
    expect(view.duplicatesApi.recordedBody()).toHaveLength(0);
  });

  it('FR-011-14: »Prekliči« zapre potrditev brez zahtevka, fokus nazaj na »Združi kontakte«', async () => {
    const view = app([A, B, C]);
    const dialog = await openDialog(view);

    await view.user.click(dialog.getByRole('button', { name: 'Prekliči' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Združi kontakte' })).toHaveFocus(),
    );
    expect(view.duplicatesApi.recordedBody()).toHaveLength(0);
  });

  it('FR-011-14: Esc zapre potrditev brez zahtevka, fokus nazaj na »Združi kontakte«', async () => {
    const view = app([A, B, C]);
    await openDialog(view);

    await view.user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Združi kontakte' })).toHaveFocus(),
    );
    expect(view.duplicatesApi.recordedBody()).toHaveLength(0);
  });

  it.each([
    [2, 'Združim 2 kontakta?', 'ostal 1 bo izbrisan.', 'Združi 2 kontakta'],
    [4, 'Združim 4 kontakte?', 'ostali 3 bodo izbrisani.', 'Združi 4 kontakte'],
    [6, 'Združim 6 kontaktov?', 'ostalih 5 bo izbrisanih.', 'Združi 6 kontaktov'],
  ])(
    'FR-011-14: %i kontaktov – »%s«, besedilo »… %s«, gumb »%s« (sklanjatve)',
    async (count, title, consequence, button) => {
      const view = app(compareSet(count));

      const dialog = await openDialog(view);

      expect(screen.getByRole('alertdialog', { name: title })).toHaveTextContent(
        `Nastal bo en kontakt ‹Ime1 Novak›, ${consequence} Združevanje bo zabeleženo v revizijski sledi.`,
      );
      expect(dialog.getByRole('button', { name: button })).toBeInTheDocument();
    },
  );

  it('FR-011-15: potrditev pošlje POST merge z contacts [{id, version}] in result točno po privzetih izbirah', async () => {
    const view = app([A, B, C], { merge: () => mergeReply({ mergedCount: 3 }) });

    await confirm(view, 'Združi 3 kontakte');

    await waitFor(() => expect(view.duplicatesApi.recordedBody()).toHaveLength(1));
    const sent = body(view);
    expect(sent.contacts).toEqual([
      { id: A.id, version: 3 },
      { id: B.id, version: 5 },
      { id: C.id, version: 7 },
    ]);
    expect(sent.result).toEqual({
      firstName: 'Janez',
      lastName: 'Novak',
      address: 'Cesta 1',
      email: 'janez@primer.si',
      phone: '041 111 222',
      attributes: [{ key: 'Kompetenca', value: 'web dev' }],
      tags: expect.arrayContaining(['vip', 'konferenca2025', 'alumni']) as string[],
    });
    expect(sent.result.tags).toHaveLength(3);
    expect(view.duplicatesApi.requests.filter((r) => r.method === 'POST')[0]?.path).toBe(
      `/api/groups/${GROUP_ID}/duplicates/merge`,
    );
  });

  it('FR-011-15: po izločitvi C in spremembi izbir telo vsebuje samo A in B ter izbrane vrednosti', async () => {
    const view = app([A, B, C], { merge: () => mergeReply({ mergedCount: 2 }) });
    await exclude(view, 'Janko Novak');
    await view.user.click((await row('Telefon')).getByRole('radio', { name: '(prazno)' }));
    await view.user.click((await row('Kompetenca')).getByRole('radio', { name: 'java' }));
    await view.user.click((await row('Značke')).getByRole('checkbox', { name: 'alumni' }));

    await confirm(view, 'Združi 2 kontakta');

    await waitFor(() => expect(view.duplicatesApi.recordedBody()).toHaveLength(1));
    const sent = body(view);
    expect(sent.contacts).toEqual([
      { id: A.id, version: 3 },
      { id: B.id, version: 5 },
    ]);
    expect(sent.result).toEqual({
      firstName: 'Janez',
      lastName: 'Novak',
      address: 'Cesta 1',
      email: 'janez@primer.si',
      phone: null,
      attributes: [{ key: 'kompetenca', value: 'java' }],
      tags: expect.arrayContaining(['vip', 'konferenca2025']) as string[],
    });
    expect(sent.result.tags).toHaveLength(2);
  });

  it('FR-011-18: uspeh – toast »Združenih kontaktov: 3. Ostal je kontakt Janez Novak.« s povezavo na sled, navigacija na rezultate brez te skupine', async () => {
    const view = app([A, B, C], {
      merge: () => mergeReply({ keptDisplayName: 'Janez Novak', mergedCount: 3 }),
    });

    await confirm(view, 'Združi 3 kontakte');

    await waitFor(() => expect(window.location.pathname).toBe(PAGE));
    const params = new URLSearchParams(window.location.search);
    expect(params.get('category')).toBe('email');
    expect(params.get('page')).toBe('1');
    expect(params.get('size')).toBe('25');
    const notices = await screen.findByRole('region', { name: 'Obvestila' });
    await waitFor(() =>
      expect(notices).toHaveTextContent('Združenih kontaktov: 3. Ostal je kontakt Janez Novak.'),
    );
    expect(within(notices).getByRole('link', { name: 'Odpri revizijsko sled' })).toHaveAttribute(
      'href',
      `/groups/${GROUP_ID}/audit`,
    );
    const list = await screen.findByRole('list', { name: 'Skupine dvojnikov' });
    expect(within(list).getAllByRole('listitem', { name: /^Enak e-naslov/ })).toHaveLength(1);
    expect(
      within(list).queryByRole('listitem', { name: 'Enak e-naslov: janez@primer.si' }),
    ).not.toBeInTheDocument();
  });

  it('FR-011-15: med pošiljanjem je gumb aria-disabled z »Združujem…« in drugi klik ne pošlje drugega zahtevka', async () => {
    const reply = deferred<Reply>();
    const view = app([A, B, C], { merge: () => reply.promise });
    const dialog = await openDialog(view);

    await view.user.click(dialog.getByRole('button', { name: 'Združi 3 kontakte' }));

    const busy = await dialog.findByRole('button', { name: 'Združujem…' });
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    await view.user.click(busy);
    expect(view.duplicatesApi.recordedBody()).toHaveLength(1);

    reply.resolve(mergeReply({ mergedCount: 3 }));
    await waitFor(() => expect(window.location.pathname).toBe(PAGE));
    expect(view.duplicatesApi.recordedBody()).toHaveLength(1);
  });

  it('FR-011-16: 409 VERSION_CONFLICT – ponoven GET compare s preostalimi ids, izbire na privzete, izločitve ohranjene, alert o konfliktu', async () => {
    let merges = 0;
    const refreshedA = { ...A, version: 4 };
    let compares = 0;
    const view = app([A, B, C], {
      compare: (ids) => {
        compares += 1;
        return compareReply(
          [compares === 1 ? A : refreshedA, B, C].filter((contact) => ids.includes(contact.id)),
        );
      },
      merge: () => {
        merges += 1;
        return merges === 1 ? mergeConflict() : mergeReply({ mergedCount: 2 });
      },
    });
    await exclude(view, 'Janko Novak');
    await view.user.click((await row('Telefon')).getByRole('radio', { name: '(prazno)' }));

    await confirm(view, 'Združi 2 kontakta');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Kontakti so se medtem spremenili. Primerjava je osvežena – preglej izbire in znova združi.',
    );
    await waitFor(() => expect(view.duplicatesApi.gets('compare')).toHaveLength(2));
    expect(view.duplicatesApi.gets('compare')[1]?.search.get('ids')?.split(',')).toEqual([
      A.id,
      B.id,
    ]);
    expect(screen.queryByRole('group', { name: 'Janko Novak' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Janez Novak' })).toBeInTheDocument();
    expect(
      within(await screen.findByRole('group', { name: 'Telefon' })).getByRole('radio', {
        name: '041 111 222',
      }),
    ).toBeChecked();

    await confirm(view, 'Združi 2 kontakta');
    await waitFor(() => expect(view.duplicatesApi.recordedBody()).toHaveLength(2));
    expect(body(view, 1).contacts).toEqual([
      { id: A.id, version: 4 },
      { id: B.id, version: 5 },
    ]);
  });

  it('FR-011-16: kontakt medtem izbrisan – po 409 se primerjava naloži z dvema kontaktoma, ids v naslovu in dialog odražata dva, izbire na privzete', async () => {
    let merges = 0;
    let compares = 0;
    const refreshedB = { ...B, version: 9 };
    const view = app([A, B, C], {
      compare: (ids) => {
        compares += 1;
        return compareReply(
          (compares === 1 ? [A, B, C] : [A, refreshedB]).filter((contact) =>
            ids.includes(contact.id),
          ),
        );
      },
      merge: () => {
        merges += 1;
        return merges === 1 ? mergeConflict() : mergeReply({ mergedCount: 2 });
      },
    });
    await view.user.click((await row('Telefon')).getByRole('radio', { name: '(prazno)' }));

    await confirm(view, 'Združi 3 kontakte');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Kontakti so se medtem spremenili. Primerjava je osvežena – preglej izbire in znova združi.',
    );
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Janko Novak' })).toBeNull());
    expect(screen.getByRole('group', { name: 'Janez Novak' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Jan Novak' })).toBeInTheDocument();
    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get('ids')?.split(',')).toEqual([
        A.id,
        B.id,
      ]),
    );
    expect(
      within(await screen.findByRole('group', { name: 'Telefon' })).getByRole('radio', {
        name: '041 111 222',
      }),
    ).toBeChecked();

    const dialog = await openDialog(view);
    expect(dialog.getByRole('button', { name: 'Združi 2 kontakta' })).toBeInTheDocument();
    await view.user.click(dialog.getByRole('button', { name: 'Združi 2 kontakta' }));
    await waitFor(() => expect(view.duplicatesApi.recordedBody()).toHaveLength(2));
    expect(body(view, 1).contacts).toEqual([
      { id: A.id, version: A.version },
      { id: B.id, version: 9 },
    ]);
  });

  it('FR-011-16: po konfliktu in ponovnem compare z manj kot 2 kontakti – rezultati z »Te skupine dvojnikov ni več.«', async () => {
    let compares = 0;
    const view = app([A, B, C], {
      compare: () => {
        compares += 1;
        return compares === 1 ? compareReply([A, B, C]) : compareReply([A]);
      },
      merge: () => mergeConflict(),
    });

    await confirm(view, 'Združi 3 kontakte');

    await waitFor(() => expect(window.location.pathname).toBe(PAGE));
    await waitFor(() => expect(statusTexts()).toContain('Te skupine dvojnikov ni več.'));
  });

  it('FR-011-13: strežniški 400 result.firstName – napaka »Vsaj ime ali priimek …« ob vrstici »Ime«', async () => {
    const view = app([A, B, C], {
      merge: () => mergeValidation({ field: 'result.firstName', code: 'REQUIRED' }),
    });

    await confirm(view, 'Združi 3 kontakte');

    expect(await (await row('Ime')).findByRole('alert')).toHaveTextContent(
      'Vsaj ime ali priimek mora biti izpolnjen.',
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('FR-011-13: strežniški 400 result.tags – napaka o največ 30 značkah ob vrstici »Značke«', async () => {
    const view = app([A, B, C], {
      merge: () => mergeValidation({ field: 'result.tags', code: 'TOO_MANY' }),
    });

    await confirm(view, 'Združi 3 kontakte');

    expect(await (await row('Značke')).findByRole('alert')).toHaveTextContent(/največ 30 značk/);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('FR-011-13: 51 dodatnih atributov – alert »… največ 50 dodatnih atributov – izberi »(prazno)« pri vsaj 1.«, brez dialoga in POST', async () => {
    const attrs = (from: number, count: number) =>
      Array.from({ length: count }, (_, i) => ({
        key: `atribut${String(from + i).padStart(2, '0')}`,
        value: 'vrednost',
      }));
    const view = app([
      compareContact({ n: 1, version: 1, attributes: attrs(1, 26) }),
      compareContact({ n: 2, version: 2, attributes: attrs(27, 25) }),
    ]);

    await view.user.click(await mergeButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Kontakt ima lahko največ 50 dodatnih atributov – izberi »(prazno)« pri vsaj 1.',
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(view.duplicatesApi.recordedBody()).toHaveLength(0);
  });

  it('FR-011-13: strežniški 400 result.attributes TOO_MANY – prikazana je napaka o največ 50 dodatnih atributih', async () => {
    const view = app([A, B, C], {
      merge: () => mergeValidation({ field: 'result.attributes', code: 'TOO_MANY' }),
    });

    await confirm(view, 'Združi 3 kontakte');

    expect(await screen.findByRole('alert')).toHaveTextContent(/največ 50 dodatnih atributov/);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('FR-011-18: 5xx – alert »Kontaktov ni bilo mogoče združiti. Poskusi znova.«, izbire ostanejo, »Poskusi znova« pošlje isto telo', async () => {
    let merges = 0;
    const view = app([A, B, C], {
      merge: () => {
        merges += 1;
        return merges === 1 ? mergeServerError() : mergeReply({ mergedCount: 3 });
      },
    });
    await view.user.click((await row('Telefon')).getByRole('radio', { name: '041 333 444' }));
    await confirm(view, 'Združi 3 kontakte');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Kontaktov ni bilo mogoče združiti. Poskusi znova.',
    );
    expect(window.location.pathname).toBe(COMPARE);
    await view.user.click(screen.getByRole('button', { name: 'Poskusi znova' }));

    await waitFor(() => expect(view.duplicatesApi.recordedBody()).toHaveLength(2));
    expect(body(view, 1)).toEqual(body(view, 0));
    expect(body(view, 0).result.phone).toBe('041 333 444');
  });

  it('FR-011-18: brez povezave – alert z gumbom »Poskusi znova«, izbire ostanejo', async () => {
    const view = app([A, B, C], { merge: () => 'network-error' });
    await view.user.click((await row('Telefon')).getByRole('radio', { name: '041 333 444' }));
    await confirm(view, 'Združi 3 kontakte');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(
      /Kontaktov ni bilo mogoče združiti\. Poskusi znova\.|Strežnik ni dosegljiv\. Poskusi znova\./,
    );
    expect(screen.getByRole('button', { name: 'Poskusi znova' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Telefon' })).getByRole('radio', {
        name: '041 333 444',
      }),
    ).toBeChecked();
    expect(window.location.pathname).toBe(COMPARE);
  });

  it('FR-011-19: 403 – sporočilo »Za to dejanje nimaš več pravic.«, zavihek »Dvojniki« in akcija »Združi kontakte« skrita', async () => {
    let role: 'EDITOR' | 'VIEWER' = 'EDITOR';
    const view = app(
      [A, B, C],
      {
        merge: () => {
          role = 'VIEWER';
          return forbidden();
        },
      },
      {
        groups: {
          get: (id) => ({
            status: 200,
            body: groupDetail({ id, role }) as unknown as JsonBodyType,
          }),
        },
      },
    );

    await confirm(view, 'Združi 3 kontakte');

    expect(await screen.findByRole('alert')).toHaveTextContent('Za to dejanje nimaš več pravic.');
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Dvojniki' })).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: 'Združi kontakte' })).not.toBeInTheDocument();
  });

  it('FR-011-19: 409 GROUP_ARCHIVED – sporočilo »Skupina je arhivirana. Spreminjanje ni mogoče.«, skupina osvežena, akcije skrite', async () => {
    let archived = false;
    const view = app(
      [A, B, C],
      {
        merge: () => {
          archived = true;
          return groupArchived();
        },
      },
      {
        groups: {
          get: (id) => ({
            status: 200,
            body: groupDetail({ id, role: 'EDITOR', archived }) as unknown as JsonBodyType,
          }),
        },
      },
    );

    await confirm(view, 'Združi 3 kontakte');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Skupina je arhivirana. Spreminjanje ni mogoče.',
    );
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Dvojniki' })).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: 'Združi kontakte' })).not.toBeInTheDocument();
  });

  it('FR-011-14: združevanje v angleščini – potrditev, uspeh, napaka', async () => {
    await i18n.changeLanguage('en');
    const view = app([A, B, C], { merge: () => mergeReply({ mergedCount: 3 }) });
    await view.user.click(await screen.findByRole('button', { name: 'Merge contacts' }));

    const dialog = await screen.findByRole('alertdialog', { name: 'Merge 3 contacts?' });
    expect(dialog).toHaveTextContent(
      'One contact ‹Janez Novak› will remain and the other 2 will be deleted. The merge will be recorded in the audit trail.',
    );
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await view.user.click(within(dialog).getByRole('button', { name: 'Merge 3 contacts' }));

    await waitFor(() => expect(window.location.pathname).toBe(PAGE));
    const notices = await screen.findByRole('region', { name: 'Notifications' });
    await waitFor(() =>
      expect(notices).toHaveTextContent('Merged contacts: 3. Contact Janez Novak was kept.'),
    );
    expect(within(notices).getByRole('link', { name: 'Open the audit trail' })).toBeInTheDocument();
  });

  it('FR-011-18: napaka združevanja v angleščini – »The contacts could not be merged. Try again.« in »Try again«', async () => {
    await i18n.changeLanguage('en');
    const view = app([A, B, C], { merge: () => mergeServerError() });
    await view.user.click(await screen.findByRole('button', { name: 'Merge contacts' }));
    await view.user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Merge 3 contacts',
      }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The contacts could not be merged. Try again.',
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
