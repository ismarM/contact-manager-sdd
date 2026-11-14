# shadcn/ui po vzorcih

- **Datum:** 2026-11-04 (prenos iz arhiva, prej `D-15`)
- **Avtor:** Claude Code po navodilu razvijalcev
- **Nadomešča:** –

## Kontekst
`design.md` 13.4 za vsak vzorec vmesnika zahteva natanko en način izvedbe: nativni element ali komponento shadcn/ui.

## Odločitev

| Vzorec | Način |
|---|---|
| Alert Dialog / Dialog | shadcn |
| Dropdown Menu | shadcn |
| Command / Combobox | shadcn |
| Sonner | shadcn |
| Checkbox / Radio Group | nativni |
| Button / Input / Textarea / Label / Table / Separator | nativni |
| Select | nativni |
| Card / Sidebar / Tooltip / Carousel / Chart | nativni (lastni preprosti elementi) |

Komponento doda funkcionalnost, ki jo prva potrebuje (`frontend/src/shared/ui/`).

## Posledice
- `frontend/components.json` (slog `new-york`, `stone`, `cssVariables`, alias `ui` → `@/shared/ui`) in
  `frontend/src/shared/lib/cn.ts` sta napisana ročno; `shadcn init` se ne poganja, ker bi prepisal žetone v `app.css`
  in dodal `lucide-react` (ikone so Tabler).
- Pot `@/*` → `src/*` je nastavljena v `tsconfig` in Vite.
