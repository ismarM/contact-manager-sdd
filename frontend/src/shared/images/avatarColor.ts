import { GROUP_COLORS, type GroupColor } from '../../features/groups/types';

// Barve avatarjev iz osmih barv skupin (design.md 4.2): samo besedilo in rob 1 px na ozadju `surface`, da ostane
// kontrast AA. Razredi so zapisani v celoti, da jih Tailwind najde (samo žetoni, design.md 13.2).
export const AVATAR_CLASS: Record<GroupColor, string> = {
  tinta: 'border-group-tinta text-group-tinta',
  mah: 'border-group-mah text-group-mah',
  opeka: 'border-group-opeka text-group-opeka',
  oker: 'border-group-oker text-group-oker',
  sliva: 'border-group-sliva text-group-sliva',
  morje: 'border-group-morje text-group-morje',
  grafit: 'border-group-grafit text-group-grafit',
  rja: 'border-group-rja text-group-rja',
};

function isGroupColor(value: string): value is GroupColor {
  return (GROUP_COLORS as readonly string[]).includes(value);
}

/** Stabilna barva po nizu (id ali e-naslov): FNV-1a, nato ostanek po osem. */
export function avatarColor(seed: string): GroupColor {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return GROUP_COLORS[hash % GROUP_COLORS.length] ?? 'grafit';
}

/** Skupina: njena barva (koda barve skupine); uporabnik in kontakt: barva po id-ju. */
export function avatarColorFor(kind: 'user' | 'contact' | 'group', seed: string): GroupColor {
  return kind === 'group' && isGroupColor(seed) ? seed : avatarColor(seed);
}

/** Največ dve začetnici: prva črka prve in zadnje besede; ena beseda (tudi e-naslov) da eno črko. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  const first = words[0];
  if (!first) return '?';
  const letter = (word: string) => Array.from(word)[0]?.toLocaleUpperCase() ?? '';
  const last = words.length > 1 ? words[words.length - 1] : undefined;
  return letter(first) + (last ? letter(last) : '');
}
