import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { focusRing } from '../../shared/ui/styles';

/** Vrstica značk (FR-011-10): `fieldset` »Značke« s potrditvenimi polji, privzeto vse obkljukane. */
export function CompareTags({
  id,
  tags,
  checked,
  error,
  onToggle,
}: {
  id: string;
  tags: string[];
  checked: string[];
  error?: string;
  onToggle: (tag: string) => void;
}) {
  const { t } = useTranslation();
  const errorId = useId();
  const isChecked = (tag: string) =>
    checked.some((candidate) => candidate.toLowerCase() === tag.toLowerCase());

  return (
    <fieldset
      id={id}
      tabIndex={error ? -1 : undefined}
      aria-describedby={error ? errorId : undefined}
      className="flex min-w-0 flex-col gap-2 rounded-md border border-border p-3 outline-none"
    >
      <legend className="px-1 font-bold">{t('duplicates.compare.tags')}</legend>
      <div className="flex flex-wrap gap-x-6">
        {tags.map((tag) => (
          <label key={tag} className="flex min-h-11 items-center gap-3 pointer-coarse:min-h-12">
            <input
              type="checkbox"
              checked={isChecked(tag)}
              onChange={() => onToggle(tag)}
              className={`size-5 shrink-0 accent-primary ${focusRing}`}
            />
            <span className="break-all">{tag}</span>
          </label>
        ))}
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}
