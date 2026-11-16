import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { focusRing, textInput } from '../../shared/ui/styles';
import { ROLES, type Role } from './types';

/** Zakasnitev vnosa pred poizvedbo (FR-017-18). */
const DEBOUNCE_MS = 300;
export const MAX_QUERY_LENGTH = 100;

export interface SearchState {
  q: string;
  roles: Role[];
  archived: boolean;
}

/**
 * Iskanje in filtri skupin (FR-017-14 … -16): polje *Išči skupine* (`role=search`), vloge kot potrditvena polja, *Stanje*
 * kot izbirni gumbi. Stanje je v URL (starš); vnos besedila se v URL prenese z zakasnitvijo.
 */
export function GroupSearchControls({
  state,
  onChange,
}: {
  state: SearchState;
  onChange: (next: SearchState) => void;
}) {
  const { t } = useTranslation();
  const inputId = useId();
  const stateName = useId();
  const [text, setText] = useState(state.q);
  const [seenQ, setSeenQ] = useState(state.q);
  // URL se je spremenil od zunaj (počisti, nazaj): vnos sledi, razen med tipkanjem (obrezan niz je enak).
  if (state.q !== seenQ) {
    setSeenQ(state.q);
    if (text.trim() !== state.q) setText(state.q);
  }

  useEffect(() => {
    const next = text.trim();
    if (next === state.q) return;
    const timer = setTimeout(() => onChange({ ...state, q: next }), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, state, onChange]);

  const toggleRole = (role: Role) => {
    const roles = state.roles.includes(role)
      ? state.roles.filter((value) => value !== role)
      : ROLES.filter((value) => value === role || state.roles.includes(value));
    onChange({ ...state, roles });
  };

  return (
    <div role="search" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor={inputId} className="font-bold">
          {t('groups.search.label')}
        </label>
        <input
          id={inputId}
          type="search"
          value={text}
          maxLength={MAX_QUERY_LENGTH}
          autoComplete="off"
          onChange={(event) => setText(event.target.value)}
          className={textInput}
        />
      </div>
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        <fieldset className="flex min-w-0 flex-col gap-1">
          <legend className="mb-1 font-bold">{t('groups.search.rolesLegend')}</legend>
          <div className="flex flex-wrap gap-x-4">
            {ROLES.map((role) => (
              <label
                key={role}
                className="flex min-h-11 items-center gap-2 pointer-coarse:min-h-12"
              >
                <input
                  type="checkbox"
                  checked={state.roles.includes(role)}
                  onChange={() => toggleRole(role)}
                  className={`size-5 accent-primary ${focusRing}`}
                />
                {t(`roles.${role}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="flex min-w-0 flex-col gap-1">
          <legend className="mb-1 font-bold">{t('groups.search.stateLegend')}</legend>
          <div className="flex flex-wrap gap-x-4">
            {[false, true].map((archived) => (
              <label
                key={String(archived)}
                className="flex min-h-11 items-center gap-2 pointer-coarse:min-h-12"
              >
                <input
                  type="radio"
                  name={stateName}
                  checked={state.archived === archived}
                  onChange={() => onChange({ ...state, archived })}
                  className={`size-5 accent-primary ${focusRing}`}
                />
                {t(archived ? 'groups.search.archived' : 'groups.search.active')}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </div>
  );
}
