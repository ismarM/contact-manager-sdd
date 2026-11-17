import {
  IconAlertTriangle,
  IconArrowLeft,
  IconChevronLeft,
  IconChevronRight,
  IconFileImport,
  IconFileSpreadsheet,
  IconUpload,
} from '@tabler/icons-react';
import type { TFunction } from 'i18next';
import { useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';

import { ApiError } from '../../shared/api/client';
import { useDocumentTitle } from '../../shared/lib/useDocumentTitle';
import { NotFoundPage } from '../../shared/pages/NotFoundPage';
import {
  backLink,
  card,
  errorAlert,
  fieldError,
  focusRing,
  ghostButton,
  primaryButton,
  secondaryButton,
  textInput,
  warningAlert,
} from '../../shared/ui/styles';
import { ATTRIBUTE_TYPES, type AttributeType } from '../attributes/types';
import { typeNameKey } from '../attributes/typeNames';
import { canEditContacts } from '../contacts/contactRouting';
import { allCountries, countryName } from '../contacts/countries';
import { useUiLanguage } from '../contacts/useUiLanguage';
import { useFormatters } from '../formats/useFormatters';
import { useGroup } from '../groups/groupContext';
import { useImportApi } from './api';
import { type MappingError, mappingErrors, TARGETS, toCandidates } from './mapping';
import type {
  Candidate,
  ColumnMapping,
  ImportCards,
  ImportContact,
  ImportSheet,
  ImportSource,
  PreviewRow,
} from './types';

const PAGE = 25;
const MAX_FILE = 10 * 1024 * 1024;
const link = `inline-flex items-center gap-1 self-start ${backLink}`;

type Decision = 'skip' | 'create';

/**
 * Uvoz kontaktov iz Excela ali vizitk (FR-014-01 … -09, -13; design.md 8.6, 8.9, 8.13): datoteka → preslikava stolpcev
 * (Excel) → predogled z napakami, državami in dvojniki → atomarna potrditev. Datoteka se ne hrani; predogled ostane ob
 * neuspehu potrditve.
 */
export function ImportPage() {
  const { t } = useTranslation();
  const { group } = useGroup();
  const location = useLocation();
  const navigate = useNavigate();
  const api = useImportApi();
  const language = useUiLanguage();
  const params = new URLSearchParams(location.search);
  const source: ImportSource = params.get('source') === 'vcf' ? 'VCF' : 'XLSX';
  const fileId = useId();
  const list = `/groups/${group.id}/contacts`;

  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ImportSheet | ImportCards | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [mapping, setMapping] = useState<ColumnMapping[]>([]);
  const [preview, setPreview] = useState<{ candidates: Candidate[]; rows: PreviewRow[] } | null>(
    null,
  );
  const [checking, setChecking] = useState(false);
  const [previewFailed, setPreviewFailed] = useState<string | null>(null);
  const [previewReload, setPreviewReload] = useState(0);
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  const [countries, setCountries] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  const [importing, setImporting] = useState(false);
  const [importFailed, setImportFailed] = useState<string | null>(null);

  useDocumentTitle(
    t('title.groupScreen', {
      screen: t(source === 'VCF' ? 'import.screenVcf' : 'import.screenXlsx'),
      group: group.title,
    }),
  );

  const errors = useMemo(() => mappingErrors(mapping), [mapping]);
  const candidates = useMemo<Candidate[] | null>(() => {
    if (!parsed) return null;
    if (parsed.format === 'VCF') return parsed.candidates;
    return errors.size > 0 ? null : toCandidates(parsed, mapping);
  }, [parsed, mapping, errors]);

  useEffect(() => {
    if (!candidates || candidates.length === 0) return undefined;
    let active = true;
    const timer = setTimeout(() => {
      setChecking(true);
      setPreviewFailed(null);
      api.preview(group.id, candidates).then(
        (result) => {
          if (!active) return;
          setPreview({ candidates, rows: result.rows });
          setChecking(false);
        },
        (error: unknown) => {
          if (!active) return;
          setChecking(false);
          setPreviewFailed(failure(error, t));
        },
      );
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, group.id, candidates, previewReload, t]);

  if (!canEditContacts(group)) return <NotFoundPage />;

  const read = async () => {
    setFileError(null);
    if (!file) {
      setFileError(t('import.fileErrors.REQUIRED'));
      return;
    }
    if (file.size > MAX_FILE) {
      setFileError(t('import.fileErrors.FILE_TOO_LARGE'));
      return;
    }
    setReading(true);
    try {
      const result = await api.parse(group.id, file, source, language);
      setParsed(result);
      setPreview(null);
      setDecisions({});
      setCountries({});
      setPage(0);
      if (result.format === 'XLSX') setMapping(result.suggestedMapping);
    } catch (error) {
      setFileError(fileFailure(error, t));
    } finally {
      setReading(false);
    }
  };

  const rows = preview?.rows ?? [];
  const rowNumber = (index: number) =>
    parsed?.format === 'XLSX' ? (parsed.rows[index]?.rowNumber ?? index + 2) : index + 1;
  const valid = rows.filter((row) => row.errors.length === 0);
  const decision = (row: PreviewRow): Decision => decisions[row.index] ?? 'skip';
  const ready = valid.filter((row) => !row.duplicate || decision(row) === 'create');
  const skipped = valid.length - ready.length;
  const invalid = rows.length - valid.length;
  const unresolvedValues = [
    ...new Map(
      ready
        .filter((row) => row.country.status === 'AMBIGUOUS' || row.country.status === 'UNKNOWN')
        .map((row) => [preview!.candidates[row.index]!.countryText ?? '', row.country] as const),
    ),
  ];
  const unresolved = unresolvedValues.some(
    ([text]) => countries[text] === undefined || countries[text] === '',
  );

  const confirm = async () => {
    if (!preview || importing) return;
    setImporting(true);
    setImportFailed(null);
    const contacts: ImportContact[] = ready.map((row) => {
      const candidate = preview.candidates[row.index]!;
      const chosen = countries[candidate.countryText ?? ''];
      const country =
        row.country.status === 'FOUND'
          ? row.country.code
          : row.country.status === 'EMPTY' || chosen === '-' || chosen === undefined
            ? null
            : chosen;
      return {
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        address: candidate.address,
        ...(candidate.addressParts ? { addressParts: candidate.addressParts } : {}),
        email: candidate.email,
        phone: candidate.phone,
        company: candidate.company,
        country,
        attributes: candidate.attributes,
        tags: candidate.tags,
      };
    });
    try {
      const result = await api.commit(group.id, source, contacts);
      const done = t('import.done', { count: result.created });
      toast.success(skipped > 0 ? `${done} ${t('import.doneSkipped', { count: skipped })}` : done);
      void navigate(list);
    } catch (error) {
      setImportFailed(
        error instanceof ApiError && error.code === 'GROUP_ARCHIVED'
          ? t('import.archived')
          : error instanceof ApiError
            ? t('import.failed')
            : t('groups.offline'),
      );
    } finally {
      setImporting(false);
    }
  };

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = rows.slice(page * PAGE, page * PAGE + PAGE);

  return (
    <div className="mx-auto flex w-full max-w-[60rem] flex-col gap-6 px-4 py-6">
      <div className="flex flex-col gap-2">
        <Link to={list} className={link}>
          <IconArrowLeft aria-hidden="true" size={20} stroke={1.75} />
          {t('import.back')}
        </Link>
        <h2 className="text-2xl font-bold">
          {t(source === 'VCF' ? 'import.screenVcf' : 'import.screenXlsx')}
        </h2>
      </div>

      <section
        aria-label={t('import.fileSection')}
        className={`${card} flex flex-wrap items-end gap-4 p-4 sm:p-6`}
      >
        <div className="flex min-w-0 flex-1 basis-80 flex-col gap-1">
          <label htmlFor={fileId} className="font-bold">
            {t(source === 'VCF' ? 'import.fileVcf' : 'import.fileXlsx')}
          </label>
          <input
            id={fileId}
            type="file"
            accept={
              source === 'VCF'
                ? '.vcf,text/vcard,text/x-vcard'
                : '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            }
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className={`${textInput} max-w-full`}
          />
          {file && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <IconFileSpreadsheet aria-hidden="true" size={16} stroke={1.75} />
              {file.name} · {Math.max(1, Math.round(file.size / 1024))} KB
            </p>
          )}
        </div>
        <button
          type="button"
          className={secondaryButton}
          aria-disabled={reading}
          onClick={() => void read()}
        >
          <IconUpload aria-hidden="true" size={20} stroke={1.75} />
          {reading ? t('import.reading') : t('import.read')}
        </button>
      </section>
      {reading && (
        <p role="status" className="sr-only">
          {t('import.reading')}
        </p>
      )}
      {fileError && (
        <div role="alert" className={errorAlert}>
          <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          <span>{fileError}</span>
        </div>
      )}

      {parsed?.format === 'XLSX' && parsed.sheetCount > 1 && (
        <p role="note" className={warningAlert}>
          {t('import.sheets')}
        </p>
      )}
      {parsed?.format === 'VCF' && parsed.omitted.length > 0 && (
        <p role="note" className={warningAlert}>
          {t('import.omittedPhoto')}
        </p>
      )}

      {parsed?.format === 'XLSX' && (
        <MappingTable sheet={parsed} mapping={mapping} errors={errors} onChange={setMapping} />
      )}

      {parsed && (
        <section
          aria-labelledby="import-preview"
          className={`${card} flex flex-col gap-4 p-4 sm:p-6`}
        >
          <h3 id="import-preview" className="text-lg font-bold">
            {t('import.preview.heading')}
          </h3>
          <div role="status" className="flex flex-col gap-1">
            {checking && <p>{t('import.preview.checking')}</p>}
            {!checking && preview && (
              <p className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-muted px-3 py-1 text-sm font-bold">
                {[
                  t('import.preview.ready', { count: ready.length }),
                  invalid > 0 ? t('import.preview.invalid', { count: invalid }) : null,
                  skipped > 0 ? t('import.preview.skipped', { count: skipped }) : null,
                ]
                  .filter(Boolean)
                  .join(' ')}
              </p>
            )}
          </div>
          {previewFailed && (
            <div role="alert" className={errorAlert}>
              <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
              <span className="flex flex-wrap items-center gap-3">
                {previewFailed}
                <button
                  type="button"
                  className={secondaryButton}
                  onClick={() => setPreviewReload((n) => n + 1)}
                >
                  {t('import.retry')}
                </button>
              </span>
            </div>
          )}

          {unresolvedValues.length > 0 && (
            <fieldset className={`${card} flex flex-col gap-3 p-4 sm:p-6`}>
              <legend className="px-1 text-lg font-bold">{t('import.countries.heading')}</legend>
              {unresolvedValues.map(([text, country]) => (
                <CountryChoice
                  key={text}
                  text={text}
                  candidates={country.status === 'AMBIGUOUS' ? country.candidates : null}
                  value={countries[text] ?? ''}
                  onChange={(code) => setCountries((current) => ({ ...current, [text]: code }))}
                  language={language}
                />
              ))}
            </fieldset>
          )}

          {preview && rows.length > 0 && (
            <>
              {/* Drsno območje na ozkem zaslonu mora biti dosegljivo s tipkovnico (axe scrollable-region-focusable). */}
              <div
                role="region"
                aria-label={t('import.preview.table')}
                tabIndex={0}
                className={`overflow-x-auto rounded-md border border-border ${focusRing}`}
              >
                <table className="w-full border-collapse text-left">
                  <caption className="sr-only">{t('import.preview.table')}</caption>
                  <thead>
                    <tr className="border-b border-border bg-muted text-sm">
                      <th scope="col" className="p-2">
                        {t('import.preview.row')}
                      </th>
                      <th scope="col" className="p-2">
                        {t('import.preview.name')}
                      </th>
                      <th scope="col" className="p-2">
                        {t('import.preview.data')}
                      </th>
                      <th scope="col" className="p-2">
                        {t('import.preview.status')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((row) => (
                      <PreviewRowView
                        key={row.index}
                        row={row}
                        candidate={preview.candidates[row.index]!}
                        rowNumber={rowNumber(row.index)}
                        inFileRow={
                          row.duplicate?.inFileIndex != null
                            ? rowNumber(row.duplicate.inFileIndex)
                            : null
                        }
                        decision={decision(row)}
                        onDecision={(next) =>
                          setDecisions((current) => ({ ...current, [row.index]: next }))
                        }
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              {pages > 1 && (
                <nav
                  aria-label={t('import.pagination')}
                  className="flex flex-wrap items-center justify-between gap-3"
                >
                  <span>{t('import.page', { page: page + 1, pages })}</span>
                  <span className="flex gap-2">
                    <button
                      type="button"
                      className={secondaryButton}
                      disabled={page === 0}
                      onClick={() => setPage(page - 1)}
                    >
                      <IconChevronLeft aria-hidden="true" size={20} stroke={1.75} />
                      {t('import.previous')}
                    </button>
                    <button
                      type="button"
                      className={secondaryButton}
                      disabled={page + 1 >= pages}
                      onClick={() => setPage(page + 1)}
                    >
                      {t('import.next')}
                      <IconChevronRight aria-hidden="true" size={20} stroke={1.75} />
                    </button>
                  </span>
                </nav>
              )}
            </>
          )}

          {preview && unresolved && (
            <p id="import-unresolved" className={warningAlert}>
              {t('import.countries.unresolved')}
            </p>
          )}
          {preview && ready.length === 0 && <p>{t('import.nothing')}</p>}
          {importFailed && (
            <div role="alert" className={errorAlert}>
              <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
              <span className="flex flex-wrap items-center gap-3">
                {importFailed}
                <button type="button" className={secondaryButton} onClick={() => void confirm()}>
                  {t('import.retry')}
                </button>
              </span>
            </div>
          )}
          {importing && (
            <p role="status" className="sr-only">
              {t('import.importing')}
            </p>
          )}
          {preview && (
            <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
              <Link to={list} className={ghostButton}>
                {t('import.cancel')}
              </Link>
              <button
                type="button"
                className={primaryButton}
                disabled={ready.length === 0 || unresolved || checking || errors.size > 0}
                aria-describedby={unresolved ? 'import-unresolved' : undefined}
                aria-disabled={importing}
                onClick={() => void confirm()}
              >
                <IconFileImport aria-hidden="true" size={20} stroke={1.75} />
                {importing ? t('import.importing') : t('import.confirm', { count: ready.length })}
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function MappingTable({
  sheet,
  mapping,
  errors,
  onChange,
}: {
  sheet: ImportSheet;
  mapping: ColumnMapping[];
  errors: Map<number, MappingError>;
  onChange: (mapping: ColumnMapping[]) => void;
}) {
  const { t } = useTranslation();
  const prefix = useId();
  const update = (column: number, change: Partial<ColumnMapping>) =>
    onChange(mapping.map((item) => (item.column === column ? { ...item, ...change } : item)));
  return (
    <section className={`${card} flex flex-col gap-3 overflow-hidden pt-4 sm:pt-5`}>
      <h3 id={`${prefix}-heading`} className="px-4 text-lg font-bold sm:px-6">
        {t('import.mapping.heading')}
      </h3>
      <div
        role="region"
        aria-labelledby={`${prefix}-heading`}
        tabIndex={0}
        className={`overflow-x-auto ${focusRing}`}
      >
        <table className="w-full min-w-[40rem] border-collapse text-left">
          <thead>
            <tr className="border-y border-border bg-muted text-sm">
              <th scope="col" className="px-4 py-2 sm:px-6">
                {t('import.mapping.column')}
              </th>
              <th scope="col" className="p-2">
                {t('import.mapping.target')}
              </th>
              <th scope="col" className="p-2">
                {t('import.mapping.keyHeader')}
              </th>
              <th scope="col" className="p-2">
                {t('import.mapping.typeHeader')}
              </th>
            </tr>
          </thead>
          <tbody>
            {mapping.map((item) => {
              const header = sheet.headers[item.column] ?? '';
              const error = errors.get(item.column);
              const errorId = `${prefix}-${item.column}-error`;
              return (
                <tr key={item.column} className="border-b border-border align-top last:border-b-0">
                  <th
                    scope="row"
                    className="px-4 py-3 font-mono text-sm font-normal break-words sm:px-6"
                  >
                    {header}
                  </th>
                  <td className="p-2">
                    <label htmlFor={`${prefix}-${item.column}`} className="sr-only">
                      {t('import.mapping.targetFor', { column: header })}
                    </label>
                    <select
                      id={`${prefix}-${item.column}`}
                      value={item.target}
                      aria-invalid={error === 'duplicateTarget' ? true : undefined}
                      aria-describedby={error ? errorId : undefined}
                      onChange={(event) =>
                        update(item.column, {
                          target: event.target.value as ColumnMapping['target'],
                          key: item.key ?? header,
                        })
                      }
                      className={`${textInput} h-11 w-full min-w-40`}
                    >
                      {TARGETS.map((target) => (
                        <option key={target} value={target}>
                          {t(`import.mapping.targets.${target}`)}
                        </option>
                      ))}
                    </select>
                    {error && (
                      <p id={errorId} className={`${fieldError} mt-1 text-sm`}>
                        {t(`import.mapping.${error}`)}
                      </p>
                    )}
                  </td>
                  <td className="p-2">
                    {item.target === 'ATTRIBUTE' && (
                      <>
                        <label htmlFor={`${prefix}-${item.column}-key`} className="sr-only">
                          {t('import.mapping.keyFor', { column: header })}
                        </label>
                        <input
                          id={`${prefix}-${item.column}-key`}
                          value={item.key ?? ''}
                          aria-invalid={error && error !== 'duplicateTarget' ? true : undefined}
                          aria-describedby={error ? errorId : undefined}
                          onChange={(event) => update(item.column, { key: event.target.value })}
                          className={`${textInput} min-w-32 font-mono`}
                        />
                      </>
                    )}
                  </td>
                  <td className="p-2 pr-4 sm:pr-6">
                    {item.target === 'ATTRIBUTE' && (
                      <>
                        <label htmlFor={`${prefix}-${item.column}-type`} className="sr-only">
                          {t('import.mapping.typeFor', { column: header })}
                        </label>
                        <select
                          id={`${prefix}-${item.column}-type`}
                          value={item.type ?? ''}
                          onChange={(event) =>
                            update(item.column, {
                              type:
                                event.target.value === ''
                                  ? undefined
                                  : (event.target.value as AttributeType),
                            })
                          }
                          className={`${textInput} h-11 w-full min-w-40`}
                        >
                          <option value="">{t('import.mapping.typeAuto')}</option>
                          {ATTRIBUTE_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {t(typeNameKey(type))}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CountryChoice({
  text,
  candidates,
  value,
  onChange,
  language,
}: {
  text: string;
  candidates: string[] | null;
  value: string;
  onChange: (code: string) => void;
  language: 'sl' | 'en';
}) {
  const { t } = useTranslation();
  const id = useId();
  const options = candidates
    ? candidates.map((code) => ({ code, name: countryName(code, language) }))
    : allCountries(language);
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-bold">
        {t('import.countries.choose', { text })}
      </label>
      <p className="text-muted-foreground">
        {t(candidates ? 'import.countries.ambiguous' : 'import.countries.unknown', { text })}
      </p>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${textInput} h-11 w-auto max-w-full`}
      >
        <option value="">{t('import.countries.pick')}</option>
        <option value="-">{t('import.countries.leaveEmpty')}</option>
        {options.map((option) => (
          <option key={option.code} value={option.code}>
            {option.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function PreviewRowView({
  row,
  candidate,
  rowNumber,
  inFileRow,
  decision,
  onDecision,
}: {
  row: PreviewRow;
  candidate: Candidate;
  rowNumber: number;
  inFileRow: number | null;
  decision: Decision;
  onDecision: (decision: Decision) => void;
}) {
  const { t } = useTranslation();
  const format = useFormatters();
  const name = [candidate.firstName, candidate.lastName].filter(Boolean).join(' ');
  return (
    <tr className="border-b border-border align-top">
      <th scope="row" className="p-2 font-normal">
        {rowNumber}
      </th>
      <td className="p-2">{name}</td>
      <td className="p-2">
        <ul className="flex flex-col gap-0.5">
          {[
            candidate.addressParts ? format.address(candidate.addressParts) : candidate.address,
            candidate.email,
            candidate.phone,
            candidate.company,
            candidate.countryText,
            ...candidate.attributes.map(
              (attribute) =>
                `${attribute.key}: ${attribute.parts ? format.address(attribute.parts) : attribute.value}`,
            ),
            candidate.tags.length > 0 ? candidate.tags.join(', ') : null,
          ]
            .filter((value): value is string => value != null && value !== '')
            .map((value, i) => (
              <li key={i} className="break-words">
                {value}
              </li>
            ))}
        </ul>
      </td>
      <td className="p-2">
        {row.errors.length > 0 ? (
          <ul className={fieldError}>
            {row.errors.map((error) => (
              <li key={`${error.field}-${error.code}`}>
                {t('import.preview.fieldError', {
                  field: fieldLabel(error.field, t),
                  reason: t(`import.preview.reasons.${error.code}`, {
                    defaultValue: t('import.preview.reasons.INVALID_VALUE'),
                  }),
                })}
              </li>
            ))}
          </ul>
        ) : row.duplicate ? (
          <fieldset className="flex flex-col gap-1">
            <legend>
              {row.duplicate.contactName
                ? t(`import.preview.duplicate${row.duplicate.reason}`, {
                    name: row.duplicate.contactName,
                  })
                : t('import.preview.duplicateInFile', { row: inFileRow })}
            </legend>
            <div
              role="radiogroup"
              aria-label={t('import.preview.decision', { row: rowNumber })}
              className="flex gap-4"
            >
              {(['skip', 'create'] as const).map((option) => (
                <label key={option} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`decision-${row.index}`}
                    checked={decision === option}
                    onChange={() => onDecision(option)}
                  />
                  {t(`import.preview.${option}`)}
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          t('import.preview.ok')
        )}
      </td>
    </tr>
  );
}

function fieldLabel(field: string, t: TFunction): string {
  const base = field.replace(/\[\d+\].*$/, '');
  return t(`import.preview.fields.${base}`, { defaultValue: field });
}

function fileFailure(error: unknown, t: TFunction): string {
  if (!(error instanceof ApiError)) return t('groups.offline');
  const body = error.body as { errors?: { field: string; code: string }[] } | null;
  const code = body?.errors?.find((item) => item.field === 'file')?.code;
  return code
    ? t(`import.fileErrors.${code}`, { defaultValue: t('import.fileErrors.failed') })
    : t('import.fileErrors.failed');
}

function failure(error: unknown, t: TFunction): string {
  if (!(error instanceof ApiError)) return t('groups.offline');
  if (error.code === 'GROUP_ARCHIVED') return t('import.archived');
  return t('import.fileErrors.failed');
}
