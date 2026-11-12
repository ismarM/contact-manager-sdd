import { useTranslation } from 'react-i18next';

/** Razdelek *Izbris računa* (design.md 9.9, točka 4; FR-012-05). Ogrodje – vedenje pride z implementacijo. */
export function DeleteAccountSection() {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="account-delete" className="flex flex-col gap-3">
      <h2 id="account-delete" className="text-xl font-bold">
        {t('account.delete.heading')}
      </h2>
    </section>
  );
}
