import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { useDocumentTitle } from '../lib/useDocumentTitle';
import { NotFoundIllustration } from '../ui/illustrations';
import { primaryButton } from '../ui/styles';

/**
 * Stran »Te strani ni« (design.md 9.10, FR-001-13, FR-020-16, -24): sredinska ilustracija, koda napake, naslov, stavek
 * in povezava na seznam skupin. Uporabijo jo tudi druge funkcionalnosti, ko zaledje za vir vrne 404 – stran ne razkrije,
 * ali vir obstaja.
 */
export function NotFoundPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('title.notFound'));

  return (
    <section className="mx-auto flex max-w-[70ch] flex-col items-center gap-3 px-4 py-12 text-center md:py-16">
      <NotFoundIllustration size={200} />
      <p className="text-sm font-semibold text-muted-foreground">{t('notFound.code')}</p>
      <h1 className="text-2xl font-semibold md:text-3xl">{t('notFound.heading')}</h1>
      <p className="text-muted-foreground">{t('notFound.text')}</p>
      <Link to="/" className={`mt-2 ${primaryButton}`}>
        {t('notFound.back')}
      </Link>
    </section>
  );
}
