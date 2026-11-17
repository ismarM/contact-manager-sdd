import { useId } from 'react';

import { cn } from '../lib/cn';

// Segmentni gumb (design.md 8.7): skupina izbirnih gumbov v `sunken` tiru; izbran segment `surface` z `shadow-sm`.
// Semantika: `radiogroup` z imenom; vsak segment je `radio` (puščice premikajo izbiro).

export interface Segment<V extends string> {
  value: V;
  label: string;
}

export function SegmentedControl<V extends string>({
  label,
  value,
  segments,
  onChange,
  className,
}: {
  label: string;
  value: V;
  segments: readonly Segment<V>[];
  onChange: (value: V) => void;
  className?: string;
}) {
  const name = useId();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('inline-flex rounded-sm bg-muted p-0.5', className)}
    >
      {segments.map((segment) => (
        <label
          key={segment.value}
          className={cn(
            'inline-flex h-9 cursor-pointer items-center rounded-xs px-3 text-sm font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring forced-colors:has-[:focus-visible]:outline-[Highlight] pointer-coarse:h-11',
            segment.value === value
              ? 'bg-card text-foreground shadow-sm forced-colors:border forced-colors:border-[Highlight]'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <input
            type="radio"
            name={name}
            value={segment.value}
            checked={segment.value === value}
            onChange={() => onChange(segment.value)}
            className="sr-only"
          />
          {segment.label}
        </label>
      ))}
    </div>
  );
}
