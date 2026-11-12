import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { focusRing, primaryButton } from '../../shared/ui/styles';
import { CATEGORIES } from './duplicateRouting';
import type { DuplicateCategory } from './types';

/** Obrazec iskanja (FR-011-02): skupina izbirnih gumbov »Kategorija« (privzeto ime in priimek) in »Poišči dvojnike«. */
export function DuplicateSearchForm({
  initial,
  onSearch,
}: {
  initial: DuplicateCategory | null;
  onSearch: (category: DuplicateCategory) => void;
}) {
  const { t } = useTranslation();
  const name = useId();
  const [category, setCategory] = useState<DuplicateCategory>(initial ?? 'name');

  return (
    <form
      className="flex flex-col items-start gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSearch(category);
      }}
    >
      <fieldset role="radiogroup" className="flex min-w-0 flex-col gap-1">
        <legend className="mb-1 font-bold">{t('duplicates.category')}</legend>
        {CATEGORIES.map((option) => (
          <label key={option} className="flex min-h-11 items-center gap-3 pointer-coarse:min-h-12">
            <input
              type="radio"
              name={name}
              value={option}
              checked={category === option}
              onChange={() => setCategory(option)}
              className={`size-5 accent-primary ${focusRing}`}
            />
            {t(`duplicates.categories.${option}`)}
          </label>
        ))}
      </fieldset>
      <button type="submit" className={primaryButton}>
        {t('duplicates.search')}
      </button>
    </form>
  );
}
