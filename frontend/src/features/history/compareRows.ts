import type { ChangeField, ChangeFieldName, ChangeValue } from '../audit/types';
import type { RowKind } from './ChangeKindLabel';
import type { Comparison, ContactStateView } from './types';

/** Vrstica primerjave: polje, dodatni atribut ali ena značka z vrsto spremembe (FR-015-09). */
export interface CompareRow {
  id: string;
  label:
    | { kind: 'field'; field: Exclude<ChangeFieldName, 'ATTRIBUTE' | 'TAGS'> }
    | { kind: 'attribute'; key: string }
    | { kind: 'tag'; tag: string };
  kind: RowKind;
  before: ChangeValue;
  after: ChangeValue;
  /** Vrednost je koda države ISO (013). */
  country: boolean;
  /** Značka: vrednost je prisotnost (»je« / »ni«). */
  presence: boolean;
}

type Basic = Exclude<ChangeFieldName, 'ATTRIBUTE' | 'TAGS'>;

const BASIC: { field: Basic; read: (state: ContactStateView) => string | null }[] = [
  { field: 'FIRST_NAME', read: (s) => s.firstName },
  { field: 'LAST_NAME', read: (s) => s.lastName },
  { field: 'COMPANY', read: (s) => s.company },
  { field: 'ADDRESS', read: (s) => s.address },
  { field: 'COUNTRY', read: (s) => s.country },
  { field: 'EMAIL', read: (s) => s.email },
  { field: 'PHONE', read: (s) => s.phone },
];

const empty = (value: ChangeValue) =>
  value === null || value === '' || (Array.isArray(value) && value.length === 0);

function asList(value: ChangeValue): string[] {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function fromChange(change: ChangeField): CompareRow[] {
  if (change.field === 'TAGS') {
    const before = asList(change.before);
    const after = asList(change.after);
    return [
      ...before.filter((tag) => !after.includes(tag)).map((tag) => tagRow(tag, 'REMOVED')),
      ...after.filter((tag) => !before.includes(tag)).map((tag) => tagRow(tag, 'ADDED')),
    ];
  }
  if (change.field === 'ATTRIBUTE') {
    const key = change.key ?? '';
    return [
      {
        id: `attribute:${key}`,
        label: { kind: 'attribute', key },
        kind: empty(change.before) ? 'ADDED' : empty(change.after) ? 'REMOVED' : 'CHANGED',
        before: change.before,
        after: change.after,
        country: false,
        presence: false,
      },
    ];
  }
  return [
    {
      id: `field:${change.field}`,
      label: { kind: 'field', field: change.field },
      kind: 'CHANGED',
      before: change.before,
      after: change.after,
      country: change.field === 'COUNTRY',
      presence: false,
    },
  ];
}

function tagRow(tag: string, kind: 'ADDED' | 'REMOVED' | 'UNCHANGED'): CompareRow {
  return {
    id: `tag:${tag}`,
    label: { kind: 'tag', tag },
    kind,
    before: kind === 'ADDED' ? null : tag,
    after: kind === 'REMOVED' ? null : tag,
    country: false,
    presence: true,
  };
}

/**
 * Vrstice primerjave: spremenjena polja iz odgovora (značke posamično, dodan/odstranjen atribut) in nespremenjena iz
 * stanj različic (samo izpolnjena); spremenjena so prva.
 */
export function buildRows(comparison: Comparison): {
  changed: CompareRow[];
  unchanged: CompareRow[];
} {
  const changed = comparison.changes.flatMap(fromChange);
  const ids = new Set(changed.map((row) => row.id));
  const unchanged: CompareRow[] = [];
  const { to } = comparison;
  for (const { field, read } of BASIC) {
    const value = read(to.state);
    if (value && !ids.has(`field:${field}`)) {
      unchanged.push({
        id: `field:${field}`,
        label: { kind: 'field', field },
        kind: 'UNCHANGED',
        before: value,
        after: value,
        country: field === 'COUNTRY',
        presence: false,
      });
    }
  }
  for (const attribute of to.state.attributes) {
    if (!ids.has(`attribute:${attribute.key}`)) {
      unchanged.push({
        id: `attribute:${attribute.key}`,
        label: { kind: 'attribute', key: attribute.key },
        kind: 'UNCHANGED',
        before: attribute.value,
        after: attribute.value,
        country: false,
        presence: false,
      });
    }
  }
  for (const tag of to.state.tags) {
    if (!ids.has(`tag:${tag}`)) unchanged.push(tagRow(tag, 'UNCHANGED'));
  }
  return { changed, unchanged };
}
