import { focusRing } from '../../../shared/ui/styles';
import { type RefObject, useEffect, useReducer } from 'react';
import { useTranslation } from 'react-i18next';

import type { PageState } from './selection';

/**
 * Potrditveno polje glave stolpca (FR-009-01; Clarify Q4): `checked` – vsa stran izbrana, `mixed` – nekateri (nativni
 * `indeterminate`, bralnik prebere »delno označeno«), `unchecked` – nobeden. Aktivacija pri `mixed` in `unchecked`
 * izbere vso stran, pri `checked` jo odznači (odločitev sprejme klicatelj prek `onChange`).
 */
export function SelectAllOnPage({
  state,
  onChange,
  inputRef,
}: {
  state: PageState;
  onChange: (selected: boolean) => void;
  /** Polje prejme fokus po *Počisti izbor* (FR-009-02). */
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const { t } = useTranslation();
  // Klik v brskalniku počisti `indeterminate`, tudi če izbor ostane enak (npr. meja 10 000): po vsakem izrisu ga uveljavimo.
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = state === 'mixed';
  });
  return (
    <input
      ref={inputRef}
      type="checkbox"
      aria-label={t('contacts.selection.selectAll')}
      checked={state === 'checked'}
      onChange={() => {
        onChange(state !== 'checked');
        redraw();
      }}
      className={`size-6 accent-primary ${focusRing}`}
    />
  );
}
