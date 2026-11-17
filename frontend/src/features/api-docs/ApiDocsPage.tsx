import { IconFileDownload, IconListDetails } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { useDocumentTitle } from '../../shared/lib/useDocumentTitle';
import { Wordmark } from '../../shared/layout/Sidebar';
import { useMediaQuery, WIDE } from '../../shared/lib/useMediaQuery';
import { LanguageButtons } from '../../shared/ui/LanguageButtons';
import { card, focusRing, secondaryButton, softButton, textLink } from '../../shared/ui/styles';
import { useAuth } from '../auth/authContext';
import { API_EXAMPLES } from './apiExamples';
import { API_OPERATIONS, API_VERSION, ERROR_CODES, OPENAPI_PATH } from './apiOperations';
import { CodeBlock } from './CodeBlock';

/** Največ zahtev na minuto na ključ (`api-keys.rate-limit`, plan.md; FR-019-16). */
const RATE_LIMIT = 120;

const heading = 'scroll-mt-6 text-xl font-semibold';
const section = 'flex flex-col gap-3';
const mono = 'font-mono text-sm break-all';

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

/** Značka metode (design.md 8.4): GET informacija, POST uspeh, PUT opozorilo, DELETE nevarnost; vedno z besedilom. */
const METHOD_BADGE: Record<string, string> = {
  GET: 'bg-selected text-primary',
  POST: 'bg-success-soft text-success',
  PUT: 'bg-warning-soft text-warning',
  DELETE: 'border border-destructive text-destructive',
};

/** Širina, od katere so operacije in kode napak vrstice preglednice (pod njo kartice). */
const ROW_GRID =
  'md:grid md:grid-cols-[5rem_minmax(0,1.4fr)_minmax(0,2fr)_7rem_9rem] md:items-baseline md:gap-x-4';
const ERROR_GRID = 'md:grid md:grid-cols-[4rem_14rem_minmax(0,1fr)] md:items-baseline md:gap-x-4';

/**
 * Javna stran *API* (019, FR-019-14, -15, -19; design.md 9): razlaga vmesnika /v1, vse operacije z najnižjo vlogo in
 * pravico ključa, primeri s *Kopiraj*, paginacija, kode napak, omejitve, različica ter prenos strojno berljivega opisa.
 * Dostopna brez prijave, brez ogrodja aplikacije: glava z besedno znamko, jezikom in vrnitvijo, vsebina s kazalom
 * (od 1024 px stranski pas, sicer zložljiv). Vsebina in primeri so enaki za prijavljene in neprijavljene.
 */
