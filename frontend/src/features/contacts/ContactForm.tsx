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
import { conflictCurrent, type FailureKey, failureKey, useContactsApi, useKeyLookup } from './api';
import { ContactConflictAlert } from './ContactConflictAlert';
import { AttributeTransferDialog, type TransferRequest } from './AttributeTransfer';
import { CountryField } from './CountryField';
import { SuggestInput } from './SuggestInput';
import { TagInput } from './TagInput';
import { TypeSelect } from './typed/TypeSelect';
import { TypedValueInput } from './typed/TypedValueInput';
import { typeNameKey } from '../attributes/typeNames';
import type { AttributeType } from '../attributes/types';
import type { ContactDetail, ContactInput } from './types';
import { allCountries, foldText, isCountryCode } from './countries';
import type { CardCandidate } from './qr/vcardTypes';
import {
  type AttributeRow,
  type ErrorKey,
  type FormValues,
  isReservedName,
  LIMITS,
  normalizeKey,
  reservedFieldOf,
  reservedKeyError,
  serverErrorKey,
  validate,
} from './validation';

type Field = 'firstName' | 'lastName' | 'company' | 'address' | 'email' | 'phone';

const EMPTY: FormValues = {
  firstName: '',
  lastName: '',
  company: '',
  address: '',
  country: '',
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
    company: contact.company ?? '',
    address: contact.address ?? '',
    country: contact.country ?? '',
    email: contact.email ?? '',
    phone: contact.phone ?? '',
    attributes: contact.attributes.map((attribute) => ({
      id: newRowId(),
      key: attribute.key,
      value: attribute.value ?? '',
      original: attribute.key,
      type: attribute.type ?? 'OTHER',
      typeLocked: true,
    })),
    tags: [...contact.tags],
  };
}

/**
 * Začetne vrednosti iz kode QR (014, FR-014-18): država se izbere samo ob natančnem ujemanju kode ali imena (sl/en),
 * sicer ostane prazna s predlogom ob polju; atributi in značke so prenesene, kot so.
 */
function fromCandidate(candidate: CardCandidate): {
  values: FormValues;
  countryHint: string | null;
} {
  const text = candidate.countryText?.trim() ?? '';
  const code = text === '' ? '' : exactCountry(text);
  return {
    values: {
      firstName: candidate.firstName ?? '',
      lastName: candidate.lastName ?? '',
      company: candidate.company ?? '',
      address: candidate.address ?? '',
      country: code,
      email: candidate.email ?? '',
      phone: candidate.phone ?? '',
      attributes: candidate.attributes.map((attribute) => ({
        id: newRowId(),
        key: attribute.key,
        value: attribute.value ?? '',
        original: attribute.key,
      })),
      tags: [...candidate.tags],
    },
    countryHint: text !== '' && code === '' ? text : null,
  };
}

function exactCountry(text: string): string {
  const upper = text.toUpperCase();
  if (isCountryCode(upper)) return upper;
  const folded = foldText(text);
  for (const language of ['sl', 'en'] as const) {
    const match = allCountries(language).find((option) => foldText(option.name) === folded);
    if (match) return match.code;
  }
  return '';
}

