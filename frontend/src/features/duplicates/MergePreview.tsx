import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { FIELDS } from './mergeModel';
import type { MergeResultInput } from './types';

/** Predogled združenega kontakta (FR-011-12): sproti posodobljen rezultat po trenutnih izbirah. */
export function MergePreview({ result }: { result: MergeResultInput }) {
  const { t } = useTranslation();
  const titleId = useId();
  const empty = t('duplicates.compare.emptyValue');

  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-md border border-border bg-card p-4"
    >
      <h3 id={titleId} className="text-lg font-bold">
        {t('duplicates.compare.preview')}
      </h3>
      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[max-content_1fr]">
        {FIELDS.map((field) => (
          <div key={field} className="contents">
            <dt className="font-bold">{t(`duplicates.compare.fields.${field}`)}</dt>
            <dd className="break-words">{result[field] ?? empty}</dd>
          </div>
        ))}
        {result.attributes.map((attribute) => (
          <div key={attribute.key} className="contents">
            <dt className="font-bold break-words">{attribute.key}</dt>
            <dd className="break-words">{attribute.value}</dd>
          </div>
        ))}
        <div className="contents">
          <dt className="font-bold">{t('duplicates.compare.tags')}</dt>
          <dd>
            {result.tags.length === 0 ? (
              empty
            ) : (
              <ul className="flex flex-wrap gap-2">
                {result.tags.map((tag) => (
                  <li key={tag} className="rounded-md bg-muted px-2 py-0.5 text-sm break-all">
                    {tag}
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}
