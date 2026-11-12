import { useTranslation } from 'react-i18next';

/** Razdelek *Moji podatki* (design.md 9.9, točka 3; FR-012-01). Ogrodje – vedenje pride z implementacijo. */
export function MyDataSection() {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="account-data" className="flex flex-col gap-3">
      <h2 id="account-data" className="text-xl font-bold">
        {t('account.data.heading')}
      </h2>
    </section>
  );
}
