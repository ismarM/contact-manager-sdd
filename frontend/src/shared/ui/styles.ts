// Skupni razredi Kartoteke (design.md 8.1, 8.2, 8.13, 13.3) – samo žetoni iz app.css.

export const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

const button =
  'inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md px-4 text-base font-bold disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:h-12';

export const primaryButton = `${button} bg-primary text-primary-foreground hover:bg-primary-hover ${focusRing}`;

export const secondaryButton = `${button} border border-border bg-card text-foreground hover:bg-muted ${focusRing}`;

export const dangerButton = `${button} bg-destructive text-primary-foreground hover:opacity-90 ${focusRing}`;

export const textInput = `w-full rounded-md border border-input bg-card px-3 py-2 text-base text-foreground aria-[invalid=true]:border-destructive ${focusRing}`;

export const fieldError = 'text-destructive';

export const errorAlert =
  'flex gap-2 rounded-md border-l-4 border-destructive bg-destructive-soft p-3';

export const warningAlert =
  'flex flex-col gap-3 rounded-md border-l-4 border-warning bg-warning-soft p-3';
