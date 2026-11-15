import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { secondaryButton, textInput } from '../../shared/ui/styles';
import { useActorLabel } from './actorLabel';
import { useAuditApi } from './api';
import type { Actor } from './types';
import { useGroup } from '../groups/groupContext';

type State = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; actors: Actor[] };

/**
 * Izbira izvajalca sledi (FR-015-01, FR-015-03; design.md 8.2): izvajalci te sledi, ločeni na člane, nekdanje člane in
 * *izbrisan uporabnik*; prazna vrednost pomeni vse izvajalce. Seznam se naloži ob prvem izrisu (odprt panel filtrov).
 */
export function ActorSelect({
  value,
  onChange,
}: {
  /** Žeton izbranega izvajalca ali `''` (vsi). */
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const api = useAuditApi();
  const { group } = useGroup();
  const label = useActorLabel();
  const id = useId();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let active = true;
    api.listActors(group.id).then(
      (list) => {
        if (active) setState({ kind: 'ready', actors: list.items });
      },
      () => {
        if (active) setState({ kind: 'failed' });
      },
    );
    return () => {
      active = false;
    };
  }, [api, group.id, reloads]);

  if (state.kind === 'loading') return <p role="status">{t('audit.filters.actorsLoading')}</p>;
  if (state.kind === 'failed') {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3">
        <span>{t('audit.filters.actorsFailed')}</span>
        <button
          type="button"
          className={secondaryButton}
          onClick={() => {
            setState({ kind: 'loading' });
            setReloads((n) => n + 1);
          }}
        >
          {t('audit.filters.actorsRetry')}
        </button>
      </div>
    );
  }

  const members = state.actors.filter((actor) => actor.kind === 'MEMBER');
  const former = state.actors.filter((actor) => actor.kind === 'FORMER');
  const deleted = state.actors.find((actor) => actor.kind === 'DELETED');
  const known = state.actors.some((actor) => actor.id === value);
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-bold">
        {t('audit.filters.actorLabel')}
      </label>
      <select
        id={id}
        value={known ? value : ''}
        onChange={(event) => onChange(event.target.value)}
        className={`${textInput} h-11`}
      >
        <option value="">{t('audit.filters.actorAll')}</option>
        {members.length > 0 && (
          <optgroup label={t('audit.filters.actorMembers')}>
            {members.map((actor) => (
              <option key={actor.id} value={actor.id}>
                {label(actor)}
              </option>
            ))}
          </optgroup>
        )}
        {former.length > 0 && (
          <optgroup label={t('audit.filters.actorFormer')}>
            {former.map((actor) => (
              <option key={actor.id} value={actor.id}>
                {label(actor, true)}
              </option>
            ))}
          </optgroup>
        )}
        {deleted && <option value={deleted.id}>{label(deleted)}</option>}
      </select>
    </div>
  );
}
