import type { ReactNode } from 'react';

/**
 * Celica preglednice članov: pod 640 px je vrstica zložena in celica pokaže oznako stolpca. Oznaka je `aria-hidden`
 * (stolpec že poimenuje glava), zato dostopno ime celice ostane samo vrednost (design.md 8.6).
 */
export function MemberCell({
  label,
  className,
  children,
}: {
  label: string;
  className: string;
  children?: ReactNode;
}) {
  return (
    <td className={className}>
      <span aria-hidden="true" className="hidden font-bold max-sm:inline">
        {label}
      </span>
      {children}
    </td>
  );
}
