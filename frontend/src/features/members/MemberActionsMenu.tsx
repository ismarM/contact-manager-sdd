import { IconDotsVertical } from '@tabler/icons-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../shared/ui/dropdown-menu';
import { focusRing } from '../../shared/ui/styles';
import { ChangeRoleDialog } from './ChangeRoleDialog';
import { RemoveMemberDialog } from './RemoveMemberDialog';
import type { Member } from './types';

/**
 * Meni dejanj ob članu (design.md 8.6): *Spremeni vlogo* in *Odstrani iz skupine*. Dialoga sta izrisana ob meniju in
 * krmiljena od tu, zato ju zapiranje menija ne odstrani; fokus se ob preklicu vrne na sprožilec.
 */
export function MemberActionsMenu({
  member,
  onSucceeded,
  onStale,
}: {
  member: Member;
  onSucceeded: () => void;
  onStale: () => void;
}) {
  const { t } = useTranslation();
  const [dialog, setDialog] = useState<'role' | 'remove' | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const opening = useRef(false);
  const name = member.name ?? member.email;

  const close = () => setDialog(null);
  const returnFocus = () => trigger.current?.focus();

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
              setDialog('role');
            }}
          >
            {t('members.menu.changeRole')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              opening.current = true;
              setDialog('remove');
            }}
          >
            {t('members.menu.remove')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ChangeRoleDialog
        member={member}
        open={dialog === 'role'}
        onClose={close}
        onCancelled={returnFocus}
        onSucceeded={onSucceeded}
        onStale={onStale}
      />
      <RemoveMemberDialog
        member={member}
        open={dialog === 'remove'}
        onClose={close}
        onCancelled={returnFocus}
        onSucceeded={onSucceeded}
        onStale={onStale}
      />
    </>
  );
}
