-- Namerno neveljavna migracija za BrokenMigrationIT (FR-000-03): prvi stavek uspe, drugi pade.
CREATE TABLE broken_marker (id integer);
SELECT * FROM table_that_does_not_exist;
