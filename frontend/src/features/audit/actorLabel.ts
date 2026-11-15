import { useTranslation } from 'react-i18next';

import type { Actor } from './types';

/** Ime izvajalca za izbiro in oznako filtra: ime, sicer e-naslov; izbrisan uporabnik z besedilom (feature-map §2.5). */
export function useActorLabel(): (actor: Actor, withFormer?: boolean) => string {
  const { t } = useTranslation();
  return (actor, withFormer = false) => {
    if (!actor.user) return t('audit.list.deletedUser');
    const name = actor.user.name ?? actor.user.email;
    return withFormer && actor.kind === 'FORMER'
      ? t('audit.filters.actorFormerName', { name })
      : name;
  };
}
