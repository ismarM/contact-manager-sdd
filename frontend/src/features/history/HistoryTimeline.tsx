import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { secondaryButton, focusRing } from '../../shared/ui/styles';
import { ChangeTable } from '../audit/ChangeTable';
import { useAuditSentence } from '../audit/auditSentence';
import { useAuditTime } from '../audit/formatTime';
import { useGroup } from '../groups/groupContext';
import { ChangeKindLabel } from './ChangeKindLabel';
import { CURRENT, INITIAL, type History, type HistoryEvent } from './types';

/** Različica, izbrana za primerjavo: `createdAt` je `null` za izhodiščno stanje (najstarejše). */
export interface ComparePick {
  ref: string;
  createdAt: string | null;
}

const link = `text-primary underline underline-offset-4 ${focusRing}`;

/** Imena spremenjenih polj (osnovna polja po prevodu, dodatni atributi po ključu, značke) brez podvajanja. */
function useFieldNames() {
  const { t } = useTranslation();
  return (event: HistoryEvent): string => {
    const names = event.fields.map((field) =>
      field.field === 'ATTRIBUTE' ? (field.key ?? '') : t(`audit.details.fields.${field.field}`),
    );
    return [...new Set(names)].join(', ');
  };
}

/** *Podrobnosti* dogodka: `details`/`summary`, preglednica polj se izriše šele ob razkritju (FR-015-06). */
function EventDetails({ event, contactId }: { event: HistoryEvent; contactId: string }) {
  const { t } = useTranslation();
  const summary = useId();
  const [open, setOpen] = useState(false);
  return (
    <details
      aria-labelledby={summary}
      onToggle={(toggle) => setOpen(toggle.currentTarget.open)}
      className="py-1"
    >
      <summary id={summary} className="cursor-pointer font-bold text-primary">
        {t('history.event.details')}
      </summary>
      {open && (
        <ChangeTable
          change={{
            contactId,
            displayName: event.displayName,
            kind: event.kind,
            fields: event.fields,
          }}
        />
      )}
    </details>
  );
}

function EventItem({
  event,
  contactId,
  isCurrent,
  active,
  canRestore,
  picks,
  onPick,
  onRestore,
}: {
  event: HistoryEvent;
  contactId: string;
  /** Stanje po tem dogodku je trenutno stanje kontakta: brez primerjave s trenutnim in obnove. */
  isCurrent: boolean;
  active: boolean;
  canRestore: boolean;
  picks: ComparePick[];
  onPick: (pick: ComparePick) => void;
  onRestore: (ref: string) => void;
}) {
  const { t } = useTranslation();
  const { group } = useGroup();
  const time = useAuditTime();
  const sentence = useAuditSentence();
  const fieldNames = useFieldNames()(event);
  const base = `/groups/${group.id}/contacts/${contactId}`;
  const when = time(event.createdAt);
  const actor = event.actor ? (event.actor.name ?? event.actor.email) : t('audit.list.deletedUser');
  const merged = event.action === 'MERGE' && event.kind === 'REMOVED' && event.mergedInto !== null;
  const text = sentence(
    {
      action: event.action,
      contactCount: event.action === 'MERGE' ? event.entryContactCount : 1,
      contactName: null,
      targetInitial: event.targetInitial,
      photoChange: event.photoChange,
    },
    { anonymous: true },
  );
  // 018: vnos, ki je spremenil samo sliko, ni obnovljiv (slike obnova ne spreminja).
  const photoOnly = Boolean(event.photoChange) && event.fields.length === 0;
  const picked = picks.some((pick) => pick.ref === event.entryId);
  const viewLabel = `${t('history.event.viewVersion')}: ${when}`;
  const compareLabel = `${t('history.event.compareCurrent')}: ${when}`;

  return (
    <li className="flex flex-col gap-2 py-3">
      <p className="flex flex-wrap items-baseline gap-x-2 break-words">
        <time dateTime={event.createdAt} className="font-mono text-sm text-muted-foreground">
          {when}
        </time>
        {merged && event.mergedInto ? (
          <span>
            {t('history.event.mergedInto')}{' '}
            <Link
              to={`/groups/${group.id}/contacts/${event.mergedInto.contactId}/history`}
              className={link}
            >
              {event.mergedInto.displayName}
            </Link>{' '}
            <span className="text-muted-foreground">({actor})</span>
          </span>
        ) : (
          <span>
            <span className="font-bold">{actor}</span> {text}
            {event.target && (
              <>
                {' '}
                <Link
                  to={
                    event.action === 'RESTORE'
                      ? `${base}/history/${event.target.entryId}`
                      : `/groups/${group.id}/audit/${event.target.entryId}`
                  }
                  className={link}
                >
                  {time(event.target.createdAt)}
                </Link>
              </>
            )}
          </span>
        )}
      </p>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <ChangeKindLabel kind={event.kind} />
        {event.photoChange && <span>{t(`images.audit.${event.photoChange}`)}</span>}
        {fieldNames && (
          <span className="break-words">
            {t('history.event.changedFields', { fields: fieldNames })}
          </span>
        )}
      </p>
      {event.fields.length > 0 && <EventDetails event={event} contactId={contactId} />}
      {photoOnly && <p className="text-muted-foreground">{t('images.audit.notRestorable')}</p>}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {event.hasVersion && (
          <Link to={`${base}/history/${event.entryId}`} aria-label={viewLabel} className={link}>
            {t('history.event.viewVersion')}
          </Link>
        )}
        {event.hasVersion && active && !isCurrent && (
          <Link
            to={`${base}/compare?from=${event.entryId}&to=${CURRENT}`}
            aria-label={compareLabel}
            className={link}
          >
            {t('history.event.compareCurrent')}
          </Link>
        )}
        {event.entryContactCount > 1 && (
          <Link to={`/groups/${group.id}/audit/${event.entryId}`} className={link}>
            {t('history.event.fullEntry')}
          </Link>
        )}
        {event.hasVersion && (
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              className="size-5 accent-primary"
              aria-label={t('history.event.selectLabel', { version: when })}
              checked={picked}
              disabled={!picked && picks.length >= 2}
              onChange={() => onPick({ ref: event.entryId, createdAt: event.createdAt })}
            />
            {t('history.event.select')}
          </label>
        )}
        {canRestore && event.hasVersion && !isCurrent && !photoOnly && (
          <button
            type="button"
            className={secondaryButton}
            aria-label={`${t('history.restore.button')}: ${when}`}
            onClick={() => onRestore(event.entryId)}
          >
            {t('history.restore.button')}
          </button>
        )}
      </div>
    </li>
  );
}

