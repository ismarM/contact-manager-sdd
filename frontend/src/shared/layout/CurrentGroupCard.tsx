import { IconSelector } from '@tabler/icons-react';
import { useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useMatch } from 'react-router';

import { useCurrentGroup } from '../../features/groups/currentGroup';
import { useGroups } from '../../features/groups/groupsContext';
import { Monogram } from '../ui/Monogram';
import { focusRing } from '../ui/styles';
import { GroupSwitcher } from './GroupSwitcher';

/**
 * Kartica *Trenutna skupina* (design.md 7.1; FR-020-05, -06): monogram ali slika, naziv (elipsa; polno ime bere
 * bralnik), vloga in ikona izbirnika; odpre preklopnik. Prikaže se samo znotraj skupine.
 */
export function CurrentGroupCard() {
  const { t } = useTranslation();
  const { groups } = useGroups();
  const { current } = useCurrentGroup();
  const id = useMatch('/groups/:groupId/*')?.params.groupId;
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  if (!id || id === 'archived') return null;
  const group = current?.id === id ? current : groups.find((item) => item.id === id);
  if (!group) return null;

  // Vidno besedilo kartice je zunaj gumba, gumb (ime »Preklopi skupino«) pa prekrije celo kartico: ime gumba se ne
  // razlikuje od vidnega besedila v njem (WCAG 2.5.3, axe label-content-name-mismatch); meni se poravna na kartico.
  return (
    <div className="relative flex w-full items-center gap-3 rounded-md border border-border bg-card p-3 text-left hover:shadow-sm">
      <Monogram
        title={group.title}
        color={group.color}
        size={32}
        photo={{ path: `/groups/${group.id}/photo`, revision: group.photoRevision }}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-xs text-muted-foreground">{t('groups.currentGroup')}</span>
        <span id={titleId} title={group.title} className="truncate font-bold text-foreground">
          {group.title}
        </span>
        <span className="text-xs text-muted-foreground">{t(`roles.${group.role}`)}</span>
      </span>
      <IconSelector
        aria-hidden="true"
        size={20}
        stroke={1.75}
        className="shrink-0 text-muted-foreground"
      />
      <GroupSwitcher triggerRef={trigger}>
        <button
          ref={trigger}
          type="button"
          aria-label={t('groups.switchGroup')}
          aria-describedby={titleId}
          className={`absolute inset-0 cursor-pointer rounded-md ${focusRing}`}
        />
      </GroupSwitcher>
    </div>
  );
}
