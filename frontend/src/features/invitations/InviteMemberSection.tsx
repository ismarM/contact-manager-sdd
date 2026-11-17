import { IconMail, IconUserPlus } from '@tabler/icons-react';
import { type FormEvent, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { ApiError } from '../../shared/api/client';
import { Callout } from '../../shared/ui/Callout';
import { card, fieldError, focusRing, softButton, textInput } from '../../shared/ui/styles';
import { fieldErrors } from '../groups/api';
import { useGroup } from '../groups/groupContext';
import { ROLES } from '../groups/types';
import { useInvitationsApi } from './api';
import { classify } from './errors';
import type { OfferedRole } from './types';

const EMAIL_MAX = 254;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type EmailError = 'emailRequired' | 'emailInvalid' | 'emailTooLong';
type ServerEmailError = EmailError | 'notRegistered' | 'alreadyMember' | 'alreadyPending' | 'self';

interface Errors {
  email?: ServerEmailError;
  role?: 'roleRequired';
}

function validate(email: string, role: OfferedRole | null): Errors {
  const errors: Errors = {};
  const trimmed = email.trim();
  if (trimmed === '') errors.email = 'emailRequired';
  else if ([...trimmed].length > EMAIL_MAX) errors.email = 'emailTooLong';
  else if (!EMAIL.test(trimmed)) errors.email = 'emailInvalid';
  if (role === null) errors.role = 'roleRequired';
  return errors;
}

const SERVER_EMAIL: Record<string, ServerEmailError> = {
  INVITEE_NOT_REGISTERED: 'notRegistered',
  ALREADY_MEMBER: 'alreadyMember',
  INVITATION_ALREADY_PENDING: 'alreadyPending',
  CANNOT_INVITE_SELF: 'self',
};

/**
 * Razdelek *Povabi člana* v *Nastavitvah* (design.md 9.7; FR-006-01 … FR-006-04): e-naslov in izbira vloge, strogo nižje
 * od vloge pošiljatelja (lastnik: Admin, Urednik, Bralec; admin: Urednik, Bralec). Razlogi zavrnitve so ob polju;
 * po uspehu se obrazec izprazni in fokus ostane na e-naslovu.
 */
export function InviteMemberSection({ onSent }: { onSent?: () => void }) {
  const { t } = useTranslation();
  const api = useInvitationsApi();
  const { group, reload, markNotFound } = useGroup();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OfferedRole | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const headingId = useId();
  const emailId = useId();
  const emailError = useId();
  const roleLegend = useId();
  const roleError = useId();
  const roleName = useId();

  // ROLES je urejen OWNER … VIEWER: vloge z večjim indeksom so strogo nižje od vloge pošiljatelja (lastnika ni mogoče ponuditi).
  const offered = ROLES.filter(
    (candidate): candidate is OfferedRole =>
      candidate !== 'OWNER' && ROLES.indexOf(candidate) > ROLES.indexOf(group.role),
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const local = validate(email, role);
    setErrors(local);
    setAlert(null);
    if (local.email || local.role || role === null) return;
    setBusy(true);
    try {
      await api.send(group.id, { email: email.trim(), role });
      toast(t('invitations.toast.sent'));
      setEmail('');
      setRole(null);
      setErrors({});
      input.current?.focus();
      onSent?.();
    } catch (error) {
      handleFailure(error);
    } finally {
      setBusy(false);
    }
  };

  const handleFailure = (error: unknown) => {
    if (error instanceof ApiError && error.status === 409 && SERVER_EMAIL[error.code]) {
      setErrors({ email: SERVER_EMAIL[error.code] });
      return;
    }
    const fields = fieldErrors(error);
    if (fields.length > 0) {
      const next: Errors = {};
      for (const { field, code } of fields) {
        if (field === 'email') {
          next.email =
            code === 'REQUIRED'
              ? 'emailRequired'
              : code === 'TOO_LONG'
                ? 'emailTooLong'
                : 'emailInvalid';
        } else if (field === 'role') next.role = 'roleRequired';
      }
      setErrors(next);
      return;
    }
    const kind = classify(error);
    if (kind === 'unavailable') {
      markNotFound();
    } else if (kind === 'archived') {
      setAlert(t('invitations.invite.alerts.archived'));
      void reload();
    } else if (kind === 'forbidden') {
      setAlert(t('invitations.invite.alerts.forbidden'));
    } else if (kind === 'offline') {
      setAlert(t('invitations.invite.alerts.offline'));
    } else {
      setAlert(t('invitations.invite.alerts.failed'));
    }
  };

  return (
    <section aria-labelledby={headingId} className={`${card} flex flex-col gap-5 p-4 md:p-6`}>
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-xl font-semibold">
          {t('invitations.invite.heading')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('invitations.invite.help')}</p>
      </div>
      <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <label htmlFor={emailId} className="font-medium">
            {t('invitations.invite.email')}
          </label>
          <span className="relative flex items-center">
            <IconMail
              aria-hidden="true"
              size={20}
              stroke={1.75}
              className="pointer-events-none absolute left-3 text-muted-foreground"
            />
            <input
              ref={input}
              id={emailId}
              type="email"
              autoComplete="off"
              placeholder={t('invitations.invite.placeholder')}
              aria-required="true"
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? emailError : undefined}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={`${textInput} pl-10`}
            />
          </span>
          {errors.email && (
            <p id={emailError} className={fieldError}>
              {t(`invitations.invite.errors.${errors.email}`)}
            </p>
          )}
        </div>
        <fieldset
          role="radiogroup"
          aria-labelledby={roleLegend}
          aria-describedby={errors.role ? roleError : undefined}
          aria-invalid={errors.role ? true : undefined}
          className="flex flex-col gap-1"
        >
          <legend id={roleLegend} className="mb-2 font-medium">
            {t('invitations.invite.role')}
          </legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {offered.map((option) => (
              <div
                key={option}
                className={`relative flex min-h-11 items-start gap-3 rounded-sm border p-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring ${
                  role === option
                    ? 'border-primary bg-selected'
                    : 'border-input bg-card hover:bg-muted'
                }`}
              >
                <input
                  id={`${roleName}-${option}`}
                  type="radio"
                  name={roleName}
                  value={option}
                  checked={role === option}
                  onChange={() => setRole(option)}
                  aria-describedby={`${roleName}-${option}-hint`}
                  className={`mt-0.5 size-5 accent-primary ${focusRing}`}
                />
                <span className="flex flex-col">
                  <label
                    htmlFor={`${roleName}-${option}`}
                    className="cursor-pointer font-semibold after:absolute after:inset-0"
                  >
                    {t(`roles.${option}`)}
                  </label>
                  <span id={`${roleName}-${option}-hint`} className="text-sm text-muted-foreground">
                    {t(`invitations.invite.roleHint.${option}`)}
                  </span>
                </span>
              </div>
            ))}
          </div>
          {errors.role && (
            <p id={roleError} className={fieldError}>
              {t(`invitations.invite.errors.${errors.role}`)}
            </p>
          )}
        </fieldset>
        {alert && <Callout tone="error">{alert}</Callout>}
        <button type="submit" className={`${softButton} self-start`} aria-disabled={busy}>
          <IconUserPlus aria-hidden="true" size={20} stroke={1.75} />
          {t('invitations.invite.submit')}
        </button>
      </form>
    </section>
  );
}
