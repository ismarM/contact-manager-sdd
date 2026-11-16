import { IconAlertTriangle } from '@tabler/icons-react';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiError } from '../../shared/api/client';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '../../shared/ui/dialog';
import {
  errorAlert,
  fieldError,
  primaryButton,
  secondaryButton,
  textInput,
} from '../../shared/ui/styles';
import type { ApiKeysApi, SelectableGroup } from './api';
import { ApiKeyCreatedDialog } from './ApiKeyCreatedDialog';
import type { ApiKeyCreated, ApiKeyExpiry, ApiKeyPermission } from './types';

const NAME_MAX = 50;
const GROUPS_MAX = 50;
const PERMISSIONS: ApiKeyPermission[] = ['READ', 'WRITE'];
type ExpiryLabel =
  | 'apiKeys.form.expiry30'
  | 'apiKeys.form.expiry90'
  | 'apiKeys.form.expiry365'
  | 'apiKeys.form.expiryNever';

const EXPIRIES: { value: string; days: ApiKeyExpiry; label: ExpiryLabel }[] = [
  { value: '30', days: 30, label: 'apiKeys.form.expiry30' },
  { value: '90', days: 90, label: 'apiKeys.form.expiry90' },
  { value: '365', days: 365, label: 'apiKeys.form.expiry365' },
  { value: 'never', days: null, label: 'apiKeys.form.expiryNever' },
];

const select = `${textInput} w-auto min-h-11 pointer-coarse:min-h-12`;
const option = 'flex min-h-11 items-center gap-3 pointer-coarse:min-h-12';
const control =
  'size-5 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const fieldset = 'flex flex-col gap-2 rounded-md border border-border p-4';

type Scope = 'selected' | 'all';

interface Errors {
  name?: string;
  groups?: string;
}

/**
 * Nov API ključ (FR-019-01; design.md 8.2, 8.10): ime, izbrane skupine (vsaka s pravico) ali »vse moje skupine« z eno
 * pravico, rok veljavnosti (privzeto 90 dni, samo branje). Po uspehu isti dialog enkrat pokaže ključ.
 */
