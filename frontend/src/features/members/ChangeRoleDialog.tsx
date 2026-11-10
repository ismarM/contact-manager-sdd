import { IconAlertTriangle } from '@tabler/icons-react';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { ApiError } from '../../shared/api/client';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '../../shared/ui/dialog';
import { dangerButton, errorAlert, fieldError, secondaryButton } from '../../shared/ui/styles';
import { fieldErrors } from '../groups/api';
import { useGroup } from '../groups/groupContext';
import type { Role } from '../groups/types';
import { useMembersApi } from './api';
import { MemberConflictAlert } from './MemberConflictAlert';
import { memberFailure } from './memberMessages';
import type { AssignableRole, Member } from './types';

interface Props {
  member: Member;
  open: boolean;
  onClose: () => void;
  onCancelled: () => void;
  onSucceeded: () => void;
  onStale: () => void;
}

const ASSIGNABLE: Record<string, AssignableRole[]> = {
  OWNER: ['ADMIN', 'EDITOR', 'VIEWER'],
  ADMIN: ['EDITOR', 'VIEWER'],
};

/**
 * Dialog *Spremeni vlogo* (design.md 8.11, 8.14, 13.4; FR-007-03, FR-007-04): izbira samo dovoljenih vlog (strogo nižjih
 * od klicateljeve, enako pravilo kot pri povabilih), trenutna vloga označena, fokus ob odprtju na *Prekliči*. Sočasna
 * sprememba (`409 VERSION_CONFLICT`) prikaže opozorilo z dvema izhodoma; nič se ne prepiše tiho.
 */
function ChangeRoleDialogBody({
  member,
  onClose,
  onCancelled,
  onSucceeded,
  onStale,
}: {
  member: Member;
  onClose: () => void;
  onCancelled: () => void;
  onSucceeded: () => void;
  onStale: () => void;
}) {
  const { t } = useTranslation();
  const api = useMembersApi();
  const { group, reload } = useGroup();
  const legend = useId();
  const unchangedId = useId();
  const radioName = useId();
  const [role, setRole] = useState<Role>(member.role);
  const [version, setVersion] = useState(member.version);
  const [conflict, setConflict] = useState<Member | null>(null);
  const [unchanged, setUnchanged] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  const done = useRef(false);
  const name = member.name ?? member.email;
  const options = ASSIGNABLE[group.role] ?? [];

  const submit = async (chosen: Role, expected: number) => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    setUnchanged(false);
    try {
      await api.changeRole(group.id, member.id, {
        role: chosen as AssignableRole,
        version: expected,
      });
      done.current = true;
      toast(t('members.toast.roleChanged', { name, role: t(`roles.${chosen}`) }));
      onClose();
      onSucceeded();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && error.code === 'VERSION_CONFLICT') {
        const current = (error.body as { current?: Member } | null)?.current;
        if (current) {
          setConflict(current);
          return;
        }
      }
      if (fieldErrors(error).some((e) => e.field === 'role' && e.code === 'UNCHANGED')) {
        setUnchanged(true);
        return;
      }
      const result = memberFailure(error, 'change');
      setFailure(t(result.key));
      if (result.stale) {
        onStale();
        void reload();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        onInteractOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancel.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (!done.current) onCancelled();
        }}
      >
        <DialogTitle>{t('members.changeRole.title', { name })}</DialogTitle>
        {conflict && (
          <MemberConflictAlert
            current={conflict}
            onUseCurrent={() => {
              setRole(conflict.role);
              setVersion(conflict.version);
              setConflict(null);
            }}
            onSaveMine={() => {
              if (conflict.role === role) {
                // E1: trenutna vloga je že enaka moji izbiri – brez ponovnega zahtevka.
                done.current = true;
                onClose();
                onSucceeded();
                return;
              }
              const expected = conflict.version;
              setVersion(expected);
              setConflict(null);
              void submit(role, expected);
            }}
          />
        )}
        {failure && (
          <div role="alert" className={errorAlert}>
            <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
            <span>{failure}</span>
          </div>
        )}
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void submit(role, version);
          }}
          className="flex flex-col gap-4"
        >
          <fieldset
            role="radiogroup"
            aria-labelledby={legend}
            aria-describedby={unchanged ? unchangedId : undefined}
            aria-invalid={unchanged ? true : undefined}
            className="flex flex-col gap-1"
          >
            <legend id={legend} className="mb-1 font-bold">
              {t('members.changeRole.role')}
            </legend>
            {options.map((option) => (
              <label
                key={option}
                className="flex min-h-11 items-center gap-2 pointer-coarse:min-h-12"
              >
                <input
                  type="radio"
                  name={radioName}
                  checked={role === option}
                  onChange={() => {
                    setRole(option);
                    setUnchanged(false);
                  }}
                />
                {t(`roles.${option}`)}
              </label>
            ))}
            {unchanged && (
              <p id={unchangedId} className={fieldError}>
                {t('members.changeRole.unchanged')}
              </p>
            )}
          </fieldset>
          <div className="flex flex-wrap justify-end gap-3">
            <DialogClose ref={cancel} className={secondaryButton}>
              {t('members.changeRole.cancel')}
            </DialogClose>
            <button type="submit" className={dangerButton} aria-disabled={busy}>
              {t('members.changeRole.confirm')}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Stanje dialoga živi samo, dokler je odprt: ob vsakem odprtju se začne znova z vrednostmi vrstice. */
export function ChangeRoleDialog({ open, ...props }: Props) {
  return open ? <ChangeRoleDialogBody {...props} /> : null;
}
