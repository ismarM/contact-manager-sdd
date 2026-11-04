import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { useDocumentTitle } from '../lib/useDocumentTitle';

/**
 * Stran »Te strani ni« (design.md 9.10, FR-001-13). Uporabijo jo tudi druge funkcionalnosti, ko zaledje za vir vrne
 * 404 – stran ne razkrije, ali vir obstaja.
 */
export function NotFoundPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('title.notFound'));

  return (
    <section className="mx-auto flex max-w-[70ch] flex-col gap-4 px-4 py-8">
      <h1 className="text-2xl font-bold">{t('notFound.heading')}</h1>
      <p>{t('notFound.text')}</p>
      <p>
        <Link
          to="/"
          className="font-bold text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {t('notFound.back')}
        </Link>
      </p>
    </section>
  );
}
