package si.contactmanager.audit;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.audit.support.AuditApiTest;

/**
 * Atomarnost beleženja (FR-005-04, FR-005-11): če zapis vnosa ne uspe, ne uspe celotna operacija – kontakt, verzija in
 * sled ostanejo nespremenjeni. Napaka se izzove s sprožilcem, ki velja samo za testno skupino.
 */
class AuditAtomicityIT extends AuditApiTest {

    /** Namesti sprožilec, ki ob vstavljanju v {@code table} za skupino (in po želji vrsto dejanja) vrže napako. */
    private String installFailure(String table, UUID group, String action) {
        String name = "fail_" + UUID.randomUUID().toString().replace("-", "");
        String group_ = table.equals("audit_entry")
                ? "NEW.group_id = '" + group + "'"
                : "(select e.group_id from audit_entry e where e.id = NEW.entry_id) = '" + group + "'";
        String actionTest = action == null
                ? ""
                : table.equals("audit_entry")
                        ? " and NEW.action = '" + action + "'"
                        : " and (select e.action from audit_entry e where e.id = NEW.entry_id) = '" + action + "'";
        jdbc.execute("create function " + name + "() returns trigger language plpgsql as $$ begin if " + group_
                + actionTest + " then raise exception 'izzvana napaka zapisa sledi'; end if; return NEW; end $$");
        jdbc.execute("create trigger " + name + " before insert on " + table + " for each row execute function " + name
                + "()");
        return name;
    }

    private void removeFailure(String table, String name) {
        jdbc.execute("drop trigger if exists " + name + " on " + table);
        jdbc.execute("drop function if exists " + name + "()");
    }

    @Test
    @Tag("FR-005-04")
    void aFailingEntryWriteRollsBackCreateUpdateAndDelete() throws Exception {
        Scenario s = scenario();
        UUID existing = idOf(create(s, Who.EDITOR, contactInput("Janez", "Novak", "01 234 567")));
        int entries = audit.count(s.group());
        long version = contacts.version(existing);
        Map<String, Object> rowBefore = contacts.row(existing);
        String trigger = installFailure("audit_entry", s.group(), null);
        try {
            HttpResponse<String> created =
                    post(contactsPath(s.group()), s.token(Who.EDITOR), body(input("Nov", "Kontakt")));
            Map<String, Object> changed = input("Janez", "Novak");
            changed.put("phone", "031 111 222");
            HttpResponse<String> updated =
                    put(contactPath(s.group(), existing), s.token(Who.EDITOR), body(withVersion(changed, version)));
            HttpResponse<String> deleted =
                    delete(contactPath(s.group(), existing) + "?version=" + version, s.token(Who.EDITOR));

            assertThat(created.statusCode()).isEqualTo(500);
            assertThat(updated.statusCode()).isEqualTo(500);
            assertThat(deleted.statusCode()).isEqualTo(500);
            assertThat(contacts.count(s.group())).isEqualTo(1);
            assertThat(contacts.exists(existing)).isTrue();
            assertThat(contacts.version(existing)).isEqualTo(version);
            assertThat(contacts.row(existing)).isEqualTo(rowBefore);
            assertThat(audit.count(s.group())).isEqualTo(entries);
        } finally {
            removeFailure("audit_entry", trigger);
        }

        HttpResponse<String> retried =
                post(contactsPath(s.group()), s.token(Who.EDITOR), body(input("Nov", "Kontakt")));
        assertThat(retried.statusCode()).isEqualTo(201);
        assertThat(audit.count(s.group())).isEqualTo(entries + 1);
    }

    @Test
    @Tag("FR-005-04")
    void aFailingChangeWriteRollsBackTheOperationToo() throws Exception {
        Scenario s = scenario();
        String trigger = installFailure("audit_change", s.group(), null);
        try {
            HttpResponse<String> created =
                    post(contactsPath(s.group()), s.token(Who.EDITOR), body(input("Nov", "Kontakt")));

            assertThat(created.statusCode()).isEqualTo(500);
            assertThat(contacts.count(s.group())).isZero();
            assertThat(audit.count(s.group())).isZero();
            assertThat(audit.latestEntryId(s.group())).isNull();
        } finally {
            removeFailure("audit_change", trigger);
        }
    }

    @Test
    @Tag("FR-005-11")
    void aFailingRollbackChangesNothingAtAll() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = create(s, Who.EDITOR, contactInput("Ana", "Prva", "01 111 111"));
        UUID target = (UUID) audit.entries(s.group()).get(0).get("id");
        Map<String, Object> b = create(s, Who.EDITOR, contactInput("Bojan", "Drugi", "01 222 222"));
        Map<String, Object> changed = valuesOf(a);
        changed.put("phone", "031 999 999");
        update(s, Who.EDITOR, idOf(a), changed, versionOf(a));
        remove(s, Who.EDITOR, idOf(b), versionOf(b));
        int entries = audit.count(s.group());
        UUID latest = audit.latestEntryId(s.group());
        Map<String, Object> contactBefore = contacts.row(idOf(a));
        List<UUID> contactsBefore = audit.contactIds(s.group());

        for (String table : List.of("audit_entry", "audit_change")) {
            String trigger = installFailure(table, s.group(), "ROLLBACK");
            try {
                HttpResponse<String> response = rollback(s, Who.ADMIN, target, latest);

                assertThat(response.statusCode()).isEqualTo(500);
                assertThat(audit.contactIds(s.group())).isEqualTo(contactsBefore);
                assertThat(contacts.row(idOf(a))).isEqualTo(contactBefore);
                assertThat(audit.contactState(idOf(a))).containsEntry("reverted_entry_id", null);
                assertThat(audit.count(s.group())).isEqualTo(entries);
                assertThat(audit.latestEntryId(s.group())).isEqualTo(latest);
            } finally {
                removeFailure(table, trigger);
            }
        }

        assertThat(rollback(s, Who.ADMIN, target, latest).statusCode()).isEqualTo(201);
    }
}
