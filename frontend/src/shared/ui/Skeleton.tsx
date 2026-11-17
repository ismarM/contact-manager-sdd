import { cn } from '../lib/cn';

/** Skelet (design.md 6, 8.15): miren blok `sunken` z blagim utripanjem; ob zmanjšanem gibanju statičen. Okras (`aria-hidden`). */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('h-4 w-full k-skeleton', className)} />;
}
