import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { secondaryButton } from '../../shared/ui/styles';
import type { CompareContact } from './types';

export const contactName = (contact: Pick<CompareContact, 'firstName' | 'lastName'>) =>
  [contact.firstName, contact.lastName].filter((part) => part).join(' ');

/** Mreža z enakim številom stolpcev kot kontaktov (≥ 640 px; pod tem eno pod drugo). Razredi so celotni nizi za Tailwind. */
const COLUMNS: Record<number, string> = {
  2: 'sm:grid-cols-[repeat(2,minmax(11rem,1fr))]',
  3: 'sm:grid-cols-[repeat(3,minmax(11rem,1fr))]',
  4: 'sm:grid-cols-[repeat(4,minmax(11rem,1fr))]',
  5: 'sm:grid-cols-[repeat(5,minmax(11rem,1fr))]',
  6: 'sm:grid-cols-[repeat(6,minmax(11rem,1fr))]',
  7: 'sm:grid-cols-[repeat(7,minmax(11rem,1fr))]',
  8: 'sm:grid-cols-[repeat(8,minmax(11rem,1fr))]',
  9: 'sm:grid-cols-[repeat(9,minmax(11rem,1fr))]',
  10: 'sm:grid-cols-[repeat(10,minmax(11rem,1fr))]',
};

/** Razred mreže za `count` kontaktov. */
export const gridFor = (count: number) => `grid gap-3 ${COLUMNS[count] ?? COLUMNS[10]}`;

/** Začetni stolpec celice (1-osno) od 640 px. */
const START: Record<number, string> = {
  1: 'sm:col-start-1',
  2: 'sm:col-start-2',
  3: 'sm:col-start-3',
  4: 'sm:col-start-4',
  5: 'sm:col-start-5',
  6: 'sm:col-start-6',
  7: 'sm:col-start-7',
  8: 'sm:col-start-8',
  9: 'sm:col-start-9',
  10: 'sm:col-start-10',
};
export const startAt = (column: number) => START[column] ?? '';

/**
 * Glave stolpcev (FR-011-08, FR-011-11): `group` z imenom kontakta, oznaka »Ostane« pri prvem in »Izloči iz
 * združevanja« (pri dveh kontaktih namesto gumba razlaga). Ena zgradba za vse širine.
 */
export function CompareColumns({
  contacts,
  canExclude,
  onExclude,
}: {
  contacts: CompareContact[];
  canExclude: boolean;
  onExclude: (id: string) => void;
}) {
  const { t } = useTranslation();
  const prefix = useId();

  return (
    <div className="flex flex-col gap-3">
      {!canExclude && <p role="note">{t('duplicates.compare.minTwo')}</p>}
      <div className={gridFor(contacts.length)}>
        {contacts.map((contact, index) => {
          const nameId = `${prefix}-${contact.id}`;
          return (
            <div
              key={contact.id}
              role="group"
              aria-labelledby={nameId}
              className="flex min-w-0 flex-col items-start gap-2 rounded-md border border-border bg-card p-3"
            >
              <span id={nameId} className="font-bold break-words">
                {contactName(contact)}
              </span>
              {index === 0 && (
                <span className="rounded-md bg-selected px-2 py-0.5 text-sm font-bold">
                  {t('duplicates.compare.kept')}
                </span>
              )}
              {canExclude && (
                <button
                  type="button"
                  className={`${secondaryButton} h-auto min-h-11 w-full py-2`}
                  onClick={() => onExclude(contact.id)}
                >
                  {t('duplicates.compare.exclude')}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
