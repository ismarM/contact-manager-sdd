import { IconAlertTriangle, IconPlus, IconTrash } from '@tabler/icons-react';
import { type FormEvent, memo, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useBlocker, useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';

import { Dialog, DialogContent, DialogTitle } from '../../shared/ui/dialog';
import {
  errorAlert,
  fieldError,
  focusRing,
  primaryButton,
  secondaryButton,
  textInput,
} from '../../shared/ui/styles';
import { fieldErrors } from '../groups/api';
import { useGroup } from '../groups/groupContext';
import { conflictCurrent, type FailureKey, failureKey, useContactsApi } from './api';
import { ContactConflictAlert } from './ContactConflictAlert';
import { TagInput } from './TagInput';
import type { ContactDetail, ContactInput } from './types';
import {
  type AttributeRow,
  type ErrorKey,
  type FormValues,
  LIMITS,
  serverErrorKey,
  validate,
} from './validation';

type Field = 'firstName' | 'lastName' | 'address' | 'email' | 'phone';

const EMPTY: FormValues = {
  firstName: '',
  lastName: '',
  address: '',
  email: '',
  phone: '',
  attributes: [],
  tags: [],
};

let rowCounter = 0;
const newRowId = () => `row-${(rowCounter += 1)}`;

function fromContact(contact: ContactDetail): FormValues {
  return {
    firstName: contact.firstName ?? '',
    lastName: contact.lastName ?? '',
    address: contact.address ?? '',
    email: contact.email ?? '',
    phone: contact.phone ?? '',
    attributes: contact.attributes.map((attribute) => ({ id: newRowId(), ...attribute })),
    tags: [...contact.tags],
  };
}

/** Telo zahtevka: obrezane vrednosti, prazno polje `null`, popolnoma prazne vrstice atributov se ne pošljejo. */
function toInput(values: FormValues): { input: ContactInput; rows: AttributeRow[] } {
  const optional = (value: string) => (value.trim() === '' ? null : value.trim());
  const rows = values.attributes.filter((row) => row.key.trim() !== '' || row.value.trim() !== '');
  return {
    input: {
      firstName: optional(values.firstName),
      lastName: optional(values.lastName),
      address: optional(values.address),
      email: optional(values.email),
      phone: optional(values.phone),
      attributes: rows.map((row) => ({ key: row.key.trim(), value: row.value.trim() })),
      tags: values.tags,
    },
    rows,
  };
}

const serialize = (values: FormValues) => JSON.stringify(toInput(values).input);

/**
 * Obrazec kontakta (FR-004-01 … FR-004-05, FR-004-10, FR-004-11; design.md 8.2, 8.3, 8.12): tri skupine polj, preverjanje
 * ob zapustitvi polja in ob oddaji (povzetek napak s fokusom), napake strežnika ob poljih, trajne napake s *Poskusi
 * znova*, konflikt verzij in varovalo neshranjenih sprememb (useBlocker, `beforeunload`).
 */
export function ContactForm({
  contact,
  labelledBy,
}: {
  contact?: ContactDetail;
  labelledBy: string;
}) {
  const { t } = useTranslation();
  const api = useContactsApi();
  const { group } = useGroup();
  const location = useLocation();
  const navigate = useNavigate();
  const prefix = useId();
  const [values, setValues] = useState<FormValues>(() => (contact ? fromContact(contact) : EMPTY));
  const [baseline, setBaseline] = useState(() => serialize(contact ? fromContact(contact) : EMPTY));
  const [version, setVersion] = useState(contact?.version ?? 0);
  const [errors, setErrors] = useState<Record<string, ErrorKey>>({});
  const [summary, setSummary] = useState(false);
  const [failure, setFailure] = useState<FailureKey | null>(null);
  const [conflict, setConflict] = useState<ContactDetail | null>(null);
  const [tooMany, setTooMany] = useState(false);
  const [busy, setBusy] = useState(false);
  const [focusTarget, setFocusTarget] = useState<{ id: string } | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const [focusSummary, setFocusSummary] = useState(0);
  const leaving = useRef(false);
  const dirty = serialize(values) !== baseline;
  const base = `/groups/${group.id}/contacts`;
  const search = location.search;
  const domId = (field: string) => `${prefix}-${field}`;
  const errorId = (field: string) => `${prefix}-${field}-error`;

  const blocker = useBlocker(() => dirty && !leaving.current);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    if (focusSummary > 0) summaryRef.current?.focus();
  }, [focusSummary]);

  useEffect(() => {
    if (focusTarget) document.getElementById(focusTarget.id)?.focus();
  }, [focusTarget]);

  const setField = (field: Field, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[field];
      if ((field === 'firstName' || field === 'lastName') && value.trim() !== '') {
        if (next.firstName === 'contacts.errors.nameRequired') delete next.firstName;
        if (next.lastName === 'contacts.errors.nameRequired') delete next.lastName;
      }
      return next;
    });
  };

  /** Preverjanje ob zapustitvi polja (design.md 8.2); »vsaj ime ali priimek« šele ob oddaji. */
  const blur = (field: string) => {
    const found = validate(values)[field];
    setErrors((current) => {
      const next = { ...current };
      if (found && found !== 'contacts.errors.nameRequired') next[field] = found;
      else if (next[field] !== 'contacts.errors.nameRequired') delete next[field];
      return next;
    });
  };

  const setRow = (id: string, part: 'key' | 'value', value: string) => {
    setValues((current) => ({
      ...current,
      attributes: current.attributes.map((row) =>
        row.id === id ? { ...row, [part]: value } : row,
      ),
    }));
    setErrors((current) => {
      const next = { ...current };
      delete next[`attributes.${id}.${part}`];
      return next;
    });
  };

  const addRow = () => {
    if (values.attributes.length >= LIMITS.attributes) {
      setTooMany(true);
      return;
    }
    const id = newRowId();
    setValues((current) => ({
      ...current,
      attributes: [...current.attributes, { id, key: '', value: '' }],
    }));
    setFocusTarget({ id: domId(`attributes.${id}.key`) });
  };

  const removeRow = (id: string) => {
    const index = values.attributes.findIndex((row) => row.id === id);
    const rest = values.attributes.filter((row) => row.id !== id);
    setValues((current) => ({ ...current, attributes: rest }));
    setTooMany(false);
    const neighbour = rest[index] ?? rest[index - 1];
    setFocusTarget({
      id: neighbour ? domId(`attributes.${neighbour.id}.key`) : domId('add-attribute'),
    });
  };

  // Vrstice atributov so memoizirane (do 50 vrstic); stabilni vmesnik vedno kliče najnovejše rokovalnike.
  const latest = useRef({ setRow, blur, removeRow });
  useEffect(() => {
    latest.current = { setRow, blur, removeRow };
  });
  const [rowActions] = useState<RowActions>(() => ({
    setRow: (id, part, value) => latest.current.setRow(id, part, value),
    blur: (field) => latest.current.blur(field),
    removeRow: (id) => latest.current.removeRow(id),
  }));

  const save = async (sendVersion: number) => {
    if (busy) return;
    const { input, rows } = toInput(values);
    setBusy(true);
    setFailure(null);
    setConflict(null);
    try {
      const saved = contact
        ? await api.updateContact(group.id, contact.id, { ...input, version: sendVersion })
        : await api.createContact(group.id, input);
      leaving.current = true;
      toast(t('contacts.toast.saved', { name: saved.displayName }));
      void navigate(`${base}/${saved.id}${search}`);
    } catch (error) {
      const current = conflictCurrent(error);
      const invalid = fieldErrors(error);
      if (current) {
        setConflict(current);
      } else if (invalid.length > 0) {
        const mapped: Record<string, ErrorKey> = {};
        for (const { field, code } of invalid) {
          const key = serverErrorKey(field, code);
          if (!key) continue;
          const row = /^attributes\[(\d+)\]\.(key|value)$/.exec(field);
          if (row) {
            const sent = rows[Number(row[1])];
            if (sent) mapped[`attributes.${sent.id}.${row[2]}`] = key;
          } else {
            mapped[field.startsWith('tags') ? 'tags' : field] = key;
          }
        }
        setErrors(mapped);
        setSummary(true);
        setFocusSummary((n) => n + 1);
      } else {
        setFailure(failureKey(error, 'contacts.form.saveFailed'));
      }
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found = validate(values);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      setSummary(true);
      setFailure(null);
      setFocusSummary((n) => n + 1);
      return;
    }
    setSummary(false);
    void save(version);
  };

  const order = [
    'firstName',
    'lastName',
    'address',
    'email',
    'phone',
    ...values.attributes.flatMap((row) => [
      `attributes.${row.id}.key`,
      `attributes.${row.id}.value`,
    ]),
  ];
  const listed = order.filter((field) => errors[field]);
  const cancelTo = contact ? `${base}/${contact.id}${search}` : `${base}${search}`;

  const describe = (field: string) =>
    errors[field] ? { 'aria-invalid': true, 'aria-describedby': errorId(field) } : {};
  const message = (field: string) =>
    errors[field] ? (
      <p id={errorId(field)} className={fieldError}>
        {t(errors[field])}
      </p>
    ) : null;

  const textField = (field: Field, label: string, props: Record<string, string> = {}) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={domId(field)} className="font-bold">
        {label}
      </label>
      {field === 'address' ? (
        <textarea
          id={domId(field)}
          rows={3}
          value={values[field]}
          onChange={(event) => setField(field, event.target.value)}
          onBlur={() => blur(field)}
          className={textInput}
          {...describe(field)}
          {...props}
        />
      ) : (
        <input
          id={domId(field)}
          type="text"
          value={values[field]}
          onChange={(event) => setField(field, event.target.value)}
          onBlur={() => blur(field)}
          className={textInput}
          {...describe(field)}
          {...props}
        />
      )}
      {message(field)}
    </div>
  );

  return (
    <>
      {summary && listed.length > 0 && (
        <div ref={summaryRef} role="alert" tabIndex={-1} className={`${errorAlert} flex-col`}>
          <p className="flex gap-2 font-bold">
            <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
            {t('contacts.form.summary')}
          </p>
          <ul className="list-disc pl-8">
            {listed.map((field) => (
              <li key={field}>
                <a
                  href={`#${domId(field)}`}
                  onClick={(event) => {
                    event.preventDefault();
                    document.getElementById(domId(field))?.focus();
                  }}
                  className={`text-destructive underline underline-offset-4 ${focusRing}`}
                >
                  {t(errors[field]!)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {failure && (
        <div role="alert" className={errorAlert}>
          <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          <span className="flex flex-wrap items-center gap-3">
            {t(failure)}
            {(failure === 'groups.offline' || failure === 'contacts.form.saveFailed') && (
              <button type="button" className={secondaryButton} onClick={() => void save(version)}>
                {t('contacts.form.retry')}
              </button>
            )}
            {failure === 'contacts.gone' && (
              <Link to={`${base}${search}`} className={`font-bold ${focusRing} underline`}>
                {t('contacts.view.back')}
              </Link>
            )}
          </span>
        </div>
      )}

      {conflict && (
        <ContactConflictAlert
          mine={toInput(values).input}
          current={conflict}
          onUseCurrent={() => {
            const next = fromContact(conflict);
            setValues(next);
            setBaseline(serialize(next));
            setVersion(conflict.version);
            setErrors({});
            setConflict(null);
          }}
          onSaveMine={() => {
            setVersion(conflict.version);
            void save(conflict.version);
          }}
        />
      )}

      <form
        aria-labelledby={labelledBy}
        noValidate
        onSubmit={submit}
        className="flex flex-col gap-6"
      >
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-2 text-lg font-bold">{t('contacts.form.basic')}</legend>
          {textField('firstName', t('contacts.form.firstName'), { autoComplete: 'given-name' })}
          {textField('lastName', t('contacts.form.lastName'), { autoComplete: 'family-name' })}
          {textField('address', t('contacts.form.address'))}
          {textField('email', t('contacts.form.email'), { type: 'email', autoComplete: 'off' })}
          {textField('phone', t('contacts.form.phone'), { type: 'tel', autoComplete: 'off' })}
        </fieldset>

        <fieldset className="flex flex-col gap-4">
          <legend className="mb-2 text-lg font-bold">{t('contacts.form.attributesLegend')}</legend>
          {values.attributes.map((row) => (
            <AttributeFields
              key={row.id}
              row={row}
              prefix={prefix}
              keyError={errors[`attributes.${row.id}.key`]}
              valueError={errors[`attributes.${row.id}.value`]}
              actions={rowActions}
            />
          ))}
          <div className="flex flex-col gap-1">
            <button
              id={domId('add-attribute')}
              type="button"
              onClick={addRow}
              aria-describedby={tooMany ? errorId('add-attribute') : undefined}
              className={`${secondaryButton} self-start`}
            >
              <IconPlus aria-hidden="true" size={20} stroke={1.75} />
              {t('contacts.form.addAttribute')}
            </button>
            {tooMany && (
              <p id={errorId('add-attribute')} className={fieldError}>
                {t('contacts.errors.tooManyAttributes')}
              </p>
            )}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-lg font-bold">{t('contacts.form.tagsLegend')}</legend>
          <TagInput
            tags={values.tags}
            serverError={errors.tags}
            onChange={(tags) => {
              setValues((current) => ({ ...current, tags }));
              setErrors((current) => {
                const next = { ...current };
                delete next.tags;
                return next;
              });
            }}
          />
        </fieldset>

        <div className="flex flex-wrap gap-3">
          <button type="submit" className={primaryButton} aria-disabled={busy}>
            {t('contacts.form.save')}
          </button>
          <button type="button" className={secondaryButton} onClick={() => void navigate(cancelTo)}>
            {t('contacts.form.cancel')}
          </button>
        </div>
      </form>

      <DiscardDialog
        open={blocker.state === 'blocked'}
        onKeep={() => blocker.reset?.()}
        onDiscard={() => {
          leaving.current = true;
          blocker.proceed?.();
        }}
      />
    </>
  );
}

interface RowActions {
  setRow: (id: string, part: 'key' | 'value', value: string) => void;
  blur: (field: string) => void;
  removeRow: (id: string) => void;
}

/** Vrstica dodatnega atributa: ključ, vrednost in odstranitev (FR-004-02); memoizirana zaradi do 50 vrstic. */
const AttributeFields = memo(function AttributeFields({
  row,
  prefix,
  keyError,
  valueError,
  actions,
}: {
  row: AttributeRow;
  prefix: string;
  keyError: ErrorKey | undefined;
  valueError: ErrorKey | undefined;
  actions: RowActions;
}) {
  const { t } = useTranslation();
  const keyField = `attributes.${row.id}.key`;
  const valueField = `attributes.${row.id}.value`;
  const domId = (field: string) => `${prefix}-${field}`;
  const errorId = (field: string) => `${prefix}-${field}-error`;
  const describe = (field: string, error: ErrorKey | undefined) =>
    error ? { 'aria-invalid': true, 'aria-describedby': errorId(field) } : {};
  const message = (field: string, error: ErrorKey | undefined) =>
    error ? (
      <p id={errorId(field)} className={fieldError}>
        {t(error)}
      </p>
    ) : null;
  return (
    <div className="flex flex-wrap items-start gap-3">
      <div className="flex min-w-40 flex-1 flex-col gap-1">
        <label htmlFor={domId(keyField)} className="font-bold">
          {t('contacts.form.key')}
        </label>
        <input
          id={domId(keyField)}
          type="text"
          value={row.key}
          onChange={(event) => actions.setRow(row.id, 'key', event.target.value)}
          onBlur={() => actions.blur(keyField)}
          className={textInput}
          {...describe(keyField, keyError)}
        />
        {message(keyField, keyError)}
      </div>
      <div className="flex min-w-40 flex-[2] flex-col gap-1">
        <label htmlFor={domId(valueField)} className="font-bold">
          {t('contacts.form.value')}
        </label>
        <input
          id={domId(valueField)}
          type="text"
          value={row.value}
          onChange={(event) => actions.setRow(row.id, 'value', event.target.value)}
          onBlur={() => actions.blur(valueField)}
          className={textInput}
          {...describe(valueField, valueError)}
        />
        {message(valueField, valueError)}
      </div>
      <button
        type="button"
        aria-label={
          row.key.trim()
            ? t('contacts.form.removeAttribute', { key: row.key.trim() })
            : t('contacts.form.removeAttributeEmpty')
        }
        onClick={() => actions.removeRow(row.id)}
        className={`${secondaryButton} mt-7 px-3`}
      >
        <IconTrash aria-hidden="true" size={20} stroke={1.75} />
      </button>
    </div>
  );
});

/** »Zavržem spremembe?« (design.md 8.12; FR-004-05): fokus na varni izbiri *Nadaljuj z urejanjem*; Esc je enak. */
function DiscardDialog({
  open,
  onKeep,
  onDiscard,
}: {
  open: boolean;
  onKeep: () => void;
  onDiscard: () => void;
}) {
  const { t } = useTranslation();
  const keep = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onKeep();
      }}
    >
      <DialogContent
        onInteractOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          keep.current?.focus();
        }}
      >
        <DialogTitle>{t('contacts.discard.title')}</DialogTitle>
        <div className="flex flex-wrap justify-end gap-3">
          <button ref={keep} type="button" className={primaryButton} onClick={onKeep}>
            {t('contacts.discard.keep')}
          </button>
          <button type="button" className={secondaryButton} onClick={onDiscard}>
            {t('contacts.discard.discard')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
