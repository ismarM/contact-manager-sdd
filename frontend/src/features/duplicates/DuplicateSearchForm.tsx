import { IconSearch } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { SegmentedControl } from '../../shared/ui/SegmentedControl';
import { primaryButton } from '../../shared/ui/styles';
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
  const [category, setCategory] = useState<DuplicateCategory>(initial ?? 'name');

  return (
    <form
      className="flex flex-col gap-4 rounded-md border border-border bg-card p-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-6 sm:p-5"
      onSubmit={(event) => {
        event.preventDefault();
        onSearch(category);
      }}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="text-sm font-bold" aria-hidden="true">
          {t('duplicates.category')}
        </span>
        <SegmentedControl
          label={t('duplicates.category')}
          value={category}
          segments={CATEGORIES.map((option) => ({
            value: option,
            label: t(`duplicates.categories.${option}`),
          }))}
          onChange={setCategory}
          className="max-w-full flex-wrap self-start"
        />
      </div>
      <button type="submit" className={`${primaryButton} max-sm:w-full`}>
        <IconSearch aria-hidden="true" size={20} stroke={1.75} />
        {t('duplicates.search')}
      </button>
    </form>
  );
}
