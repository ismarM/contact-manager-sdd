// Skupni razredi Kartoteke v2 (design.md 8.1, 8.2, 8.12, 8.13, 8.20, 13.3) – samo žetoni iz app.css.

/** Obroba fokusa: 2 px `accent`, odmik 2 px; v načinu vsiljenih barv `Highlight` (8.12). */
export const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring forced-colors:focus-visible:outline-[Highlight]';

/** Pritisk: merilo 0,98 v `duration-fast`; brez gibanja ob `prefers-reduced-motion` (motion-safe). */
const press =
  'motion-safe:transition-[transform,background-color,border-color] motion-safe:duration-fast motion-safe:ease-out motion-safe:active:scale-[0.98]';

const button = `inline-flex h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-sm px-4 text-base font-bold disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:h-12 forced-colors:border forced-colors:border-[ButtonText] ${press}`;

/** Primarni: poln `accent`, ena glavna akcija zaslona. */
export const primaryButton = `${button} bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover ${focusRing}`;

/** Mehki: `accent-soft` z besedilom `accent` (Filtri, Povabi, Izvozi). */
export const softButton = `${button} bg-selected text-primary hover:bg-muted ${focusRing}`;

/** Sekundarni: `surface`, rob 1 px `border` (3 : 1), ob prehodu `sunken`. */
export const secondaryButton = `${button} border border-input bg-card text-foreground hover:bg-muted ${focusRing}`;

/** Tihi: brez roba in ozadja, ob prehodu `sunken` (Prekliči, akcije v vrsticah). */
export const ghostButton = `${button} bg-transparent text-foreground hover:bg-muted ${focusRing}`;

/** Nevarni: poln `danger`, samo potrditveni gumb v dialogu nevarne operacije. */
export const dangerButton = `${button} bg-destructive text-destructive-foreground hover:opacity-90 ${focusRing}`;

/** Vnosno polje: višina 44 px, rob 1 px `border`, ob napaki rob 2 px `danger`. */
export const textInput = `min-h-11 w-full rounded-sm border border-input bg-card px-3 py-2 text-base text-foreground placeholder:text-muted-foreground hover:border-muted-foreground aria-[invalid=true]:border-2 aria-[invalid=true]:border-destructive pointer-coarse:min-h-12 motion-safe:transition-[border-color] motion-safe:duration-fast ${focusRing}`;

/** Kartica: `surface`, rob `divider`, `radius-md`; brez sence v mirovanju. */
export const card = 'rounded-md border border-border bg-card text-card-foreground';

/** Interaktivna kartica: ob prehodu `shadow-sm`. */
export const interactiveCard = `${card} hover:shadow-sm motion-safe:transition-shadow motion-safe:duration-fast`;

/** Povezava v tekočem besedilu (8.20): podčrtana, `accent`, ob prehodu `accent-hover`. */
export const textLink = `text-primary underline decoration-1 underline-offset-[3px] hover:text-primary-hover ${focusRing}`;

/** Povezava »Nazaj na …« (design.md 8.2): brez podčrtaja, ob lebdenju podčrtana; podčrtane so samo povezave v tekočem besedilu. */
export const backLink = `text-primary hover:underline decoration-1 underline-offset-[3px] ${focusRing}`;

export const fieldError = 'text-destructive';

/** Napaka akcije (8.13): `danger-soft`, `radius-md`, brez barvnih robov na levi. */
export const errorAlert =
  'flex gap-2 rounded-md border border-border bg-destructive-soft p-3 text-foreground [&>svg]:text-destructive';

/** Opozorilo stanja (8.13): enak vzorec v `warning`. */
export const warningAlert =
  'flex flex-col gap-3 rounded-md border border-border bg-warning-soft p-3 text-foreground [&>svg]:text-warning';
