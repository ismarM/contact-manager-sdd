# Nova vrsta revizijskega dejanja `RESTORE` in migracija V11

- **Datum:** 2026-11-15
- **Avtor:** Ismar (odločitev Q2 pri 015), izvedba Claude
- **Nadomešča:** –

## Kontekst
Obnova enega kontakta (015) mora biti v sledi razločljiva od urejanja in od skupinskega rollbacka ter se sklicevati na obnovljeno različico. Obstoječi `CHECK` na `audit_entry` dovoljuje pet vrst in sklic na cilj samo pri `ROLLBACK`.

## Odločitev
`audit_entry.action` dobi vrednost `RESTORE`; sklic na različico uporablja obstoječa stolpca `target_entry_id` / `target_initial` (`CHECK audit_entry_target` velja za `ROLLBACK` in `RESTORE`). Migracija `V11__napredna_revizija.sql` zamenja obe omejitvi in doda dva indeksa; novih tabel in stolpcev ni. Zgodovina, različice in seznam izbrisanih kontaktov se izpeljejo iz `audit_change`.

## Posledice
Pri vzporedni funkcionalnosti 014 (ki bi lahko dodala svojo vrsto dejanja ali `V11`) mora druga migracija v `CHECK` vključiti unijo vrst, imeni datotek in številki verzij se ne smeta ujemati (kdor združi drugi, preštevilči). Zavrnjeno: ponovna uporaba `ROLLBACK` z enim kontaktom (napačen stavek), `UPDATE` z oznako (obnova ni razločljiva), ločena tabela zgodovine ali izbrisanih kontaktov (podvajanje).
