import { IconAlertTriangle } from '@tabler/icons-react';
import { type FormEvent, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { ApiError } from '../../shared/api/client';
import { errorAlert, primaryButton } from '../../shared/ui/styles';
import { failureKey, fieldErrors, useGroupsApi } from './api';
import { COLOR_SWATCH } from './colors';
import { ConflictAlert } from './ConflictAlert';
import { useGroup } from './groupContext';
import { GroupFormFields, type GroupFormState } from './GroupFormFields';
import { useGroups } from './groupsContext';
import { serverFieldError, type GroupValidation, validateGroupInput } from './groupValidation';
import type { GroupDetail } from './types';

const formState = (group: GroupDetail): GroupFormState => ({
  title: group.title,
  description: group.description ?? '',
  color: group.color,
});

/**
 * *Nastavitve → Podatki skupine* (design.md 9.7 točka 1): vsi člani vidijo podatke (FR-002-10); lastnik in admin
 * nearhivirane skupine jih urejata z optimističnim zaklepanjem in razrešitvijo konflikta (FR-002-11, FR-002-12).
 */
export function GroupDetailsSection() {
  const { t } = useTranslation();
  const { group, reload } = useGroup();
  const headingId = useId();
  const [archivedMeanwhile, setArchivedMeanwhile] = useState(false);
  const canEdit = (group.role === 'OWNER' || group.role === 'ADMIN') && !group.archived;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <h2 id={headingId} className="text-xl font-bold">
        {t('groups.details.heading')}
      </h2>
      {archivedMeanwhile && (
        <div role="alert" className={errorAlert}>
          <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          <span>{t('groups.details.archived')}</span>
        </div>
      )}
      {canEdit ? (
        <DetailsForm
          key={group.id}
          labelledBy={headingId}
          onArchived={() => {
            setArchivedMeanwhile(true);
            void reload();
          }}
        />
      ) : (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-[max-content_1fr]">
          <dt className="text-muted-foreground">{t('groups.form.title')}</dt>
          <dd className="break-words">{group.title}</dd>
          <dt className="text-muted-foreground">{t('groups.form.description')}</dt>
          <dd
            className={
              group.description ? 'break-words whitespace-pre-line' : 'text-muted-foreground'
            }
          >
            {group.description ?? t('groups.details.noDescription')}
          </dd>
          <dt className="text-muted-foreground">{t('groups.form.color')}</dt>
          <dd className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`inline-block size-6 rounded-sm ${COLOR_SWATCH[group.color]}`}
            />
            {t(`colors.${group.color}`)}
          </dd>
        </dl>
      )}
    </section>
  );
}

function DetailsForm({ labelledBy, onArchived }: { labelledBy: string; onArchived: () => void }) {
  const { t } = useTranslation();
  const api = useGroupsApi();
  const { group, setGroup, markNotFound } = useGroup();
  const { refresh } = useGroups();
  const [values, setValues] = useState<GroupFormState>(() => formState(group));
  const [version, setVersion] = useState(group.version);
  const [errors, setErrors] = useState<GroupValidation['errors']>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [conflict, setConflict] = useState<GroupDetail | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async (baseVersion: number) => {
    if (saving) return;
    const { errors: found, value } = validateGroupInput(values);
    setErrors(found);
    setFailure(null);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    try {
      const updated = await api.updateGroup(group.id, { ...value, version: baseVersion });
      setConflict(null);
      setVersion(updated.version);
      setValues(formState(updated));
      setGroup(updated);
      toast(t('groups.details.saved'));
      refresh();
    } catch (error) {
      const current = conflictCurrent(error);
      if (current) {
        setConflict(current);
      } else if (error instanceof ApiError && error.status === 404) {
        markNotFound();
      } else if (
        error instanceof ApiError &&
        error.status === 409 &&
        error.code === 'GROUP_ARCHIVED'
      ) {
        onArchived();
      } else {
        const fields = fieldErrors(error)
          .map(({ field, code }) => serverFieldError(field, code))
          .filter((entry) => entry !== null);
        if (fields.length > 0) setErrors(Object.fromEntries(fields));
        else setFailure(t(failureKey(error, 'groups.details.saveFailed')));
      }
    } finally {
      setSaving(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void save(version);
  };

  const applyCurrent = (current: GroupDetail) => {
    setConflict(null);
    setErrors({});
    setValues(formState(current));
    setVersion(current.version);
    setGroup(current);
  };

  return (
    <div className="flex flex-col gap-4">
      {conflict && (
        <ConflictAlert
          mine={validateGroupInput(values).value}
          current={conflict}
          onUseCurrent={() => applyCurrent(conflict)}
          onSaveMine={() => void save(conflict.version)}
        />
      )}
      {failure && (
        <div role="alert" className={errorAlert}>
          <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          <span>{failure}</span>
        </div>
      )}
      <form
        aria-labelledby={labelledBy}
        noValidate
        onSubmit={submit}
        className="flex flex-col gap-4"
      >
        <GroupFormFields values={values} onChange={setValues} errors={errors} />
        <div>
          <button type="submit" className={primaryButton} aria-disabled={saving}>
            {t('groups.form.save')}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Trenutno stanje iz `409 VERSION_CONFLICT` (contracts – VersionConflict); sicer `null`. */
function conflictCurrent(error: unknown): GroupDetail | null {
  if (!(error instanceof ApiError) || error.status !== 409 || error.code !== 'VERSION_CONFLICT')
    return null;
  const body = error.body;
  if (
    body &&
    typeof body === 'object' &&
    'current' in body &&
    body.current &&
    typeof body.current === 'object'
  ) {
    return body.current as GroupDetail;
  }
  return null;
}
