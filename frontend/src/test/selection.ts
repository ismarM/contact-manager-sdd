import { screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { expect } from 'vitest';

import { contactSummary, GROUP_ID } from './contactsApi';

// Pomočniki za teste izbora in množičnega urejanja (009): imena elementov so iz plan.md (Key elements and accessible
// names); iskanje samo po vlogah in imenih.

export const LIST = `/groups/${GROUP_ID}/contacts`;
export const TABLE = 'Kontakti skupine Projekt FERI';

/** Prikazno ime n-tega kontakta iz `contactSummaries` (»Ime001 Priimek001«). */
export function displayName(n: number): string {
  const num = n.toString().padStart(3, '0');
  return `Ime${num} Priimek${num}`;
}

/** Janez Novak kot prvi kontakt seznama (scenarij US1-1). */
export const JANEZ = contactSummary(1, {
  firstName: 'Janez',
  lastName: 'Novak',
  displayName: 'Janez Novak',
});

/** Potrditveno polje vrstice (»Izberi ‹ime›«). */
export const rowBox = (name: string) => screen.getByRole('checkbox', { name: `Izberi ${name}` });

/** Vsa potrditvena polja vrstic seznama (brez glave). */
export const rowBoxes = () =>
  screen.getAllByRole('checkbox', { name: /^Izberi (?!vse na strani)/ });

/** Potrditveno polje glave stolpca. */
export const headerBox = () => screen.getByRole('checkbox', { name: 'Izberi vse na strani' });

/** Akcijska vrstica izbora (počaka, da se pojavi). */
export async function actionBar() {
  return within(await screen.findByRole('toolbar', { name: 'Dejanja izbora' }));
}

export const noActionBar = () =>
  expect(screen.queryByRole('toolbar', { name: 'Dejanja izbora' })).not.toBeInTheDocument();

/** Označi kontakte po prikaznih imenih. */
export async function pick(user: UserEvent, ...names: string[]) {
  for (const name of names) {
    await user.click(await screen.findByRole('checkbox', { name: `Izberi ${name}` }));
  }
}

/** Seznam kontaktov je izrisan (preglednica z vrsticami). */
export async function listReady() {
  await screen.findByRole('table', { name: TABLE });
  await screen.findAllByRole('checkbox', { name: /^Izberi (?!vse na strani)/ });
}

/** Počaka, da akcijska vrstica pokaže dano število izbranih (npr. »Izbranih: 5«). */
export async function expectCount(text: string | RegExp) {
  await waitFor(() =>
    expect(
      within(screen.getByRole('toolbar', { name: 'Dejanja izbora' })).getByRole('status'),
    ).toHaveTextContent(text),
  );
}