/** Telo zahtevka: obrezane vrednosti, prazno polje `null`, popolnoma prazne vrstice atributov se ne pošljejo. */
function toInput(values: FormValues): { input: ContactInput; rows: AttributeRow[] } {
  const optional = (value: string) => (value.trim() === '' ? null : value.trim());
  const rows = values.attributes.filter((row) => row.key.trim() !== '' || row.value.trim() !== '');
  return {
    input: {
      firstName: optional(values.firstName),
      lastName: optional(values.lastName),
      company: optional(values.company),
      address: optional(values.address),
      country: optional(values.country),
      email: optional(values.email),
      phone: optional(values.phone),
      attributes: rows.map((row) => ({
        key: row.key.trim(),
        // 016: tip se pošlje samo za nov ključ z izbranim tipom; za obstoječ ključ velja tip ključa.
        ...(!row.typeLocked && row.type && row.type !== 'OTHER' ? { type: row.type } : {}),
        // Opombe so dobesedne (FR-016-07): brez obreza vrednosti.
        value: row.type === 'NOTES' ? row.value : row.value.trim(),
      })),
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
  prefill,
}: {
  contact?: ContactDetail;
  labelledBy: string;
  /** 014: podatki iz kode QR za nov kontakt (FR-014-18). */
  prefill?: CardCandidate;
}) {
  const { t } = useTranslation();
  const api = useContactsApi();
  const keyLookup = useKeyLookup();
  const { group } = useGroup();
  const location = useLocation();
  const navigate = useNavigate();
  const prefix = useId();
  const [initial] = useState(() => (prefill && !contact ? fromCandidate(prefill) : null));
  const [values, setValues] = useState<FormValues>(() =>
    contact ? fromContact(contact) : (initial?.values ?? EMPTY),
  );
  const [baseline, setBaseline] = useState(() => serialize(contact ? fromContact(contact) : EMPTY));
  const [version, setVersion] = useState(contact?.version ?? 0);
  const [errors, setErrors] = useState<Record<string, ErrorKey>>(() =>
    initial ? validate(initial.values) : {},
  );
  const countryHint = initial?.countryHint ?? null;
  const [summary, setSummary] = useState(false);
  const [failure, setFailure] = useState<FailureKey | null>(null);
  const [conflict, setConflict] = useState<ContactDetail | null>(null);
  const [tooMany, setTooMany] = useState(false);
  const [busy, setBusy] = useState(false);
  const [focusTarget, setFocusTarget] = useState<{ id: string } | null>(null);
  const [transfer, setTransfer] = useState<TransferRequest | null>(null);
  const [transferFailed, setTransferFailed] = useState<string | null>(null);
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
      attributes: current.attributes.map((row) => {
        if (row.id !== id) return row;
        const changed = { ...row, [part]: value };
        // Drug ključ nima tipa prejšnjega: izbira tipa spet prosta (nov ključ → OTHER), dokler iskanje ne najde ključa.
        if (
          part === 'key' &&
          row.typeLocked &&
          normalizeKey(value.trim()) !== normalizeKey(row.key.trim())
        ) {
          return { ...changed, typeLocked: false, type: 'OTHER' };
        }
        return changed;
      }),
    }));
    setErrors((current) => {
      const next = { ...current };
      delete next[`attributes.${id}.${part}`];
      if (part === 'key') delete next[`attributes.${id}.type`];
      return next;
    });
  };

  const setType = (id: string, type: AttributeType) => {
    setValues((current) => ({
      ...current,
      attributes: current.attributes.map((row) => (row.id === id ? { ...row, type } : row)),
    }));
    setErrors((current) => {
      const next = { ...current };
      delete next[`attributes.${id}.type`];
      delete next[`attributes.${id}.value`];
      return next;
    });
  };

  /** Ključ skupine ima svoj tip (FR-016-01): vrstica ga prevzame in izbira tipa se zaklene; nov ključ ostane prost. */
  const lookupKey = async (id: string, text: string) => {
    const found = await keyLookup(text);
    setValues((current) => ({
      ...current,
      attributes: current.attributes.map((row) => {
        if (row.id !== id || normalizeKey(row.key.trim()) !== normalizeKey(text.trim())) return row;
        if (found?.attributeType) return { ...row, type: found.attributeType, typeLocked: true };
        return row.typeLocked ? { ...row, typeLocked: false, type: 'OTHER' } : row;
      }),
    }));
  };

  const addRow = () => {
    if (values.attributes.length >= LIMITS.attributes) {
      setTooMany(true);
      return;
    }
    const id = newRowId();
    setValues((current) => ({
      ...current,
      attributes: [
        ...current.attributes,
        { id, key: '', value: '', type: 'OTHER', typeLocked: false },
      ],
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

  /** Prenos je samo sprememba stanja obrazca (FR-013-20): vrednost gre v polje, vrstica atributa se odstrani. */
  const finishTransfer = (rowId: string, field: 'company' | 'country', value: string | null) => {
    setValues((current) => ({
      ...current,
      ...(value === null ? {} : { [field]: value }),
      attributes: current.attributes.filter((row) => row.id !== rowId),
    }));
    setErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
    setTransfer(null);
    setTransferFailed(null);
    setFocusTarget({ id: domId(field) });
  };

  const startTransfer = async (rowId: string) => {
    const row = values.attributes.find((candidate) => candidate.id === rowId);
    const field = row ? reservedFieldOf(row.key) : null;
    if (!row || !field) return;
    const attribute = row.value.trim();
    setTransferFailed(null);
    if (field === 'company') {
      const current = values.company.trim();
      if (current === '' || current === attribute) finishTransfer(rowId, 'company', attribute);
      else
        setTransfer({ rowId, kind: 'company', mode: 'conflict', attribute, fieldValue: current });
      return;
    }
    try {
      const { results } = await api.resolveCountries([attribute]);
      const result = results[0];
      if (result?.status === 'FOUND' && result.code) {
        if (values.country === '' || values.country === result.code) {
          finishTransfer(rowId, 'country', result.code);
        } else {
          setTransfer({
            rowId,
            kind: 'country',
            mode: 'conflict',
            attribute,
            fieldValue: values.country,
            found: result.code,
          });
        }
      } else {
        setTransfer({
          rowId,
          kind: 'country',
          mode: 'pick',
          attribute,
          candidates: result?.status === 'AMBIGUOUS' ? (result.candidates ?? []) : [],
        });
      }
    } catch {
      setTransferFailed(rowId);
    }
  };

  // Vrstice atributov so memoizirane (do 50 vrstic); stabilni vmesnik vedno kliče najnovejše rokovalnike.
  const latest = useRef({ setRow, setType, lookupKey, blur, removeRow, startTransfer });
  useEffect(() => {
    latest.current = { setRow, setType, lookupKey, blur, removeRow, startTransfer };
  });
  const [rowActions] = useState<RowActions>(() => ({
    setRow: (id, part, value) => latest.current.setRow(id, part, value),
    setType: (id, type) => latest.current.setType(id, type),
    lookupKey: (id, text) => void latest.current.lookupKey(id, text),
    blur: (field) => latest.current.blur(field),
    removeRow: (id) => latest.current.removeRow(id),
    transfer: (id) => void latest.current.startTransfer(id),
  }));
  // Podpis ključev vseh vrstic: vrstica izloči iz predlogov ključe drugih vrstic (memoizacija ostane veljavna).
  const keysSignature = values.attributes.map((row) => normalizeKey(row.key.trim())).join('\u0000');

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
          const typed = /^attributes\[(\d+)\]\.(type|value)$/.exec(field);
          const sentTyped = typed ? rows[Number(typed[1])] : undefined;
          if (typed && sentTyped && code === 'INVALID_VALUE') {
            // 016: neveljavna vrednost za tip ključa ali tip, ki ni tip ključa v uporabi.
            mapped[`attributes.${sentTyped.id}.${typed[2]}`] =
              typed[2] === 'type'
                ? 'attributes.type.mismatch'
                : `typedValue.errors.INVALID_VALUE.${sentTyped.type ?? 'OTHER'}`;
            continue;
          }
          const key = serverErrorKey(field, code);
          if (!key) continue;
          const row = /^attributes\[(\d+)\]\.(key|value)$/.exec(field);
          if (row) {
            const sent = rows[Number(row[1])];
            if (sent) {
              mapped[`attributes.${sent.id}.${row[2]}`] =
                code === 'RESERVED_KEY' ? reservedKeyError(sent.key) : key;
            }
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
    'company',
    'address',
    'country',
    'email',
    'phone',
    ...values.attributes.flatMap((row) => [
      `attributes.${row.id}.key`,
      `attributes.${row.id}.type`,
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

  const countryList = t('contacts.form.countryList');
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
      {initial && <p role="status">{t('contacts.form.qrPrefilled')}</p>}
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
          <div className="flex flex-col gap-1">
            <label htmlFor={domId('company')} className="font-bold">
              {t('contacts.form.company')}
            </label>
            <SuggestInput
              id={domId('company')}
              type="company"
              value={values.company}
              onChange={(text) => setField('company', text)}
              onBlur={() => blur('company')}
              listLabel={t('contacts.form.companySuggestions')}
              {...describe('company')}
            />
            {message('company')}
          </div>
          {textField('address', t('contacts.form.address'))}
          <div className="flex flex-col gap-1">
            <label htmlFor={domId('country')} className="font-bold">
              {t('contacts.form.country')}
            </label>
            <CountryField
              id={domId('country')}
              value={values.country}
              onChange={(code) => {
                setValues((current) => ({ ...current, country: code }));
                setErrors((current) => {
                  const next = { ...current };
                  delete next.country;
                  return next;
                });
              }}
              listLabel={countryList}
              {...describe('country')}
            />
            {message('country')}
            {countryHint && !values.country && (
              <p role="note" className="text-muted-foreground">
                {t('contacts.form.qrCountryHint', { text: countryHint })}
              </p>
            )}
          </div>
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
              typeError={errors[`attributes.${row.id}.type`]}
              valueError={errors[`attributes.${row.id}.value`]}
              keysSignature={keysSignature}
              transferFailed={transferFailed === row.id}
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

      {transfer && (
        <AttributeTransferDialog
          request={transfer}
          onDecide={(value) => finishTransfer(transfer.rowId, transfer.kind, value)}
          onCancel={() => setTransfer(null)}
        />
      )}

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
  setType: (id: string, type: AttributeType) => void;
  lookupKey: (id: string, text: string) => void;
  blur: (field: string) => void;
  removeRow: (id: string) => void;
  transfer: (id: string) => void;
}

/** Vrstica dodatnega atributa: ključ, vrednost in odstranitev (FR-004-02); memoizirana zaradi do 50 vrstic. */
const AttributeFields = memo(function AttributeFields({
  row,
  prefix,
  keyError,
  typeError,
  valueError,
  keysSignature,
  transferFailed,
  actions,
}: {
  row: AttributeRow;
  prefix: string;
  keyError: ErrorKey | undefined;
  typeError: ErrorKey | undefined;
  valueError: ErrorKey | undefined;
  /** Normalizirani ključi vseh vrstic (ločeni z `\u0000`): vrstica izloči ključe drugih vrstic iz predlogov. */
  keysSignature: string;
  transferFailed: boolean;
  actions: RowActions;
}) {
  const { t } = useTranslation();
  const keyField = `attributes.${row.id}.key`;
  const valueField = `attributes.${row.id}.value`;
  const typeField = `attributes.${row.id}.type`;
  const type: AttributeType = row.type ?? 'OTHER';
  const domId = (field: string) => `${prefix}-${field}`;
  const errorId = (field: string) => `${prefix}-${field}-error`;
  const describe = (field: string, error: ErrorKey | undefined) =>
    error ? { 'aria-invalid': true, 'aria-describedby': errorId(field) } : {};
  // Predlogi ključev: brez ključev drugih vrstic in rezerviranih imen (FR-013-09).
  const others = keysSignature.split('\u0000');
  const own = others.indexOf(normalizeKey(row.key.trim()));
  if (own >= 0) others.splice(own, 1);
  const taken = new Set(others.filter((key) => key !== ''));
  const excludeKey = (text: string) => taken.has(normalizeKey(text.trim())) || isReservedName(text);
  const transferField =
    row.original !== undefined && normalizeKey(row.original.trim()) === normalizeKey(row.key.trim())
      ? reservedFieldOf(row.key)
      : null;
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
        <SuggestInput
          id={domId(keyField)}
          type="key"
          value={row.key}
          onChange={(text) => actions.setRow(row.id, 'key', text)}
          onBlur={() => {
            actions.blur(keyField);
            actions.lookupKey(row.id, row.key);
          }}
          exclude={excludeKey}
          canonical="key"
          showCount
          listLabel={t('contacts.form.keySuggestions')}
          onSelect={(text) => {
            actions.lookupKey(row.id, text);
            document.getElementById(domId(valueField))?.focus();
          }}
          {...describe(keyField, keyError)}
        />
        {message(keyField, keyError)}
      </div>
      {row.typeLocked ? (
        type !== 'OTHER' && (
          <p className="flex min-w-40 basis-full flex-col gap-1">
            <span className="font-bold">{t('attributes.type.label')}</span>
            <span id={`${domId(typeField)}-fixed`}>
              {t('attributes.type.fixed', { type: t(typeNameKey(type)) })}
            </span>
          </p>
        )
      ) : (
        <div className="flex min-w-40 flex-1 flex-col gap-1">
          <TypeSelect
            id={domId(typeField)}
            value={type}
            onChange={(next) => actions.setType(row.id, next)}
            aria-describedby={typeError ? errorId(typeField) : `${domId(typeField)}-hint`}
            aria-invalid={typeError ? true : undefined}
          />
          <p id={`${domId(typeField)}-hint`} className="text-sm text-muted-foreground">
            {t('attributes.type.hint')}
          </p>
          {message(typeField, typeError)}
        </div>
      )}
      <div className="flex min-w-40 flex-[2] flex-col gap-1">
        <label htmlFor={domId(valueField)} className="font-bold">
          {t('contacts.form.value')}
        </label>
        <TypedValueInput
          id={domId(valueField)}
          type={type}
          keyParam={row.key}
          value={row.value}
          onChange={(text) => actions.setRow(row.id, 'value', text)}
          onBlur={() => actions.blur(valueField)}
          listLabel={t('contacts.form.valueSuggestions')}
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
      {transferField && (
        <div className="flex basis-full flex-col items-start gap-2 rounded-md bg-muted p-3">
          <p id={`${domId(keyField)}-note`}>{t(`contacts.transfer.note.${transferField}`)}</p>
          <button
            type="button"
            aria-describedby={`${domId(keyField)}-note`}
            onClick={() => actions.transfer(row.id)}
            className={secondaryButton}
          >
            {t(`contacts.transfer.action.${transferField}`)}
          </button>
          {transferFailed && (
            <p role="alert" className={fieldError}>
              {t('contacts.transfer.failed')}
            </p>
          )}
        </div>
      )}
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
