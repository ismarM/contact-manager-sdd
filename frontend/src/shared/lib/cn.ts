import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Združi razrede Tailwind; kasnejši razred preglasi nasprotujočega (design.md 13.1). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
