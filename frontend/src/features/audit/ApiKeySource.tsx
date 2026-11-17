import { useTranslation } from 'react-i18next';

/**
 * Oznaka »prek API ključa »ime«« ob vnosu sledi in dogodku zgodovine (019, FR-019-12): izpiše se samo, kadar je
 * sprememba narejena z API ključem (`apiKeyName` ni `null`); brez imena »prek API«.
 */
export function ApiKeySource({ name }: { name: string | null | undefined }) {
  const { t } = useTranslation();
  if (name === null || name === undefined) return null;
  return (
    <>
      {' '}
      <span className="text-muted-foreground">
        {name === '' ? t('audit.source.viaApi') : t('audit.source.viaApiKey', { name })}
      </span>
    </>
  );
}
