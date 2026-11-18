import type { GroupColor } from '../../features/groups/types';
import { initials } from '../images/avatarColor';
import type { PhotoSize } from '../images/photoTypes';
import { useProtectedImage } from '../images/useProtectedImage';
import { cn } from '../lib/cn';

// Monogram skupine (design.md 8.17a): ploščica v barvi skupine z začetnicama v `on-accent` (`radius-sm`); 24 in 32 px
// v menijih in seznamih, 48 px (zaobljenost 10 px) na karticah in glavi. Skupina s sliko (018) ima sliko namesto ploščice.
// Vedno ob imenu skupine, zato je okras (`aria-hidden`).

export type MonogramSize = 24 | 32 | 48;

const TILE: Record<GroupColor, string> = {
  tinta: 'bg-group-tinta',
  mah: 'bg-group-mah',
  opeka: 'bg-group-opeka',
  oker: 'bg-group-oker',
  sliva: 'bg-group-sliva',
  morje: 'bg-group-morje',
  grafit: 'bg-group-grafit',
  rja: 'bg-group-rja',
};
const BOX: Record<MonogramSize, string> = {
  24: 'size-6 rounded-sm text-[10px]',
  32: 'size-8 rounded-sm text-sm',
  48: 'size-12 rounded-[10px] text-lg',
};
const sizeFor = (size: MonogramSize): PhotoSize => (size <= 32 ? 96 : 256);

export function Monogram({
  title,
  color,
  size,
  photo,
  className,
}: {
  title: string;
  color: GroupColor;
  size: MonogramSize;
  photo?: { path: string; revision: number | null | undefined };
  className?: string;
}) {
  const { src, attach } = useProtectedImage(photo?.path ?? null, photo?.revision, sizeFor(size));
  if (src) {
    return (
      <img
        ref={attach}
        src={src}
        alt=""
        aria-hidden="true"
        className={cn('shrink-0 border border-border object-cover', BOX[size], className)}
      />
    );
  }
  return (
    <span
      ref={attach}
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-bold text-primary-foreground select-none forced-colors:border forced-colors:border-[CanvasText]',
        TILE[color],
        BOX[size],
        className,
      )}
    >
      {initials(title)}
    </span>
  );
}
