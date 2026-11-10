import { IconAlertTriangle } from '@tabler/icons-react';
import { type FormEvent, useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '../../shared/ui/dialog';
import {
  dangerButton,
  errorAlert,
  fieldError,
  secondaryButton,
  textInput,
} from '../../shared/ui/styles';
import { useListLanguage } from '../groups/api';
import { useGroup } from '../groups/groupContext';
import { useGroups } from '../groups/groupsContext';
import { useMembersApi } from './api';
import { memberFailure } from './memberMessages';
import type { Member } from './types';

/**
 * Dialog *Prenesi lastništvo* (design.md 8.11, 13.4; FR-007-09): izbira enega od ostalih članov, posledica po izbiri,
 * potrditev z vpisom naslova skupine (kot pri izbrisu). Napaki ob polju ne pošljeta zahtevka. Po uspehu se skupina
 * osveži z novo vlogo klicatelja (admin).
 */
export function TransferOwnershipDialog({
  onOpenChange,
}: {
  onOpenChange?: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const api = useMembersApi();
  const lang = useListLanguage();
  const { group, setGroup, reload } = useGroup();
  const { refresh } = useGroups();
  const memberId = useId();
  const memberError = useId();
  const titleId = useId();
  const titleError = useId();
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<Member[]>([]);
  const [selected, setSelected] = useState('');
  const [typed, setTyped] = useState('');
  const [errors, setErrors] = useState<{ member: boolean; title: boolean }>({
    member: false,
    title: false,
  });
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  const done = useRef(false);

  const loadCandidates = useCallback(() => {
    api.list(group.id, { page: 0, size: 100, lang }).then(
      (result) => setCandidates(result.items.filter((member) => !member.self)),
      () => undefined,
    );
  }, [api, group.id, lang]);

  useEffect(() => {
    if (open) loadCandidates();
  }, [open, loadCandidates]);

  const changeOpen = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
    if (next) {
      done.current = false;
      setSelected('');
      setTyped('');
      setErrors({ member: false, title: false });
      setFailure(null);
    }
  };

  const chosen = candidates.find((member) => member.id === selected);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setFailure(null);
    const next = { member: !chosen, title: typed.trim() !== group.title };
    setErrors(next);
    if (next.member || next.title || !chosen) return;
    setBusy(true);
    try {
      const detail = await api.transferOwnership(group.id, chosen.id);
      done.current = true;
      setOpen(false);
      onOpenChange?.(false);
      setGroup(detail);
      toast(t('members.toast.transferred', { name: chosen.name ?? chosen.email }));
      refresh();
    } catch (error) {
      const result = memberFailure(error, 'transfer');
      setFailure(t(result.key));
      if (result.stale) {
        loadCandidates();
        void reload();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger className={secondaryButton}>{t('members.transfer.button')}</DialogTrigger>
      <DialogContent
        onInteractOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancel.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          if (done.current) event.preventDefault();
        }}
      >
        <DialogTitle>{t('members.transfer.title', { group: group.title })}</DialogTitle>
        {failure && (
          <div role="alert" className={errorAlert}>
            <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
            <span>{failure}</span>
          </div>
        )}
        <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor={memberId} className="font-bold">
              {t('members.transfer.newOwner')}
            </label>
            <select
              id={memberId}
              value={selected}
              aria-required="true"
              aria-invalid={errors.member}
              aria-describedby={errors.member ? memberError : undefined}
              onChange={(event) => setSelected(event.target.value)}
              className={`${textInput} h-11`}
            >
              <option value="">{t('members.transfer.choose')}</option>
              {candidates.map((member) => (
                <option key={member.id} value={member.id}>
                  {t('members.transfer.option', {
                    name: member.name ?? member.email,
                    role: t(`roles.${member.role}`),
                  })}
                </option>
              ))}
            </select>
            {errors.member && (
              <p id={memberError} className={fieldError}>
                {t('members.transfer.errors.memberRequired')}
              </p>
            )}
          </div>
          {chosen && (
            <p>{t('members.transfer.consequence', { name: chosen.name ?? chosen.email })}</p>
          )}
          <div className="flex flex-col gap-1">
            <label htmlFor={titleId} className="font-bold">
              {t('members.transfer.titleField')}
            </label>
            <input
              id={titleId}
              type="text"
              value={typed}
              autoComplete="off"
              aria-required="true"
              aria-invalid={errors.title}
              aria-describedby={errors.title ? titleError : undefined}
              onChange={(event) => setTyped(event.target.value)}
              className={textInput}
            />
            {errors.title && (
              <p id={titleError} className={fieldError}>
                {t('members.transfer.errors.titleMismatch')}
              </p>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <DialogClose ref={cancel} className={secondaryButton}>
              {t('members.transfer.cancel')}
            </DialogClose>
            <button type="submit" className={dangerButton} aria-disabled={busy}>
              {t('members.transfer.confirm')}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
