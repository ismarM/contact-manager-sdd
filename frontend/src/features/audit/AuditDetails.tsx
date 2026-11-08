import { IconAlertTriangle } from '@tabler/icons-react';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { errorAlert, secondaryButton } from '../../shared/ui/styles';
import { useGroup } from '../groups/groupContext';
import { SectionPagination } from '../groups/SectionPagination';
import { useAuditApi } from './api';
import { DEFAULT_SIZE } from './auditRouting';
import { ChangeTable } from './ChangeTable';
import type { ChangePage } from './types';

type State = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; data: ChangePage };

/** Kontakt vnosa: zaprta skupina, preglednica se izriše šele ob razkritju (Clarifications 2026-11-08, Q3). */
function AffectedContact({ change }: { change: ChangePage['items'][number] }) {
  const [open, setOpen] = useState(false);
  const summary = useId();
  return (
    <li>
      <details
        aria-labelledby={summary}
        onToggle={(event) => setOpen(event.currentTarget.open)}
        className="py-1"
      >
        <summary id={summary} className="cursor-pointer font-bold break-words">
          {change.displayName}
        </summary>
        {open && <ChangeTable change={change} />}
      </details>
    </li>
  );
}

function Changes({ entryId }: { entryId: string }) {
  const { t } = useTranslation();
  const api = useAuditApi();
  const { group } = useGroup();
  const [page, setPage] = useState(0);
  const [size, setSize] = useState<number>(DEFAULT_SIZE);
  const [reloads, setReloads] = useState(0);
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let active = true;
    api.listChanges(group.id, entryId, page, size).then(
      (data) => {
        if (active) setState({ kind: 'ready', data });
      },
      () => {
        if (active) setState({ kind: 'failed' });
      },
    );
    return () => {
      active = false;
    };
  }, [api, group.id, entryId, page, size, reloads]);

  if (state.kind === 'failed') {
    return (
      <div role="alert" className={errorAlert}>
        <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
        <span className="flex flex-wrap items-center gap-3">
          {t('audit.details.loadFailed')}
          <button
            type="button"
            className={secondaryButton}
            onClick={() => {
              setState({ kind: 'loading' });
              setReloads((n) => n + 1);
            }}
          >
            {t('audit.details.retry')}
          </button>
        </span>
      </div>
    );
  }
  if (state.kind === 'loading') return <p role="status">{t('audit.details.loading')}</p>;

  const { data } = state;
  return (
    <div className="flex flex-col gap-3">
      <ul aria-label={t('audit.details.affected')} className="flex flex-col">
        {data.items.map((change) => (
          <AffectedContact key={change.contactId} change={change} />
        ))}
      </ul>
      {data.total > DEFAULT_SIZE && (
        <SectionPagination
          label={t('audit.details.pagination')}
          page={page}
          size={size}
          total={data.total}
          disabled={false}
          onPage={setPage}
          onSize={(next) => {
            setSize(next);
            setPage(0);
          }}
        />
      )}
    </div>
  );
}

/**
 * *Podrobnosti* vnosa (design.md 9.6): `details`/`summary`; spremembe se naložijo ob prvem odprtju, nato kot
 * paginiran seznam prizadetih kontaktov (FR-005-08).
 */
export function AuditDetails({ entryId }: { entryId: string }) {
  const { t } = useTranslation();
  const summary = useId();
  const [opened, setOpened] = useState(false);
  return (
    <details
      aria-labelledby={summary}
      onToggle={(event) => {
        if (event.currentTarget.open) setOpened(true);
      }}
      className="mt-2"
    >
      <summary id={summary} className="cursor-pointer font-bold text-primary">
        {t('audit.details.summary')}
      </summary>
      {opened && <Changes entryId={entryId} />}
    </details>
  );
}
