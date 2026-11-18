import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';

import { useGroupsApi, useListLanguage } from '../../features/groups/api';
import { useGroups } from '../../features/groups/groupsContext';
import { useInvitationsApi } from '../../features/invitations/api';
import { useInvitations } from '../../features/invitations/invitationsContext';

/** Števci glavne navigacije (R-06); `null` = števca ni (klic ni uspel ali še ni odgovora). */
export interface NavCounts {
  groups: number | null;
  archived: number | null;
  invitations: number | null;
}

const NONE: NavCounts = { groups: null, archived: null, invitations: null };

/**
 * Števci iz obstoječih endpointov (`GET /api/groups?size=1`, `GET /api/groups/archived?size=1`,
 * `GET /api/invitations/count`): trije neodvisni klici, vsak ob napaki brez števca. Osveži se ob spremembi poti, ob
 * spremembi števila skupin ali povabil (njuna `refresh()`).
 */
export function useNavCounts(): NavCounts {
  const groupsApi = useGroupsApi();
  const invitationsApi = useInvitationsApi();
  const lang = useListLanguage();
  const { pathname } = useLocation();
  const { total } = useGroups();
  const { count } = useInvitations();
  const [counts, setCounts] = useState<NavCounts>(NONE);

  useEffect(() => {
    let active = true;
    const set = (key: keyof NavCounts, value: number | null) => {
      if (active) setCounts((previous) => ({ ...previous, [key]: value }));
    };
    groupsApi.listGroups({ size: 1, lang }).then(
      (page) => set('groups', page.total),
      () => set('groups', null),
    );
    groupsApi.listArchived({ size: 1, lang }).then(
      (page) => set('archived', page.total),
      () => set('archived', null),
    );
    invitationsApi.count().then(
      (result) => set('invitations', result.count),
      () => set('invitations', null),
    );
    return () => {
      active = false;
    };
  }, [groupsApi, invitationsApi, lang, pathname, total, count]);

  return counts;
}
