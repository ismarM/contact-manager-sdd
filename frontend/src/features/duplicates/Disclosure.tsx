import { useId, useState, type ReactNode } from 'react';

import { focusRing } from '../../shared/ui/styles';

/**
 * Razkrivni element: pravi `button` z `aria-expanded` in `aria-controls` krmili skrito vsebino (atribut `hidden`), zato je
 * v zaprtem stanju skrita vsem, gumb pa ima vlogo `button` v vseh bralnikih zaslona (plan.md – Key elements).
 */
export function Disclosure({
  label,
  forceOpen = false,
  children,
}: {
  label: string;
  /** Vsebina mora biti vidna (npr. napaka v strnjeni vrstici). */
  forceOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const expanded = open || forceOpen;

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => setOpen(!expanded)}
        className={`min-h-11 self-start rounded-md px-1 text-left font-bold underline pointer-coarse:min-h-12 ${focusRing}`}
      >
        {label}
      </button>
      <div id={id} hidden={!expanded}>
        {children}
      </div>
    </div>
  );
}
