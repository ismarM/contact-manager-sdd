import { IconAlertTriangle } from '@tabler/icons-react';
import { type FormEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '../../shared/ui/dialog';
import { errorAlert, primaryButton, secondaryButton } from '../../shared/ui/styles';
import { failureKey, fieldErrors, useGroupsApi } from './api';
import { GroupFormFields, type GroupFormState } from './GroupFormFields';
import { serverFieldError, type GroupValidation, validateGroupInput } from './groupValidation';
import { useGroups } from './groupsContext';

const EMPTY: GroupFormState = { title: '', description: '', color: 'tinta' };

/**
 * Dialog *Nova skupina* (design.md 8.10, 9.2; FR-002-01, -02, -03, -13): gumb, ki ga odpre, je sprožilec dialoga, zato se
 * fokus ob zaprtju vrne nanj. Po uspehu se odpre nova skupina (fokus na njenem naslovu), prikaže obvestilo in osveži
 * povzetek skupin.
 */
export function NewGroupDialog({ className = primaryButton }: { className?: string }) {
  const { t } = useTranslation();
  const api = useGroupsApi();
  const { refresh } = useGroups();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<GroupFormState>(EMPTY);
  const [errors, setErrors] = useState<GroupValidation['errors']>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const created = useRef(false);

  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (next) {
      created.current = false;
      setValues(EMPTY);
      setErrors({});
      setFailure(null);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const { errors: found, value } = validateGroupInput(values);
    setErrors(found);
    setFailure(null);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    try {
      const group = await api.createGroup(value);
      created.current = true;
      setOpen(false);
      toast(t('groups.created'));
      refresh();
      void navigate(`/groups/${group.id}/settings`, { state: { focusTitle: true } });
    } catch (error) {
      const fields = fieldErrors(error)
        .map(({ field, code }) => serverFieldError(field, code))
        .filter((entry) => entry !== null);
      if (fields.length > 0) setErrors(Object.fromEntries(fields));
      else setFailure(t(failureKey(error, 'groups.createFailed')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger className={className}>{t('groups.newGroup')}</DialogTrigger>
      <DialogContent
        // Klik ob dialog ne zapre obrazca (design.md 8.10); po uspehu fokus prevzame naslov nove skupine.
        onInteractOutside={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => {
          if (created.current) event.preventDefault();
        }}
      >
        <DialogTitle>{t('groups.newGroup')}</DialogTitle>
        {failure && (
          <div role="alert" className={errorAlert}>
            <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
            <span>{failure}</span>
          </div>
        )}
        <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
          <GroupFormFields values={values} onChange={setValues} errors={errors} />
          <div className="flex flex-wrap justify-end gap-3">
            <DialogClose className={secondaryButton}>{t('groups.form.cancel')}</DialogClose>
            <button type="submit" className={primaryButton} aria-disabled={saving}>
              {t('groups.form.create')}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
