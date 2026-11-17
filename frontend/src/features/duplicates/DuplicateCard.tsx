import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Avatar } from '../../shared/images/Avatar';
import { focusRing, primaryButton } from '../../shared/ui/styles';
import { useGroup } from '../groups/groupContext';
import { COMPARE_LIMIT } from './duplicateRouting';
import type { DuplicateContact, DuplicateGroup } from './types';

/**
 * Kartica skupine dvojnikov (FR-011-07, FR-011-21): razlog ujemanja, vsi kontakti (prvih 10 gre v primerjavo, preostali
 * so pod »Še N kontaktov«) in gumb »Primerjaj in združi«.
 */
export function DuplicateCard({
  group,
  onCompare,
}: {
  group: DuplicateGroup;
  onCompare: () => void;
}) {
  const { t } = useTranslation();
  const { group: current } = useGroup();
  const titleId = useId();
  const moreId = useId();
  const [expanded, setExpanded] = useState(false);
  const first = group.contacts.slice(0, COMPARE_LIMIT);
  const more = group.contacts.slice(COMPARE_LIMIT);
  const avatar = (contact: DuplicateContact) => (
    <Avatar
      kind="contact"
      name={contact.displayName}
      colorSeed={contact.id}
      size={24}
      alt=""
      photo={{
        path: `/groups/${current.id}/contacts/${contact.id}/photo`,
        revision: contact.photoRevision,
      }}
    />
  );

  return (
    <li
      aria-labelledby={titleId}
      className="flex flex-col items-start gap-3 rounded-lg border border-border bg-card p-4"
    >
      <h3 id={titleId} className="text-lg font-bold break-words">
        {t(`duplicates.reason.${group.reason.category}`, { value: group.reason.value })}
      </h3>
      {/* Pravi seznam: preostali kontakti imajo atribut `hidden`, dokler jih gumb »Še N kontaktov« ne razkrije. */}
      <ul id={moreId} aria-label={t('duplicates.contactsList')} className="flex flex-col gap-1">
        {first.map((contact) => (
          <li key={contact.id} className="flex items-center gap-2 break-words">
            {avatar(contact)}
            <span>{contact.displayName}</span>
          </li>
        ))}
        {more.map((contact) => (
          <li key={contact.id} hidden={!expanded} className="flex items-center gap-2 break-words">
            {avatar(contact)}
            <span>{contact.displayName}</span>
          </li>
        ))}
      </ul>
      {more.length > 0 && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={moreId}
          onClick={() => setExpanded(!expanded)}
          className={`min-h-11 rounded-md px-1 font-bold underline pointer-coarse:min-h-12 ${focusRing}`}
        >
          {t('duplicates.more', { count: more.length })}
        </button>
      )}
      <button type="button" className={primaryButton} onClick={onCompare}>
        {t('duplicates.compareAndMerge')}
      </button>
    </li>
  );
}
