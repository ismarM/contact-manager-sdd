import { IconKey, IconPlus } from '@tabler/icons-react';
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
import { Callout } from '../../shared/ui/Callout';
import { Monogram } from '../../shared/ui/Monogram';
import { SegmentedControl } from '../../shared/ui/SegmentedControl';
import {
  fieldError,
  focusRing,
  ghostButton,
  primaryButton,
  secondaryButton,
  softButton,
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
const control = `size-5 accent-primary ${focusRing}`;

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
      <DialogTrigger className={softButton}>
        <IconPlus aria-hidden="true" size={20} stroke={1.75} />
        {t('apiKeys.create')}
      </DialogTrigger>
      <DialogContent wide onInteractOutside={(event) => event.preventDefault()}>
        {created ? (
          <ApiKeyCreatedDialog created={created} />
        ) : (
          <form
            noValidate
            className="flex flex-col gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <DialogTitle>{t('apiKeys.form.title')}</DialogTitle>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${formId}-name`} className="font-medium">
                {t('apiKeys.form.nameLabel')}
              </label>
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
              <p id={`${formId}-name-hint`} className="text-sm text-muted-foreground">
                {t('apiKeys.form.nameHint')}
              </p>
              {errors.name && (
                <p id={`${formId}-name-error`} className={fieldError}>
                  {errors.name}
                </p>
              )}
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1.5 font-medium">{t('apiKeys.form.scopeLegend')}</legend>
              {(['selected', 'all'] as Scope[]).map((value) => (
                <label
                  key={value}
                  className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-sm border px-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring pointer-coarse:min-h-12 ${
                    scope === value
                      ? 'border-primary bg-selected'
                      : 'border-input bg-card hover:bg-muted'
                  }`}
                >
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
                  <label htmlFor={`${formId}-all-permission`} className="font-medium">
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

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1.5 font-medium">{t('apiKeys.form.expiryLabel')}</legend>
              <SegmentedControl
                label={t('apiKeys.form.expiryLabel')}
                value={expiry}
                segments={EXPIRIES.map((entry) => ({ value: entry.value, label: t(entry.label) }))}
                onChange={setExpiry}
                className="self-start"
              />
            </fieldset>

            {failure && <Callout tone="error">{failure}</Callout>}
            <div className="flex flex-wrap justify-end gap-2">
              <DialogClose className={ghostButton}>{t('apiKeys.form.cancel')}</DialogClose>
              <button type="submit" className={primaryButton} aria-disabled={busy}>
                <IconKey aria-hidden="true" size={20} stroke={1.75} />
                {t('apiKeys.form.submit')}
              </button>
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
      <Callout
        tone="error"
        action={
          <button type="button" className={secondaryButton} onClick={retry}>
            {t('apiKeys.retry')}
          </button>
        }
      >
        {t('apiKeys.form.groupsLoadFailed')}
      </Callout>
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
      <legend className="sr-only">{t('apiKeys.form.groupsLabel')}</legend>
      <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-md border border-border">
        {(groups ?? []).map((group) => {
          const checkboxId = `${id}-${group.id}`;
          const title = group.archived
            ? t('apiKeys.form.archivedGroup', { title: group.title })
            : group.title;
          const permission = chosen[group.id];
          return (
            <li
              key={group.id}
              className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-1.5"
            >
              <label htmlFor={checkboxId} className={option}>
                <input
                  id={checkboxId}
                  type="checkbox"
                  checked={permission !== undefined}
                  onChange={(event) => toggle(group, event.target.checked)}
                  className={control}
                />
                <Monogram
                  title={group.title}
                  color={group.color ?? 'tinta'}
                  size={24}
                  photo={
                    group.photoRevision == null
                      ? undefined
                      : { path: `/groups/${group.id}/photo`, revision: group.photoRevision }
                  }
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
