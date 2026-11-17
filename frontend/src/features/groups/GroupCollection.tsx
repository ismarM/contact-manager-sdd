import { cn } from '../../shared/lib/cn';
import { GroupCard } from './GroupCard';
import type { GroupEntry } from './useGroupList';

/**
 * Zbirka skupin (FR-020-10): na namizju mreža kartic, na telefonu vrstice v enem seznamu. Seznam ima ime (`label`);
 * med ponovnim nalaganjem je `aria-busy`.
 */
export function GroupCollection({
  items,
  label,
  busy,
  archived = false,
}: {
  items: GroupEntry[];
  label: string;
  busy: boolean;
  archived?: boolean;
}) {
  return (
    <ul
      aria-label={label}
      aria-busy={busy}
      className={cn(
        'm-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2 md:gap-4 xl:grid-cols-3',
      )}
    >
      {items.map((group) => (
        <GroupCard key={group.id} group={group} archived={archived} />
      ))}
    </ul>
  );
}
