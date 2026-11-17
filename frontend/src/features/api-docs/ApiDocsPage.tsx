import { IconDownload } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { useDocumentTitle } from '../../shared/lib/useDocumentTitle';
import { LanguageButtons } from '../../shared/ui/LanguageButtons';
import { focusRing, secondaryButton } from '../../shared/ui/styles';
import { useAuth } from '../auth/authContext';
import { API_EXAMPLES } from './apiExamples';
import { API_OPERATIONS, API_VERSION, ERROR_CODES, OPENAPI_PATH } from './apiOperations';
import { CodeBlock } from './CodeBlock';

/** Največ zahtev na minuto na ključ (`api-keys.rate-limit`, plan.md; FR-019-16). */
const RATE_LIMIT = 120;

const link = `font-bold text-primary underline decoration-1 underline-offset-[3px] ${focusRing}`;
const heading = 'text-xl font-bold';

const SECTIONS = [
  'security',
  'create',
  'auth',
  'operations',
  'examples',
  'pagination',
  'errors',
  'limits',
  'versions',
] as const;

/**
 * Javna stran *API* (019, FR-019-14, -15, -19; design.md 9): razlaga vmesnika /v1, vse operacije z najnižjo vlogo in
 * pravico ključa, primeri s *Kopiraj*, paginacija, kode napak, omejitve, različica ter prenos strojno berljivega opisa.
 * Dostopna brez prijave; vsebina in primeri so enaki za prijavljene in neprijavljene.
 */
