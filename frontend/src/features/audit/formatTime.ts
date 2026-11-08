import { useTranslation } from 'react-i18next';

/**
 * Čas vnosa po design.md §11 (plan.md 005, D-47) v časovnem pasu brskalnika: sl »12. 10. 2026, 14.32«, en
 * "12 Oct 2026, 14:32".
 */
export function formatAuditTime(iso: string, language: 'sl' | 'en'): string {
  const instant = new Date(iso);
  if (language === 'sl') {
    const date = new Intl.DateTimeFormat('sl', {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
    }).format(instant);
    const clock = new Intl.DateTimeFormat('sl', {
      hour: 'numeric',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .format(instant)
      .replace(':', '.');
    return `${date}, ${clock}`;
  }
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(instant);
}

/** Oblikovalnik časa v trenutnem jeziku vmesnika. */
export function useAuditTime(): (iso: string) => string {
  const { i18n } = useTranslation();
  const language = i18n.language.startsWith('en') ? 'en' : 'sl';
  return (iso) => formatAuditTime(iso, language);
}
