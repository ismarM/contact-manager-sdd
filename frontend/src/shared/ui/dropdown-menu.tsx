import { IconCheck } from '@tabler/icons-react';
import { DropdownMenu as Primitive } from 'radix-ui';
import type { ComponentProps } from 'react';

import { cn } from '../lib/cn';

// shadcn/ui Dropdown Menu (D-15), prilagojen po design.md 13.4: ikone Tabler, skupni fokus (13.3), text-base,
// višina h-11 (dotik h-12), zaobljenost do rounded-lg, senca samo float (lebdi nad stranjo), brez lucide.

export const DropdownMenu = Primitive.Root;
export const DropdownMenuTrigger = Primitive.Trigger;
export const DropdownMenuRadioGroup = Primitive.RadioGroup;
export const DropdownMenuGroup = Primitive.Group;

const item =
  'flex h-11 w-full cursor-default items-center gap-2 rounded-md px-3 text-base outline-none select-none data-[highlighted]:bg-muted data-[highlighted]:outline-2 data-[highlighted]:outline-offset-[-2px] data-[highlighted]:outline-ring pointer-coarse:h-12 forced-colors:data-[highlighted]:outline-[Highlight]';

export function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Content
      sideOffset={sideOffset}
      collisionPadding={8}
      className={cn(
        'z-50 min-w-56 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-float',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof Primitive.Item>) {
  return <Primitive.Item className={cn(item, className)} {...props} />;
}

export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: ComponentProps<typeof Primitive.RadioItem>) {
  return (
    <Primitive.RadioItem className={cn(item, 'relative pl-9', className)} {...props}>
      <span className="absolute left-3 flex size-5 items-center justify-center">
        <Primitive.ItemIndicator>
          <IconCheck aria-hidden="true" size={20} stroke={1.75} />
        </Primitive.ItemIndicator>
      </span>
      {children}
    </Primitive.RadioItem>
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof Primitive.Label>) {
  return (
    <Primitive.Label
      className={cn('px-3 pt-2 pb-1 text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof Primitive.Separator>) {
  return <Primitive.Separator className={cn('my-1 h-px bg-border', className)} {...props} />;
}
