import { useTranslation } from 'react-i18next';

import { useDocumentTitle } from '../shared/lib/useDocumentTitle';

// Začasna začetna stran (do 002 – seznam skupin): besedni znak (design.md 13.5). Izriše se v ogrodju (`main`).
export function StartPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('app.name'));

  return (
    <section className="mx-auto flex max-w-[70ch] flex-col gap-4 px-4 py-8">
      <h1 className="flex items-center gap-3 text-2xl font-bold">
        <span aria-hidden="true" className="inline-block h-8 w-1 rounded-sm bg-primary" />
        {t('app.name')}
      </h1>
      <p className="text-muted-foreground">{t('start.ready')}</p>
    </section>
  );
}