export function ApiDocsPage() {
  const { t } = useTranslation();
  const { status, changeLanguage } = useAuth();
  const wide = useMediaQuery(WIDE);
  useDocumentTitle(`${t('apiDocs.title')} – ${t('app.name')}`);
  const origin = window.location.origin;
  const signedIn = status === 'signedIn';

  const toc = (
    <nav aria-label={t('apiDocs.toc')} className="flex flex-col gap-0.5">
      {SECTIONS.map((entry) => (
        <a
          key={entry}
          href={`#api-${entry}`}
          className={`flex min-h-11 items-center rounded-sm px-3 text-sm font-medium text-foreground hover:bg-muted ${focusRing}`}
        >
          {t(`apiDocs.${entry}.heading`)}
        </a>
      ))}
    </nav>
  );

  return (
    <div className="min-h-dvh bg-background px-4 py-4 md:px-12 md:py-8">
      <header className="mx-auto mb-6 flex max-w-6xl flex-wrap items-center justify-between gap-x-3 gap-y-1 md:mb-10">
        <Wordmark />
        <div className="flex flex-wrap items-center gap-x-2">
          <LanguageButtons onChange={changeLanguage} />
          <Link to={signedIn ? '/account' : '/login'} className={`${secondaryButton} h-9 px-3`}>
            {signedIn ? t('apiDocs.backToAccount') : t('apiDocs.backToLogin')}
          </Link>
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-12">
        {wide ? (
          <div className="sticky top-6">
            <p className="px-3 pb-1 text-sm font-medium text-muted-foreground">
              {t('apiDocs.toc')}
            </p>
            {toc}
          </div>
        ) : (
          <details className={`${card} group px-4 py-2`}>
            <summary
              className={`flex min-h-8 cursor-pointer list-none items-center gap-1.5 rounded-sm text-sm font-medium ${focusRing}`}
            >
              <IconListDetails aria-hidden="true" size={16} stroke={1.75} />
              {t('apiDocs.toc')}
            </summary>
            <div className="pt-2">{toc}</div>
          </details>
        )}
        <main className="flex max-w-3xl min-w-0 flex-col gap-9">
          <div className="flex flex-col gap-3">
            <span className="inline-flex items-center self-start rounded-xs bg-selected px-2 py-0.5 text-sm text-primary">
              {t('apiDocs.version', { version: API_VERSION })}
            </span>
            <h1 className="text-2xl font-semibold md:text-3xl">{t('apiDocs.heading')}</h1>
            <p className="max-w-prose text-muted-foreground">{t('apiDocs.intro')}</p>
            <a
              href={OPENAPI_PATH}
              download="openapi.json"
              className={`${softButton} self-start max-sm:w-full`}
            >
              <IconFileDownload aria-hidden="true" size={20} stroke={1.75} />
              {t('apiDocs.download')}
            </a>
          </div>

          <section aria-labelledby="api-security" className={section}>
            <h2 id="api-security" className={heading}>
              {t('apiDocs.security.heading')}
            </h2>
            <ul className="flex max-w-prose list-disc flex-col gap-1.5 pl-5">
              <li>{t('apiDocs.security.secret')}</li>
              <li>{t('apiDocs.security.leastPrivilege')}</li>
              <li>{t('apiDocs.security.revoke')}</li>
              <li>{t('apiDocs.security.memberSees')}</li>
              <li>{t('apiDocs.security.noCors')}</li>
            </ul>
          </section>

          <section aria-labelledby="api-create" className={section}>
            <h2 id="api-create" className={heading}>
              {t('apiDocs.create.heading')}
            </h2>
            <p className="max-w-prose">{t('apiDocs.create.text')}</p>
            <p className="max-w-prose">{t('apiDocs.create.limit')}</p>
            <p>
              <Link to="/account" className={`${textLink} text-sm`}>
                {t('apiDocs.create.link')}
              </Link>
            </p>
          </section>

          <section aria-labelledby="api-auth" className={section}>
            <h2 id="api-auth" className={heading}>
              {t('apiDocs.auth.heading')}
            </h2>
            <p className="max-w-prose">{t('apiDocs.auth.text')}</p>
            <CodeBlock
              name={t('apiDocs.auth.heading')}
              label="HTTP"
              code={`Authorization: Bearer cmk_…`}
            />
            <p className="max-w-prose">{t('apiDocs.auth.rights')}</p>
          </section>

          <section aria-labelledby="api-operations" className={section}>
            <h2 id="api-operations" className={heading}>
              {t('apiDocs.operations.heading')}
            </h2>
            <div className="flex flex-col gap-2 md:gap-0 md:overflow-hidden md:rounded-md md:border md:border-border md:bg-card">
              <div
                aria-hidden="true"
                className={`${ROW_GRID} hidden bg-muted px-4 py-3 text-sm font-medium`}
              >
                <span>{t('apiDocs.operations.method')}</span>
                <span>{t('apiDocs.operations.path')}</span>
                <span>{t('apiDocs.operations.description')}</span>
                <span>{t('apiDocs.operations.role')}</span>
                <span>{t('apiDocs.operations.permission')}</span>
              </div>
              <ul
                aria-label={t('apiDocs.operations.caption')}
                className="flex flex-col gap-2 md:gap-0"
              >
                {API_OPERATIONS.map((operation) => (
                  <li
                    key={`${operation.method} ${operation.path}`}
                    className={`${ROW_GRID} flex flex-col gap-1 rounded-md border border-border bg-card px-4 py-3 text-sm md:rounded-none md:border-0 md:border-t`}
                  >
                    <span className="flex flex-wrap items-center gap-2 md:contents">
                      <span
                        className={`inline-flex w-fit items-center rounded-xs px-2 py-0.5 font-mono text-sm ${METHOD_BADGE[operation.method] ?? ''}`}
                      >
                        {operation.method}
                      </span>{' '}
                      <span className={mono}>{operation.path}</span>
                    </span>
                    <span>{t(`apiDocs.operations.${operation.text}`)}</span>
                    <dl className="flex flex-wrap gap-x-4 gap-y-0.5 text-muted-foreground md:contents">
                      <div className="flex gap-1.5 md:contents">
                        <dt className="md:sr-only">{t('apiDocs.operations.role')}</dt>
                        <dd>
                          {operation.role === 'VIEWER' || operation.role === 'EDITOR'
                            ? t(`roles.${operation.role}`)
                            : operation.role === 'any'
                              ? t('apiDocs.operations.roleAny')
                              : t('apiDocs.operations.rolePublic')}
                        </dd>
                      </div>
                      <div className="flex gap-1.5 md:contents">
                        <dt className="md:sr-only">{t('apiDocs.operations.permission')}</dt>
                        <dd>
                          {operation.permission === 'none'
                            ? t('apiDocs.operations.permissionNone')
                            : operation.permission === 'READ'
                              ? t('apiDocs.operations.permissionRead')
                              : t('apiDocs.operations.permissionWrite')}
                        </dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-sm text-muted-foreground">{t('apiDocs.operations.archived')}</p>
          </section>

          <section aria-labelledby="api-examples" className={section}>
            <h2 id="api-examples" className={heading}>
              {t('apiDocs.examples.heading')}
            </h2>
            {API_EXAMPLES.map((example) => {
              const name = t(`apiDocs.examples.${example.id}`);
              return (
                <div key={example.id} className="flex flex-col gap-2.5">
                  <h3 className="font-medium">{name}</h3>
                  <CodeBlock
                    name={`${name} – ${t('apiDocs.examples.request')}`}
                    label={t('apiDocs.examples.request')}
                    code={example.request(origin)}
                  />
                  <CodeBlock
                    name={`${name} – ${t('apiDocs.examples.response')}`}
                    label={t('apiDocs.examples.response')}
                    code={example.response}
                    copyable={false}
                  />
                </div>
              );
            })}
          </section>

          <section aria-labelledby="api-pagination" className={section}>
            <h2 id="api-pagination" className={heading}>
              {t('apiDocs.pagination.heading')}
            </h2>
            <p className="max-w-prose">{t('apiDocs.pagination.text')}</p>
          </section>

          <section aria-labelledby="api-errors" className={section}>
            <h2 id="api-errors" className={heading}>
              {t('apiDocs.errors.heading')}
            </h2>
            <div className="flex flex-col gap-2 md:gap-0 md:overflow-hidden md:rounded-md md:border md:border-border md:bg-card">
              <div
                aria-hidden="true"
                className={`${ERROR_GRID} hidden bg-muted px-4 py-3 text-sm font-medium`}
              >
                <span>{t('apiDocs.errors.status')}</span>
                <span>{t('apiDocs.errors.code')}</span>
                <span>{t('apiDocs.errors.meaning')}</span>
              </div>
              <ul aria-label={t('apiDocs.errors.caption')} className="flex flex-col gap-2 md:gap-0">
                {ERROR_CODES.map(({ status: httpStatus, code }) => (
                  <li
                    key={code}
                    className={`${ERROR_GRID} flex flex-col gap-0.5 rounded-md border border-border bg-card px-4 py-3 text-sm md:rounded-none md:border-0 md:border-t`}
                  >
                    <span className="flex flex-wrap items-baseline gap-x-3 md:contents">
                      <span className="tabular-nums">{httpStatus}</span>
                      <span className={mono}>{code}</span>
                    </span>
                    <span>{t(`apiDocs.errors.${code}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section aria-labelledby="api-limits" className={section}>
            <h2 id="api-limits" className={heading}>
              {t('apiDocs.limits.heading')}
            </h2>
            <p className="max-w-prose">{t('apiDocs.limits.rate', { limit: RATE_LIMIT })}</p>
          </section>

          <section aria-labelledby="api-versions" className={section}>
            <h2 id="api-versions" className={heading}>
              {t('apiDocs.versions.heading')}
            </h2>
            <p className="max-w-prose">{t('apiDocs.versions.text')}</p>
            <h3 className="font-medium">{t('apiDocs.versions.changes')}</h3>
            <ul className="list-disc pl-5">
              <li>{t('apiDocs.versions.v1')}</li>
            </ul>
          </section>
        </main>
      </div>
    </div>
  );
}