export function CreateApiKeyDialog({ api, onCreated }: { api: ApiKeysApi; onCreated: () => void }) {
  const { t, i18n } = useTranslation();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<Scope>('selected');
  const [chosen, setChosen] = useState<Record<string, ApiKeyPermission>>({});
  const [allPermission, setAllPermission] = useState<ApiKeyPermission>('READ');
  const [expiry, setExpiry] = useState('90');
  const [groups, setGroups] = useState<SelectableGroup[] | null>(null);
  const [groupsFailed, setGroupsFailed] = useState(false);
  const [groupReloads, setGroupReloads] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<ApiKeyCreated | null>(null);
  const lang = i18n.language === 'en' ? 'en' : 'sl';

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    api.groups(lang, controller.signal).then(
      (result) => {
        setGroups(result);
        setGroupsFailed(false);
      },
      () => {
        if (!controller.signal.aborted) setGroupsFailed(true);
      },
    );
    return () => controller.abort();
  }, [api, lang, open, groupReloads]);

  const reset = () => {
    setName('');
    setScope('selected');
    setChosen({});
    setAllPermission('READ');
    setExpiry('90');
    setGroups(null);
    setGroupsFailed(false);
    setErrors({});
    setFailure(null);
    setCreated(null);
  };

  const validate = (): Errors => {
    const found: Errors = {};
    const trimmed = name.trim();
    if (trimmed === '') found.name = t('apiKeys.form.nameRequired');
    else if ([...trimmed].length > NAME_MAX) found.name = t('apiKeys.form.nameTooLong');
    const count = Object.keys(chosen).length;
    if (scope === 'selected' && count === 0) found.groups = t('apiKeys.form.groupsRequired');
    else if (scope === 'selected' && count > GROUPS_MAX)
      found.groups = t('apiKeys.form.groupsTooMany');
    return found;
  };

  const submit = async () => {
    if (busy) return;
    const found = validate();
    setErrors(found);
    setFailure(null);
    if (found.name || found.groups) {
      document.getElementById(found.name ? `${formId}-name` : `${formId}-groups`)?.focus();
      return;
    }
    const choice = EXPIRIES.find((entry) => entry.value === expiry);
    const days = choice === undefined ? 90 : choice.days;
    setBusy(true);
    try {
      const result = await api.create(
        scope === 'all'
          ? {
              name: name.trim(),
              allGroups: true,
              allGroupsPermission: allPermission,
              expiresInDays: days,
            }
          : {
              name: name.trim(),
              allGroups: false,
              groups: Object.entries(chosen).map(([groupId, permission]) => ({
                groupId,
                permission,
              })),
              expiresInDays: days,
            },
      );
      setCreated(result);
      onCreated();
    } catch (problem) {
      setFailure(failureText(problem));
    } finally {
      setBusy(false);
    }
  };

  const failureText = (problem: unknown): string => {
    if (!(problem instanceof ApiError)) return t('groups.offline');
    if (problem.code === 'API_KEY_LIMIT') return t('apiKeys.form.limit');
    if (problem.status === 404) return t('apiKeys.form.groupNotFound');
    if (problem.status === 400 && fieldCodes(problem.body).some((e) => e.field === 'name')) {
      const tooLong = fieldCodes(problem.body).some(
        (e) => e.field === 'name' && e.code === 'TOO_LONG',
      );
      setErrors({ name: t(tooLong ? 'apiKeys.form.nameTooLong' : 'apiKeys.form.nameRequired') });
    }
    return t('apiKeys.form.failed');
  };

  const toggle = (group: SelectableGroup, checked: boolean) => {
    setChosen((current) => {
      const next = { ...current };
      if (checked) next[group.id] = 'READ';
      else delete next[group.id];
      return next;
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Ključ po zaprtju okna ni več viden (FR-019-01).
        if (!next) reset();
      }}
    >
      <DialogTrigger className={`${primaryButton} self-start`}>{t('apiKeys.create')}</DialogTrigger>
      <DialogContent onInteractOutside={(event) => event.preventDefault()}>
        {created ? (
          <ApiKeyCreatedDialog created={created} />
        ) : (
          <form
            noValidate
            className="flex flex-col gap-6"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <DialogTitle>{t('apiKeys.form.title')}</DialogTitle>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${formId}-name`} className="font-bold">
                {t('apiKeys.form.nameLabel')}
              </label>
              <p id={`${formId}-name-hint`} className="text-sm text-muted-foreground">
                {t('apiKeys.form.nameHint')}
              </p>
              <input
                id={`${formId}-name`}
                value={name}
                maxLength={200}
                autoComplete="off"
                onChange={(event) => setName(event.target.value)}
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={
                  errors.name ? `${formId}-name-error ${formId}-name-hint` : `${formId}-name-hint`
                }
                className={textInput}
              />
              {errors.name && (
                <p id={`${formId}-name-error`} className={fieldError}>
                  {errors.name}
                </p>
              )}
            </div>

            <fieldset className={fieldset}>
              <legend className="px-1 font-bold">{t('apiKeys.form.scopeLegend')}</legend>
              {(['selected', 'all'] as Scope[]).map((value) => (
                <label key={value} className={option}>
                  <input
                    type="radio"
                    name={`${formId}-scope`}
                    value={value}
                    checked={scope === value}
                    onChange={() => setScope(value)}
                    className={control}
                  />
                  {t(value === 'all' ? 'apiKeys.form.scopeAll' : 'apiKeys.form.scopeSelected')}
                </label>
              ))}
              {scope === 'selected' ? (
                <GroupChoices
                  id={`${formId}-groups`}
                  groups={groups}
                  failed={groupsFailed}
                  retry={() => setGroupReloads((n) => n + 1)}
                  chosen={chosen}
                  toggle={toggle}
                  setPermission={(groupId, permission) =>
                    setChosen((current) => ({ ...current, [groupId]: permission }))
                  }
                  error={errors.groups}
                />
              ) : (
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${formId}-all-permission`} className="font-bold">
                    {t('apiKeys.form.permissionLabel')}
                  </label>
                  <select
                    id={`${formId}-all-permission`}
                    value={allPermission}
                    onChange={(event) => setAllPermission(event.target.value as ApiKeyPermission)}
                    className={select}
                  >
                    {PERMISSIONS.map((permission) => (
                      <option key={permission} value={permission}>
                        {t(`apiKeys.permission.${permission}`)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <p className="text-sm text-muted-foreground">{t('apiKeys.form.permissionHint')}</p>
            </fieldset>

            <div className="flex flex-col gap-1">
              <label htmlFor={`${formId}-expiry`} className="font-bold">
                {t('apiKeys.form.expiryLabel')}
              </label>
              <select
                id={`${formId}-expiry`}
                value={expiry}
                onChange={(event) => setExpiry(event.target.value)}
                className={select}
              >
                {EXPIRIES.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {t(entry.label)}
                  </option>
                ))}
              </select>
            </div>

            {failure && (
              <div role="alert" className={errorAlert}>
                <IconAlertTriangle
                  aria-hidden="true"
                  size={20}
                  stroke={1.75}
                  className="shrink-0"
                />
                <span>{failure}</span>
              </div>
            )}
            <div className="flex flex-wrap gap-3">
              <button type="submit" className={primaryButton} aria-disabled={busy}>
                {t('apiKeys.form.submit')}
              </button>
              <DialogClose className={secondaryButton}>{t('apiKeys.form.cancel')}</DialogClose>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function GroupChoices({
  id,
  groups,
  failed,
  retry,
  chosen,
  toggle,
  setPermission,
  error,
}: {
  id: string;
  groups: SelectableGroup[] | null;
  failed: boolean;
  retry: () => void;
  chosen: Record<string, ApiKeyPermission>;
  toggle: (group: SelectableGroup, checked: boolean) => void;
  setPermission: (groupId: string, permission: ApiKeyPermission) => void;
  error?: string;
}) {
  const { t } = useTranslation();
  if (failed) {
    return (
      <div role="alert" className={errorAlert}>
        <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
        <span className="flex flex-wrap items-center gap-3">
          {t('apiKeys.form.groupsLoadFailed')}
          <button type="button" className={secondaryButton} onClick={retry}>
            {t('apiKeys.retry')}
          </button>
        </span>
      </div>
    );
  }
  return (
    <fieldset
      id={id}
      tabIndex={-1}
      aria-describedby={error ? `${id}-error` : undefined}
      aria-busy={groups === null}
      className="flex flex-col gap-2"
    >
      <legend className="font-bold">{t('apiKeys.form.groupsLabel')}</legend>
      <ul className="flex flex-col gap-2">
        {(groups ?? []).map((group) => {
          const checkboxId = `${id}-${group.id}`;
          const title = group.archived
            ? t('apiKeys.form.archivedGroup', { title: group.title })
            : group.title;
          const permission = chosen[group.id];
          return (
            <li key={group.id} className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor={checkboxId} className={option}>
                <input
                  id={checkboxId}
                  type="checkbox"
                  checked={permission !== undefined}
                  onChange={(event) => toggle(group, event.target.checked)}
                  className={control}
                />
                <span className="break-words">{title}</span>
              </label>
              {permission !== undefined && (
                <select
                  aria-label={t('apiKeys.form.permissionFor', { title: group.title })}
                  value={permission}
                  onChange={(event) =>
                    setPermission(group.id, event.target.value as ApiKeyPermission)
                  }
                  className={select}
                >
                  {PERMISSIONS.map((value) => (
                    <option key={value} value={value}>
                      {t(`apiKeys.permission.${value}`)}
                    </option>
                  ))}
                </select>
              )}
            </li>
          );
        })}
      </ul>
      {error && (
        <p id={`${id}-error`} className={fieldError}>
          {error}
        </p>
      )}
    </fieldset>
  );
}

function fieldCodes(body: unknown): { field: string; code: string }[] {
  if (body && typeof body === 'object' && 'errors' in body && Array.isArray(body.errors)) {
    return body.errors as { field: string; code: string }[];
  }
  return [];
}
