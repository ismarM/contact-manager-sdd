import { IconDotsVertical } from '@tabler/icons-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../shared/ui/dropdown-menu';
import { focusRing } from '../../shared/ui/styles';
import type { Member } from './types';

export type MemberDialogKind = 'role' | 'remove';

/**
 * Meni dejanj ob članu (design.md 8.6): *Spremeni vlogo* in *Odstrani iz skupine*. Dialoga izrisuje razdelek *Člani*
 * (ne vrstica), zato ju osvežitev seznama ne odstrani, ko član izgine ali izgubi meni (404/403); meni sporoči izbrano
 * dejanje in sprožilec, na katerega se ob preklicu vrne fokus.
 */
export function MemberActionsMenu({
  member,
  onAction,
}: {
  member: Member;
  onAction: (kind: MemberDialogKind, member: Member, trigger: HTMLElement | null) => void;
}) {
  const { t } = useTranslation();
  const trigger = useRef<HTMLButtonElement>(null);
  const opening = useRef(false);
  const name = member.name ?? member.email;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          ref={trigger}
          aria-label={t('members.menu.trigger', { name })}
          className={`inline-flex size-11 items-center justify-center rounded-md hover:bg-muted pointer-coarse:size-12 ${focusRing}`}
        >
          <IconDotsVertical aria-hidden="true" size={20} stroke={1.75} />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          onCloseAutoFocus={(event) => {
            if (opening.current) {
              event.preventDefault();
              opening.current = false;
            }
          }}
        >
          <DropdownMenuItem
            onSelect={() => {
              opening.current = true;
              onAction('role', member, trigger.current);
            }}
          >
            {t('members.menu.changeRole')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              opening.current = true;
              onAction('remove', member, trigger.current);
            }}
          >
            {t('members.menu.remove')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
