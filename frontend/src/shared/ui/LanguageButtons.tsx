import { useTranslation } from 'react-i18next';

import type { Language } from '../../i18n/language';

const LANGUAGES: Language[] = ['sl', 'en'];

/** Preklop jezika »Slovenščina · English« (design.md 9.1); imena jezikov so vedno v svojem jeziku. */
export function LanguageButtons({ onChange }: { onChange: (language: Language) => void }) {
  const { t, i18n } = useTranslation();

  return (
    <div role="group" aria-label={t('language.label')} className="flex items-center gap-2">
      {LANGUAGES.map((language, index) => (
        <span key={language} className="flex items-center gap-2">
          {index > 0 && (
            <span aria-hidden="true" className="text-muted-foreground">
              ·
            </span>
          )}
          <button
            type="button"
            lang={language}
            aria-pressed={i18n.language === language}
            onClick={() => onChange(language)}
            className="h-11 rounded-md px-2 text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-pressed:font-bold aria-pressed:text-foreground pointer-coarse:h-12"
          >
            {t(`language.${language}`)}
          </button>
        </span>
      ))}
    </div>
  );
}
