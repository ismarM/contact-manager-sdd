import { Dialog as Primitive } from 'radix-ui';
import type { ComponentProps } from 'react';

import { cn } from '../lib/cn';

// shadcn/ui Dialog (D-15), prilagojen po design.md 8.10 in 13.4: brez lucide in skritega angleškega »Close« (zapiranje
// z Esc in gumbom Prekliči), surface, rob, zaobljenost 6 px, senca float, ozadje brez zameglitve, na telefonu čez celo
// širino z odmikom 16 px; drsenje ne drsi strani pod dialogom.

export const Dialog = Primitive.Root;
export const DialogTrigger = Primitive.Trigger;
export const DialogClose = Primitive.Close;

export function DialogContent({
  className,
  children,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Overlay className="fixed inset-0 z-50 overscroll-contain bg-black/40" />
      <Primitive.Content
        aria-describedby={undefined}
        className={cn(
          'fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-[560px] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto overscroll-contain rounded-lg border border-border bg-card p-6 text-card-foreground shadow-float',
          className,
        )}
        {...props}
      >
        {children}
      </Primitive.Content>
    </Primitive.Portal>
  );
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof Primitive.Title>) {
  return <Primitive.Title className={cn('text-xl font-bold', className)} {...props} />;
}
