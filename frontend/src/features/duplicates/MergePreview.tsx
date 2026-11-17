import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { countryName } from '../contacts/countries';
import { useUiLanguage } from '../contacts/useUiLanguage';
import { useFormatters } from '../formats/useFormatters';
import { FIELDS } from './mergeModel';
import type { MergeResultInput } from './types';

/** Predogled združenega kontakta (FR-011-12): sproti posodobljen rezultat po trenutnih izbirah. */
export function MergePreview({ result }: { result: MergeResultInput }) {
  const { t } = useTranslation();
  const language = useUiLanguage();
  const format = useFormatters();
  const titleId = useId();
  const empty = t('duplicates.compare.emptyValue');

  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-md border border-border bg-card p-5"
    >
      <h3 id={titleId} className="text-lg font-bold">
        {t('duplicates.compare.preview')}
      </h3>
      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[max-content_1fr]">
        {FIELDS.map((field) => (
          <div key={field} className="contents">
            <dt className="font-bold">{t(`duplicates.compare.fields.${field}`)}</dt>
            <dd className="break-words">
              {field === 'country' && result.country
                ? countryName(result.country, language)
                : field === 'address' && result.addressParts
                  ? format.address(result.addressParts, true)
                  : (result[field] ?? empty)}
            </dd>
          </div>
        ))}
        {result.attributes.map((attribute) => (
          <div key={attribute.key} className="contents">
            <dt className="font-bold break-words">{attribute.key}</dt>
            <dd className="break-words whitespace-pre-line">
              {attribute.parts ? format.address(attribute.parts, true) : attribute.value}
            </dd>
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
                  <li
                    key={tag}
                    className="rounded-full bg-selected px-3 py-0.5 text-sm break-all text-primary"
                  >
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