export function ApiDocsPage() {
  const { t } = useTranslation();
  const { status, changeLanguage } = useAuth();
  useDocumentTitle(`${t('apiDocs.title')} – ${t('app.name')}`);
  const origin = window.location.origin;
  const signedIn = status === 'signedIn';

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[80ch] flex-col gap-8 px-4 py-8">
      <header className="flex flex-col gap-3">
        <h1 className="flex items-center gap-3 text-3xl font-bold">
          <span
            aria-hidden="true"
            className="inline-block h-9 w-1 shrink-0 rounded-sm bg-primary"
          />
          {t('apiDocs.heading')}
        </h1>
        <p>{t('apiDocs.intro')}</p>
        <p className="text-muted-foreground">{t('apiDocs.version', { version: API_VERSION })}</p>
        <div className="flex flex-wrap items-center gap-3">
          <a href={OPENAPI_PATH} download="openapi.json" className={secondaryButton}>
            <IconDownload aria-hidden="true" size={20} stroke={1.75} />
            {t('apiDocs.download')}
          </a>
          <Link to={signedIn ? '/account' : '/login'} className={link}>
            {signedIn ? t('apiDocs.backToAccount') : t('apiDocs.backToLogin')}
          </Link>
        </div>
        <nav aria-label={t('apiDocs.toc')}>
          <ul className="flex flex-col gap-1">
            {SECTIONS.map((section) => (
              <li key={section}>
                <a href={`#api-${section}`} className={`underline ${focusRing}`}>
                  {t(`apiDocs.${section}.heading`)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <section aria-labelledby="api-security" className="flex flex-col gap-3">
        <h2 id="api-security" className={heading}>
          {t('apiDocs.security.heading')}
        </h2>
        <ul className="list-disc space-y-2 pl-6">
          <li>{t('apiDocs.security.secret')}</li>
          <li>{t('apiDocs.security.leastPrivilege')}</li>
          <li>{t('apiDocs.security.revoke')}</li>
          <li>{t('apiDocs.security.memberSees')}</li>
          <li>{t('apiDocs.security.noCors')}</li>
        </ul>
      </section>

      <section aria-labelledby="api-create" className="flex flex-col gap-3">
        <h2 id="api-create" className={heading}>
          {t('apiDocs.create.heading')}
        </h2>
        <p>{t('apiDocs.create.text')}</p>
        <p>{t('apiDocs.create.limit')}</p>
        <p>
          <Link to="/account" className={link}>
            {t('apiDocs.create.link')}
          </Link>
        </p>
      </section>

      <section aria-labelledby="api-auth" className="flex flex-col gap-3">
        <h2 id="api-auth" className={heading}>
          {t('apiDocs.auth.heading')}
        </h2>
        <p>{t('apiDocs.auth.text')}</p>
        <CodeBlock name={t('apiDocs.auth.heading')} code={`Authorization: Bearer cmk_…`} />
        <p>{t('apiDocs.auth.rights')}</p>
      </section>

      <section aria-labelledby="api-operations" className="flex flex-col gap-3">
        <h2 id="api-operations" className={heading}>
          {t('apiDocs.operations.heading')}
        </h2>
        <ul aria-label={t('apiDocs.operations.caption')} className="flex flex-col gap-3">
          {API_OPERATIONS.map((operation) => (
            <li
              key={`${operation.method} ${operation.path}`}
              className="flex flex-col gap-1 rounded-md border border-border p-3"
            >
              <span className="font-mono font-bold break-all">
                {operation.method} {operation.path}
              </span>
              <span>{t(`apiDocs.operations.${operation.text}`)}</span>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <dt>{t('apiDocs.operations.role')}</dt>
                <dd>
                  {operation.role === 'VIEWER' || operation.role === 'EDITOR'
                    ? t(`roles.${operation.role}`)
                    : operation.role === 'any'
                      ? t('apiDocs.operations.roleAny')
                      : t('apiDocs.operations.rolePublic')}
                </dd>
                <dt>{t('apiDocs.operations.permission')}</dt>
                <dd>
                  {operation.permission === 'none'
                    ? t('apiDocs.operations.permissionNone')
                    : operation.permission === 'READ'
                      ? t('apiDocs.operations.permissionRead')
                      : t('apiDocs.operations.permissionWrite')}
                </dd>
              </dl>
            </li>
          ))}
        </ul>
        <p>{t('apiDocs.operations.archived')}</p>
      </section>

      <section aria-labelledby="api-examples" className="flex flex-col gap-4">
        <h2 id="api-examples" className={heading}>
          {t('apiDocs.examples.heading')}
        </h2>
        {API_EXAMPLES.map((example) => {
          const name = t(`apiDocs.examples.${example.id}`);
          return (
            <div key={example.id} className="flex flex-col gap-3">
              <h3 className="text-lg font-bold">{name}</h3>
              <p className="font-bold">{t('apiDocs.examples.request')}</p>
              <CodeBlock
                name={`${name} – ${t('apiDocs.examples.request')}`}
                code={example.request(origin)}
              />
              <p className="font-bold">{t('apiDocs.examples.response')}</p>
              <CodeBlock
                name={`${name} – ${t('apiDocs.examples.response')}`}
                code={example.response}
              />
            </div>
          );
        })}
      </section>

      <section aria-labelledby="api-pagination" className="flex flex-col gap-3">
        <h2 id="api-pagination" className={heading}>
          {t('apiDocs.pagination.heading')}
        </h2>
        <p>{t('apiDocs.pagination.text')}</p>
      </section>

      <section aria-labelledby="api-errors" className="flex flex-col gap-3">
        <h2 id="api-errors" className={heading}>
          {t('apiDocs.errors.heading')}
        </h2>
        <ul aria-label={t('apiDocs.errors.caption')} className="flex flex-col gap-2">
          {ERROR_CODES.map(({ status: httpStatus, code }) => (
            <li key={code} className="flex flex-col gap-1 rounded-md border border-border p-3">
              <span className="font-mono font-bold break-all">
                {httpStatus} {code}
              </span>
              <span>{t(`apiDocs.errors.${code}`)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="api-limits" className="flex flex-col gap-3">
        <h2 id="api-limits" className={heading}>
          {t('apiDocs.limits.heading')}
        </h2>
        <p>{t('apiDocs.limits.rate', { limit: RATE_LIMIT })}</p>
      </section>

      <section aria-labelledby="api-versions" className="flex flex-col gap-3">
        <h2 id="api-versions" className={heading}>
          {t('apiDocs.versions.heading')}
        </h2>
        <p>{t('apiDocs.versions.text')}</p>
        <h3 className="text-lg font-bold">{t('apiDocs.versions.changes')}</h3>
        <ul className="list-disc pl-6">
          <li>{t('apiDocs.versions.v1')}</li>
        </ul>
      </section>

      <footer className="flex justify-center pb-4">
        <LanguageButtons onChange={changeLanguage} />
      </footer>
    </main>
  );
}
