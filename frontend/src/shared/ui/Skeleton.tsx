import { cn } from '../lib/cn';

/** Skelet (design.md 6, 8.15): miren blok `sunken` z blagim utripanjem; ob zmanjšanem gibanju statičen. Okras (`aria-hidden`). */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('h-4 w-full k-skeleton', className)} />;
}

/**
 * Mirno nalaganje seznama ali zaslona (design.md 6): skelet iz vrstic (okras) in besedilo za bralnik zaslona v
 * `role="status"`. Klicatelj ga prikaže šele po 300 ms (`useDelayed`), da hitro nalaganje ne utripa.
 */
export function LoadingState({
  label,
  rows = 3,
  className,
}: {
  label: string;
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <p role="status" className="sr-only">
        {label}
      </p>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={i % 2 === 0 ? 'h-12' : 'h-12 w-5/6'} />
      ))}
    </div>
  );
}
