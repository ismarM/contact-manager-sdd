import { useEffect, useRef } from 'react';

export interface ComboOption {
  /** Vrednost, ki jo polje shrani ob izbiri (besedilo predloga ali koda države). */
  value: string;
  /** Prikazano besedilo. */
  label: string;
  /** Število uporab v skupini (predlogi); neobvezno. */
  count?: number;
}

/** Id možnosti `index` v seznamu `listId` (za `aria-activedescendant`). */
export function comboOptionId(listId: string, index: number): string {
  return `${listId}-${index}`;
}

/**
 * Seznam možnosti kombiniranega polja po ARIA 1.2 (design.md 8.4): vsaka možnost je ciljna površina ≥ 44 px, izbira z
 * miško ne vzame fokusa polju, aktivna možnost se pomakne v vidno območje.
 */
export function ComboListbox({
  id,
  label,
  options,
  active,
  onPick,
}: {
  id: string;
  label: string;
  options: ComboOption[];
  active: number;
  onPick: (option: ComboOption) => void;
}) {
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (active < 0) return;
    const element = document.getElementById(comboOptionId(id, active));
    // jsdom nima scrollIntoView.
    if (element && typeof element.scrollIntoView === 'function') {
      element.scrollIntoView({ block: 'nearest' });
    }
  }, [id, active]);
  return (
    <ul
      ref={list}
      id={id}
      role="listbox"
      aria-label={label}
      className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
    >
      {options.map((option, index) => (
        <li
          key={option.value}
          id={comboOptionId(id, index)}
          role="option"
          aria-selected={index === active}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onPick(option)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onPick(option);
          }}
          className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-sm px-2 py-2 hover:bg-muted aria-selected:bg-selected"
        >
          <span className="break-words">{option.label}</span>
          {option.count !== undefined && (
            <span className="shrink-0 text-sm text-muted-foreground">{option.count}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
