import { GROUP_COLORS, type GroupColor } from './types';

// Barve skupin (design.md 4.2): koda v API-ju → razred žetona jezička (samo žetoni, design.md 13.2).
export const COLOR_SWATCH: Record<GroupColor, string> = {
  tinta: 'bg-group-tinta',
  mah: 'bg-group-mah',
  opeka: 'bg-group-opeka',
  oker: 'bg-group-oker',
  sliva: 'bg-group-sliva',
  morje: 'bg-group-morje',
  grafit: 'bg-group-grafit',
  rja: 'bg-group-rja',
};

export { GROUP_COLORS };
