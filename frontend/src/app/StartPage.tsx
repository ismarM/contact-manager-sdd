import { useTranslation } from 'react-i18next';

// Začasna začetna stran ogrodja (FR-000-12, plan.md – Public Interfaces): besedni znak (design.md 13.5).
export function StartPage() {
  const { t } = useTranslation();

  return (
    <main className="mx-auto flex min-h-dvh max-w-[70ch] flex-col justify-center gap-4 px-4 py-8">
      <h1 className="flex items-center gap-3 text-2xl font-bold">
        <span aria-hidden="true" className="inline-block h-8 w-1 rounded-sm bg-primary" />
        {t('app.name')}
      </h1>
      <p className="text-muted-foreground">{t('start.ready')}</p>
    </main>
  );
}