function InitialItem({
  contactId,
  canRestore,
  picks,
  onPick,
  onRestore,
}: {
  contactId: string;
  canRestore: boolean;
  picks: ComparePick[];
  onPick: (pick: ComparePick) => void;
  onRestore: (ref: string) => void;
}) {
  const { t } = useTranslation();
  const { group } = useGroup();
  const base = `/groups/${group.id}/contacts/${contactId}`;
  const label = t('history.initial.heading');
  const picked = picks.some((pick) => pick.ref === INITIAL);
  return (
    <li className="flex flex-col gap-2 py-3">
      <p className="font-bold">{label}</p>
      <p className="text-muted-foreground">{t('history.initial.description')}</p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link to={`${base}/history/${INITIAL}`} className={link}>
          {t('history.initial.view')}
        </Link>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            className="size-5 accent-primary"
            aria-label={t('history.event.selectLabel', { version: label })}
            checked={picked}
            disabled={!picked && picks.length >= 2}
            onChange={() => onPick({ ref: INITIAL, createdAt: null })}
          />
          {t('history.event.select')}
        </label>
        {canRestore && (
          <button
            type="button"
            className={secondaryButton}
            aria-label={`${t('history.restore.button')}: ${label}`}
            onClick={() => onRestore(INITIAL)}
          >
            {t('history.restore.button')}
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * Časovnica zgodovine kontakta (FR-015-05 … FR-015-09; design.md 9.6): `ol` dogodkov, najnovejši zgoraj, vsak z `<time>`,
 * izvajalcem, stavkom, vrsto spremembe (ikona + besedilo), razkritjem polj, ogledom, primerjavo in obnovo; na koncu
 * zadnje strani izhodiščno stanje.
 */
export function HistoryTimeline({
  history,
  showInitial,
  canRestore,
  picks,
  onPick,
  onRestore,
}: {
  history: History;
  showInitial: boolean;
  canRestore: boolean;
  picks: ComparePick[];
  onPick: (pick: ComparePick) => void;
  onRestore: (ref: string) => void;
}) {
  const { t } = useTranslation();
  const { contact } = history;
  const active = contact.status === 'ACTIVE';
  return (
    <ol aria-label={t('history.page.events')} className="flex flex-col divide-y divide-border">
      {history.items.map((event, index) => (
        <EventItem
          key={event.entryId}
          event={event}
          contactId={contact.id}
          isCurrent={active && history.page === 0 && index === 0}
          active={active}
          canRestore={canRestore}
          picks={picks}
          onPick={onPick}
          onRestore={onRestore}
        />
      ))}
      {showInitial && (
        <InitialItem
          contactId={contact.id}
          canRestore={canRestore}
          picks={picks}
          onPick={onPick}
          onRestore={onRestore}
        />
      )}
    </ol>
  );
}
