import { IconAlertTriangle, IconX } from '@tabler/icons-react';
import { type TFunction } from 'i18next';
import { useCallback, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { ApiError } from '../../../shared/api/client';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '../../../shared/ui/dialog';
import {
  errorAlert,
  fieldError,
  ghostButton,
  primaryButton,
  secondaryButton,
  textInput,
} from '../../../shared/ui/styles';
import { typeNameKey } from '../../attributes/typeNames';
import type { AttributeType } from '../../attributes/types';
import { useGroup } from '../../groups/groupContext';
import { useKeyLookup } from '../api';
import { CountryField } from '../CountryField';
import { SuggestInput } from '../SuggestInput';
import { TagInput } from '../TagInput';
import { TypeSelect } from '../typed/TypeSelect';
import { TypedValueInput } from '../typed/TypedValueInput';
import type {
  AttributeSet,
  BulkContactErrors,
  BulkField,
  BulkFieldError,
  BulkUpdateRequest,
  BulkUpdateResult,
} from '../types';
import { isReservedName, reservedKeyError } from '../validation';
import { useSelectionApi } from './api';
import { bulkFailure } from './bulkFailure';
import { SelectionChangedNotice } from './SelectionChangedNotice';
import { useSelection } from './selectionContext';
import { useSelectionCheck } from './useSelectionCheck';

const MAX_ATTRIBUTES = 10;
const MAX_NAMES = 10;
const FIELDS: BulkField[] = ['company', 'address', 'country', 'email', 'phone', 'custom'];

interface Row {
  id: number;
  field: BulkField;
  key: string;
  value: string;
  /** 016: tip ključa (`custom`); zaklenjen, kadar ključ skupina že ima. */
  type: AttributeType;
  typeLocked: boolean;
}

/** Napake `400 VALIDATION_FAILED`: po vrsticah atributov, po kontaktih in ostale (brez vrstice). */
interface Problems {
  rows: Record<number, { key?: string; value?: string; field?: string; type?: string }>;
  contacts: BulkContactErrors[];
  other: string[];
}

function parseProblems(error: unknown, rows: Row[]): Problems | null {
  if (!(error instanceof ApiError) || error.status !== 400 || error.code !== 'VALIDATION_FAILED') {
    return null;
  }
  const body = (error.body ?? {}) as { errors?: BulkFieldError[]; contacts?: BulkContactErrors[] };
  const problems: Problems = { rows: {}, contacts: body.contacts ?? [], other: [] };
  for (const item of body.errors ?? []) {
    const match = /^attributes\[(\d+)\]\.(field|key|value|type)$/.exec(item.field);
    const row = match ? rows[Number(match[1])] : undefined;
    if (match?.[2] && row) {
      const part = match[2] as 'field' | 'key' | 'value' | 'type';
      problems.rows[row.id] = { ...problems.rows[row.id], [part]: item.code };
    } else {
      problems.other.push(item.code);
    }
  }
  // 016: vrednost, neveljavna za tip ključa, je napaka končnega stanja kontakta (`attributes[i].value`).
  for (const contact of problems.contacts) {
    for (const item of contact.errors) {
      const match = /^attributes\[(\d+)\]\.value$/.exec(item.field);
      const row = match ? rows[Number(match[1])] : undefined;
      if (row && !problems.rows[row.id]?.value) {
        problems.rows[row.id] = { ...problems.rows[row.id], value: item.code };
      }
    }
  }
  return problems;
}

/** Besedilo napake po kontaktih (FR-009-09): do 10 imen, nato »… in še N«. */
function contactsMessage(contacts: BulkContactErrors[], t: TFunction): string {
  const line = (
    field: 'tags' | 'attributes',
    key: 'contacts.bulk.tooManyTagsFor' | 'contacts.bulk.tooManyAttributesFor',
  ) => {
    const affected = contacts.filter((contact) =>
      contact.errors.some((error) => error.field === field),
    );
    if (affected.length === 0) return null;
    const names = affected.slice(0, MAX_NAMES).map((contact) => contact.displayName);
    const rest = affected.length - names.length;
    const list =
      rest > 0
        ? `${names.join(', ')}, ${t('contacts.bulk.andMore', { count: rest })}`
        : names.join(', ');
    return t(key, { count: affected.length, names: list });
  };
  const invalid = contacts.filter((contact) =>
    contact.errors.some((error) => /^attributes\[\d+\]\.value$/.test(error.field)),
  );
  const invalidLine =
    invalid.length === 0
      ? null
      : t('contacts.bulk.invalidValueFor', {
          count: invalid.length,
          names: (() => {
            const names = invalid.slice(0, MAX_NAMES).map((contact) => contact.displayName);
            const rest = invalid.length - names.length;
            return rest > 0
              ? `${names.join(', ')}, ${t('contacts.bulk.andMore', { count: rest })}`
              : names.join(', ');
          })(),
        });
  return [
    line('tags', 'contacts.bulk.tooManyTagsFor'),
    line('attributes', 'contacts.bulk.tooManyAttributesFor'),
    invalidLine,
  ]
    .filter((part): part is string => part !== null)
    .join(' ');
}

/**
 * Dialog »Uredi izbrane« (FR-009-06 … FR-009-09, FR-009-12, FR-009-17; design.md 8.10, 8.13): *Dodaj značke*, *Odstrani
 * značke* (TagInput 004) in vrstice *Nastavi atribut* (do 10; ime in priimek se ne uredita). *Uporabi* pošlje
 * preverjanje izbora (FR-009-18) in operacijo; napake (po poljih, po kontaktih, 403, arhivirana, omrežje) ostanejo
 * nad obrazcem z ohranjenimi vnosi, uspeh dialog zapre.
 */
export function BulkEditDialog({
  onClose,
  onApplied,
}: {
  /** Zaprt brez uporabe (*Prekliči*, *Esc*): fokus se vrne na *Uredi izbrane*. */
  onClose: () => void;
  /** Operacija je uspela (dialog se zapre, seznam se osveži). */
  onApplied: () => void;
}) {
  const { t } = useTranslation();
  const api = useSelectionApi();
  const { group } = useGroup();
  const selection = useSelection();
  const [addTags, setAddTags] = useState<string[]>([]);
  const [removeTags, setRemoveTags] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [empty, setEmpty] = useState(false);
  const nextId = useRef(1);
  const groupId = useId();
  const request = useRef<Omit<BulkUpdateRequest, 'contactIds'>>({});

  const run = useCallback(
    (ids: string[]) => api.bulkUpdate(group.id, { contactIds: ids, ...request.current }),
    [api, group.id],
  );
  const onSuccess = useCallback(
    (result: BulkUpdateResult) => {
      toast(
        result.changed === 0
          ? t('contacts.bulk.unchanged')
          : t('contacts.bulk.updated', { count: result.changed }),
      );
      onApplied();
    },
    [t, onApplied],
  );
  const check = useSelectionCheck({ run, onSuccess });
  const problems = check.error === null ? null : parseProblems(check.error, rows);
  const failure = check.error === null ? null : bulkFailure(check.error, t, 'contacts.bulk.failed');
  const count = selection.count;

  const patch = (id: number, change: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...change } : row)));

  const apply = () => {
    const attributes: AttributeSet[] = rows.map((row) =>
      row.field === 'custom'
        ? {
            field: 'custom',
            key: row.key,
            // 016: tip se pošlje samo za nov ključ z izbranim tipom.
            ...(!row.typeLocked && row.type !== 'OTHER' ? { type: row.type } : {}),
            value: row.value,
          }
        : { field: row.field, value: row.value },
    );
    request.current = {
      ...(addTags.length > 0 ? { addTags } : {}),
      ...(removeTags.length > 0 ? { removeTags } : {}),
      ...(attributes.length > 0 ? { attributes } : {}),
    };
    if (Object.keys(request.current).length === 0) {
      setEmpty(true);
      return;
    }
    setEmpty(false);
    void check.submit();
  };

  const alertText = problems
    ? [
        t('contacts.bulk.failed'),
        contactsMessage(problems.contacts, t),
        ...problems.other.map((code) => t(`contacts.bulk.errors.${code}`, { defaultValue: '' })),
      ]
        .filter((part) => part !== '')
        .join(' ')
    : (failure?.text ?? null);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent wide onInteractOutside={(event) => event.preventDefault()}>
        <DialogTitle>{t('contacts.bulk.editTitle', { count })}</DialogTitle>
        {check.notice && (
          <SelectionChangedNotice
            notice={check.notice}
            removeNoLonger={check.removeNoLonger}
            onRemoveNoLonger={check.setRemoveNoLonger}
            onUpdate={check.updateSelection}
            onContinue={() => void check.continueAnyway()}
            onRemoveMissing={check.removeMissing}
            busy={check.busy}
          />
        )}
        {(alertText || empty) && (
          <div role="alert" className={errorAlert}>
            <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
            <span className="flex flex-wrap items-center gap-3">
              {empty ? t('contacts.bulk.errors.EMPTY_OPERATION') : alertText}
              {!empty && failure?.retry && !problems && (
                <button type="button" className={secondaryButton} onClick={apply}>
                  {t('contacts.bulk.retry')}
                </button>
              )}
            </span>
          </div>
        )}
        <TagInput
          tags={addTags}
          onChange={setAddTags}
          label={t('contacts.bulk.addTags')}
          listLabel={t('contacts.bulk.addTagsList')}
        />
        <TagInput
          tags={removeTags}
          onChange={setRemoveTags}
          label={t('contacts.bulk.removeTags')}
          listLabel={t('contacts.bulk.removeTagsList')}
        />
        <fieldset aria-labelledby={groupId} className="flex flex-col gap-3">
          <legend id={groupId} className="font-bold">
            {t('contacts.bulk.setAttribute')}
          </legend>
          {rows.map((row, index) => (
            <AttributeRow
              key={row.id}
              n={index + 1}
              row={row}
              problems={problems?.rows[row.id]}
              onChange={(change) => patch(row.id, change)}
              onRemove={() => setRows((current) => current.filter((item) => item.id !== row.id))}
            />
          ))}
          <div>
            <button
              type="button"
              className={secondaryButton}
              disabled={rows.length >= MAX_ATTRIBUTES}
              onClick={() => {
                setRows((current) => [
                  ...current,
                  {
                    id: nextId.current++,
                    field: 'address',
                    key: '',
                    value: '',
                    type: 'OTHER',
                    typeLocked: false,
                  },
                ]);
              }}
            >
              {t('contacts.bulk.addAttribute')}
            </button>
          </div>
        </fieldset>
        <div className="flex flex-wrap justify-end gap-3">
          <DialogClose className={ghostButton}>{t('contacts.bulk.cancel')}</DialogClose>
          <button
            type="button"
            className={primaryButton}
            aria-disabled={check.busy}
            onClick={() => {
              if (!check.busy) apply();
            }}
          >
            {check.busy ? t('contacts.bulk.applying') : t('contacts.bulk.apply', { count })}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AttributeRow({
  n,
  row,
  problems,
  onChange,
  onRemove,
}: {
  n: number;
  row: Row;
  problems: { key?: string; value?: string; field?: string; type?: string } | undefined;
  onChange: (change: Partial<Row>) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const keyLookup = useKeyLookup();
  const base = useId();
  const hintId = `${base}-hint`;
  const message = (code: string | undefined) =>
    code ? t(`contacts.bulk.errors.${code}`, { defaultValue: t('contacts.bulk.failed') }) : null;
  // RESERVED_KEY napoti na polje *Podjetje* oziroma *Država* (FR-013-08).
  const keyError =
    problems?.key === 'RESERVED_KEY' ? t(reservedKeyError(row.key)) : message(problems?.key);
  // 016: napaka vrednosti po tipu ključa (npr. »Vpiši veljaven e-naslov.«).
  const valueError =
    row.field === 'custom' && problems?.value === 'INVALID_VALUE'
      ? t(`typedValue.errors.INVALID_VALUE.${row.type}`)
      : row.field === 'custom' && problems?.value === 'TOO_LONG'
        ? t('typedValue.errors.TOO_LONG')
        : message(problems?.value);
  const typeError = problems?.type ? t('attributes.type.mismatch') : null;
  /** Ključ skupine ima svoj tip: vrstica ga prevzame in izbira tipa se zaklene; nov ključ ostane prost. */
  const lookup = (text: string) => {
    void keyLookup(text).then((found) => {
      if (found?.attributeType) onChange({ type: found.attributeType, typeLocked: true });
      else onChange({ typeLocked: false });
    });
  };
  const valueProps = {
    id: `${base}-value`,
    value: row.value,
    'aria-invalid': valueError !== null,
    'aria-describedby': valueError ? `${hintId} ${base}-value-error` : hintId,
  };
  const valueInput =
    row.field === 'country' ? (
      <CountryField
        {...valueProps}
        onChange={(value) => onChange({ value })}
        listLabel={t('contacts.form.countryList')}
      />
    ) : row.field === 'custom' ? (
      <TypedValueInput
        {...valueProps}
        type={row.type}
        keyParam={row.key}
        onChange={(value) => onChange({ value })}
        listLabel={t('contacts.form.valueSuggestions')}
      />
    ) : row.field === 'company' ? (
      <SuggestInput
        {...valueProps}
        type="company"
        onChange={(value) => onChange({ value })}
        listLabel={t('contacts.form.companySuggestions')}
      />
    ) : (
      <input
        {...valueProps}
        type="text"
        onChange={(event) => onChange({ value: event.target.value })}
        className={textInput}
      />
    );
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <div className="flex flex-col gap-1">
        <label htmlFor={`${base}-field`} className="font-bold">
          {t('contacts.bulk.attribute', { n })}
        </label>
        <select
          id={`${base}-field`}
          value={row.field}
          onChange={(event) => {
            const field = event.target.value as BulkField;
            // Država ima izbirnik s kodami: vrednost drugega polja ni veljavna koda in obratno.
            onChange({
              field,
              ...((field === 'country') !== (row.field === 'country') ? { value: '' } : {}),
              ...(field === 'custom' ? {} : { type: 'OTHER', typeLocked: false }),
            });
          }}
          className={textInput}
        >
          {FIELDS.map((field) => (
            <option key={field} value={field}>
              {t(`contacts.bulk.field.${field}`)}
            </option>
          ))}
        </select>
      </div>
      {row.field === 'custom' && (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${base}-key`} className="font-bold">
            {t('contacts.bulk.key', { n })}
          </label>
          <SuggestInput
            id={`${base}-key`}
            type="key"
            value={row.key}
            aria-invalid={keyError !== null}
            aria-describedby={keyError ? `${base}-key-error` : undefined}
            onChange={(key) =>
              onChange({
                key,
                // Drug ključ nima tipa prejšnjega: izbira spet prosta, dokler iskanje ne najde ključa.
                ...(row.typeLocked ? { typeLocked: false, type: 'OTHER' } : {}),
              })
            }
            onBlur={() => lookup(row.key)}
            onSelect={lookup}
            exclude={isReservedName}
            canonical="key"
            showCount
            listLabel={t('contacts.form.keySuggestions')}
          />
          {keyError && (
            <p id={`${base}-key-error`} className={fieldError}>
              {keyError}
            </p>
          )}
        </div>
      )}
      {row.field === 'custom' &&
        (row.typeLocked ? (
          row.type !== 'OTHER' && (
            <p className="flex flex-col gap-1">
              <span className="font-bold">{t('attributes.type.label')}</span>
              <span>{t('attributes.type.fixed', { type: t(typeNameKey(row.type)) })}</span>
            </p>
          )
        ) : (
          <div className="flex flex-col gap-1">
            <TypeSelect
              id={`${base}-type`}
              value={row.type}
              onChange={(type) => onChange({ type })}
              aria-describedby={typeError ? `${base}-type-error` : undefined}
              aria-invalid={typeError ? true : undefined}
            />
            {typeError && (
              <p id={`${base}-type-error`} className={fieldError}>
                {typeError}
              </p>
            )}
          </div>
        ))}
      <div className="flex flex-col gap-1">
        <label htmlFor={`${base}-value`} className="font-bold">
          {t('contacts.bulk.value', { n })}
        </label>
        {valueInput}
        <p id={hintId} className="text-sm text-muted-foreground">
          {t('contacts.bulk.valueHint')}
        </p>
        {valueError && (
          <p id={`${base}-value-error`} className={fieldError}>
            {valueError}
          </p>
        )}
      </div>
      <div>
        <button
          type="button"
          className={secondaryButton}
          aria-label={t('contacts.bulk.removeAttribute', { n })}
          onClick={onRemove}
        >
          <IconX aria-hidden="true" size={16} stroke={1.75} />
        </button>
      </div>
    </div>
  );
}
