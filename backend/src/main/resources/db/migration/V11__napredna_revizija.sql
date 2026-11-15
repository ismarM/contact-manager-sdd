-- 015 napredna revizijska sled: vrsta dejanja RESTORE in indeksa za filter po izvajalcu ter seznam izbrisanih kontaktov
-- (specs/015-napredna-revizija/data-model.md; research R-03, R-04, R-06). Brez novih tabel in stolpcev.
-- Pravilo usklajevanja z 014: dve datoteki z isto številko verzije Flyway zavrne (kdor združi drugi, preštevilči);
-- ob dotiku istih omejitev mora zadnja migracija vsebovati unijo vseh vrst dejanj.

ALTER TABLE audit_entry DROP CONSTRAINT audit_entry_action_check;
ALTER TABLE audit_entry ADD CONSTRAINT audit_entry_action_check
    CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'MERGE', 'ROLLBACK', 'RESTORE'));

-- ROLLBACK in RESTORE se sklicujeta na cilj: vnos, po katerem je nastalo ciljno stanje, ali začetno oziroma izhodiščno stanje.
ALTER TABLE audit_entry DROP CONSTRAINT audit_entry_target;
ALTER TABLE audit_entry ADD CONSTRAINT audit_entry_target CHECK (
    (action IN ('ROLLBACK', 'RESTORE') AND ((target_entry_id IS NOT NULL) <> target_initial))
    OR (action NOT IN ('ROLLBACK', 'RESTORE') AND target_entry_id IS NULL AND NOT target_initial));

CREATE INDEX audit_entry_group_actor ON audit_entry (group_id, actor_id, seq DESC);
CREATE INDEX audit_change_removed ON audit_change (entry_id) WHERE after IS NULL;
