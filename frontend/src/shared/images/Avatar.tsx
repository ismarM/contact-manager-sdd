import { IconUser } from '@tabler/icons-react';

import { cn } from '../lib/cn';
import { AVATAR_CLASS, avatarColorFor, initials } from './avatarColor';
import type { PhotoSize } from './photoTypes';
import { useProtectedImage } from './useProtectedImage';

export type AvatarSize = 24 | 32 | 40 | 64 | 128;

export interface AvatarProps {
  kind: 'user' | 'contact' | 'group';
  /** Ime za začetnice; `null` = izbrisan uporabnik (nevtralen avatar). */
  name: string | null;
  /** Uporabnik: e-naslov, kontakt: id, skupina: koda barve skupine. */
  colorSeed: string;
  size: AvatarSize;
  /** Zaščitena slika: pot (relativna na `/api`) in revizija; `revision == null` = brez slike, zahtevka ni. */
  photo?: { path: string; revision: number | null | undefined };
  /** Že pripravljen naslov slike (npr. predogled); prevlada nad `photo`. */
  src?: string | null;
  /** Dostopno ime; privzeto `name`. Prazen niz, kadar ime stoji ob avatarju (okras). */
  alt?: string;
}

const BOX: Record<AvatarSize, string> = {
  24: 'size-6',
  32: 'size-8',
  40: 'size-10',
  64: 'size-16',
  128: 'size-32',
};
/** Velikost besedila ≈ 40 % premera. */
const TEXT: Record<AvatarSize, string> = {
  24: 'text-[10px]',
  32: 'text-xs',
  40: 'text-base',
  64: 'text-2xl',
  128: 'text-5xl',
};

/** Strežnik izdela 96, 256 in 512: dovolj za gostoto 2×. */
const sizeFor = (size: AvatarSize): PhotoSize => (size <= 40 ? 96 : 256);

/**
 * Avatar (design.md 4.2; FR-018-21): slika, sicer začetnice (največ 2) v barvi iz osmih barv skupin kot besedilo z
 * robom 1 px na `surface`. Izbrisan uporabnik ima nevtralno ikono. Okrogel; velikosti 24, 32, 40, 64, 128 px.
 */
export function Avatar({ kind, name, colorSeed, size, photo, src, alt }: AvatarProps) {
  const { src: loadedSrc, attach } = useProtectedImage(
    photo?.path ?? null,
    photo?.revision,
    sizeFor(size),
  );
  const url = src ?? loadedSrc;
  const label = alt ?? name ?? '';
  const common = 'inline-flex shrink-0 select-none items-center justify-center rounded-full';

  if (url) {
    return (
      <img
        ref={attach}
        src={url}
        alt={label}
        className={cn(common, BOX[size], 'border border-border bg-card object-cover')}
      />
    );
  }

  const color = AVATAR_CLASS[name === null ? 'grafit' : avatarColorFor(kind, colorSeed)];
  const decorative = label === '';
  // Okrasne začetnice so vsebina pseudoelementa, ne besedila v DOM-u: sicer gumb z avatarjem (meni računa) krši
  // WCAG 2.5.3 (dostopno ime mora vsebovati vidno besedilo; axe `label-content-name-mismatch`).
  const initialsText = name === null ? null : initials(name);
  return (
    <span
      ref={attach}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? true : undefined}
      data-initials={decorative ? (initialsText ?? undefined) : undefined}
      className={cn(
        common,
        BOX[size],
        TEXT[size],
        'border bg-card leading-none font-bold',
        color,
        decorative && initialsText !== null && 'after:content-[attr(data-initials)]',
      )}
    >
      {name === null ? (
        <IconUser aria-hidden="true" size={Math.round(size * 0.6)} stroke={1.75} />
      ) : (
        !decorative && <span aria-hidden="true">{initialsText}</span>
      )}
    </span>
  );
}
