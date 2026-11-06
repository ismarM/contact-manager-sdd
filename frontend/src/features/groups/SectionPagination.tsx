import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { secondaryButton, textInput } from '../../shared/ui/styles';

export const PAGE_SIZES = [25, 50, 100] as const;

/** Paginacija seznama (design.md 8.9, D-26): obseg, stran, Prejšnja/Naslednja in velikost strani v `nav` z imenom. */
export function SectionPagination({
  label,
  page,
  size,
  total,
  disabled,
  onPage,
  onSize,
}: {
  label: string;
  page: number;
  size: number;
  total: number;
  disabled: boolean;
  onPage: (page: number) => void;
  onSize: (size: number) => void;
}) {
  const { t } = useTranslation();
  const sizeId = useId();
  const pages = Math.max(1, Math.ceil(total / size));
  const from = page * size + 1;
  const to = Math.min(total, (page + 1) * size);

  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-3">
      <p role="status">{t('groups.pagination.range', { from, to, total })}</p>
      <button
        type="button"
        className={secondaryButton}
        disabled={disabled || page === 0}
        onClick={() => onPage(page - 1)}
      >
        {t('groups.pagination.previous')}
      </button>
      <p>{t('groups.pagination.page', { page: page + 1, pages })}</p>
      <button
        type="button"
        className={secondaryButton}
        disabled={disabled || page + 1 >= pages}
        onClick={() => onPage(page + 1)}
      >
        {t('groups.pagination.next')}
      </button>
      <span className="flex items-center gap-2">
        <label htmlFor={sizeId}>{t('groups.pagination.pageSize')}</label>
        <select
          id={sizeId}
          value={size}
          disabled={disabled}
          onChange={(event) => onSize(Number(event.target.value))}
          className={`${textInput} h-11 w-auto`}
        >
          {PAGE_SIZES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </span>
    </nav>
  );
}
