import { beforeEach, describe, expect, it } from 'vitest';

import { i18n } from '../../i18n';
import { conflictMessage } from './conflictMessage';

// Besedilo opozorila o konfliktu verzij (FR-002-12; design.md 8.14, plan.md – Key elements).

const changedAt = new Date(2026, 10, 5, 14, 32);
const sameDay = new Date(2026, 10, 5, 18, 0);
const nextDay = new Date(2026, 10, 6, 9, 0);
const bojan = { name: 'Bojan Kos', email: 'bojan@primer.si' };

const time = (language: 'sl' | 'en', date: Date) =>
  new Intl.DateTimeFormat(language, { hour: 'numeric', minute: '2-digit' }).format(date);
const day = (language: 'sl' | 'en', date: Date) =>
  new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(date);

describe('conflictMessage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-002-12: ista koledarska dan – ime in ura v slovenščini', () => {
    expect(conflictMessage(bojan, changedAt.toISOString(), 'sl', sameDay)).toBe(
      `Skupino je medtem spremenil(a) Bojan Kos ob ${time('sl', changedAt)}.`,
    );
  });

  it('FR-002-12: ista koledarska dan – ime in ura v angleščini', () => {
    expect(conflictMessage(bojan, changedAt.toISOString(), 'en', sameDay)).toBe(
      `The group was changed in the meantime by Bojan Kos at ${time('en', changedAt)}.`,
    );
  });

  it('FR-002-12: sprememba ni bila danes – pred uro je še datum', () => {
    const message = conflictMessage(bojan, changedAt.toISOString(), 'sl', nextDay);

    expect(message).toContain(day('sl', changedAt));
    expect(message).toContain(time('sl', changedAt));
    expect(message.indexOf(day('sl', changedAt))).toBeLessThan(
      message.lastIndexOf(time('sl', changedAt)),
    );
    expect(message.startsWith('Skupino je medtem spremenil(a) Bojan Kos ob ')).toBe(true);
  });

  it('FR-002-12: izvajalec brez imena je prikazan z e-naslovom', () => {
    expect(
      conflictMessage(
        { name: null, email: 'bojan@primer.si' },
        changedAt.toISOString(),
        'sl',
        sameDay,
      ),
    ).toBe(`Skupino je medtem spremenil(a) bojan@primer.si ob ${time('sl', changedAt)}.`);
  });

  it('FR-002-12: izvajalec, ki je izbrisal račun, je »izbrisan uporabnik« / "deleted user"', () => {
    expect(conflictMessage(null, changedAt.toISOString(), 'sl', sameDay)).toBe(
      `Skupino je medtem spremenil(a) izbrisan uporabnik ob ${time('sl', changedAt)}.`,
    );
    expect(conflictMessage(null, changedAt.toISOString(), 'en', sameDay)).toBe(
      `The group was changed in the meantime by deleted user at ${time('en', changedAt)}.`,
    );
  });
});
