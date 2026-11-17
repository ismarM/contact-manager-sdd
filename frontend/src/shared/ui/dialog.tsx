import { Dialog as Primitive } from 'radix-ui';
import type { ComponentProps } from 'react';

import { cn } from '../lib/cn';

// shadcn/ui Dialog (D-15), prilagojen po design.md 8.10 in 13.4: brez lucide in skritega angleškega »Close« (zapiranje
// z Esc in gumbom Prekliči), `raised`, rob `divider`, `radius-lg`, senca `lg`, ozadje `rgb(18 18 17 / 0.45)` brez
// zameglitve; na namizju sredinski do 480 px (obrazci 560 px), na telefonu spodnja ploskev čez celo širino;
// drsenje ne drsi strani pod dialogom.

export const Dialog = Primitive.Root;
export const DialogTrigger = Primitive.Trigger;
export const DialogClose = Primitive.Close;

export function DialogContent({
  className,
  children,
  wide = false,
  ...props
}: ComponentProps<typeof Primitive.Content> & {
  /** Obrazec: do 560 px namesto 480 px. */
  wide?: boolean;
}) {
  return (
    <Primitive.Portal>
      <Primitive.Overlay className="fixed inset-0 z-50 k-fade-in overscroll-contain bg-backdrop" />
      <Primitive.Content
        aria-describedby={undefined}
        className={cn(
          'fixed bottom-0 left-0 z-50 flex max-h-[90dvh] w-full k-pop-in flex-col gap-4 overflow-y-auto overscroll-contain rounded-t-lg border border-border bg-popover p-6 text-popover-foreground shadow-lg sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100vw-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg',
          wide ? 'sm:max-w-[560px]' : 'sm:max-w-[480px]',
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
