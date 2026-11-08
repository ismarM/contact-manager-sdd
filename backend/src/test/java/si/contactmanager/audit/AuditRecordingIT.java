package si.contactmanager.audit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import si.contactmanager.audit.support.AuditApiTest;
import si.contactmanager.contact.Attribute;
import si.contactmanager.contact.ContactState;

/**
 * Beleženje sprememb kontaktov (FR-005-01, -02, -03, -06; SC-001): vsaka uspešna operacija 004 ustvari natanko en vnos
 * s stanji prej/potem, zavrnjene in prazne operacije ne ustvarijo nobenega; pogodba {@link AuditLog#record}.
 */
class AuditRecordingIT extends AuditApiTest {

    @Autowired
    private AuditLog auditLog;

    @Autowired
    private PlatformTransactionManager transactions;

    private static Map<String, Object> janez() {
        Map<String, Object> input = input("Janez", "Novak");
        input.put("email", "janez@primer.si");
        input.put("phone", "01 234 567");
        input.put("attributes", List.of(Map.of("key", "Oddelek", "value", "IT")));
        input.put("tags", List.of("vip", "konferenca2025"));
        return input;
    }

    private static ContactState state(String first, long version) {
        return new ContactState(
                first,
                "Novak",
                null,
                null,
                null,
                List.of(new Attribute("kompetenca", "web dev")),
                List.of("vip"),
                version,
                Instant.parse("2026-10-12T12:30:00Z"),
                Instant.parse("2026-10-12T12:32:00Z"),
                null);
    }

    private UUID record(Scenario s, AuditAction action, List<ContactChange> changes) {
        return new TransactionTemplate(transactions)
                .execute(status -> auditLog.record(s.group(), s.id(Who.EDITOR), action, changes));
    }

    @Test
    @Tag("FR-005-01")
    @Tag("FR-005-02")
    void createUpdateAndDeleteEachWriteExactlyOneEntryWithTheFullStates() throws Exception {
        Scenario s = scenario();

        Map<String, Object> created = create(s, Who.EDITOR, janez());
        UUID id = idOf(created);
        Map<String, Object> changed = valuesOf(created);
        changed.put("phone", "031 111 222");
        changed.put(
                "attributes",
                List.of(Map.of("key", "Oddelek", "value", "IT"), Map.of("key", "kompetenca", "value", "web dev")));
        changed.put("tags", List.of("konferenca2025"));
        Map<String, Object> updated = update(s, Who.EDITOR, id, changed, versionOf(created));
        remove(s, Who.EDITOR, id, versionOf(updated));

        List<Map<String, Object>> entries = audit.entries(s.group());
        assertThat(entries).extracting(e -> e.get("action")).containsExactly("CREATE", "UPDATE", "DELETE");
        assertThat(entries).extracting(e -> ((Number) e.get("seq")).longValue()).containsExactly(1L, 2L, 3L);
        assertThat(entries).extracting(e -> e.get("actor_id")).containsOnly(s.id(Who.EDITOR));
        assertThat(entries).extracting(e -> e.get("contact_count")).containsOnly(1);
        assertThat(entries).extracting(e -> e.get("contact_name")).containsOnly("Janez Novak");

        Map<String, Object> create =
                audit.changes((UUID) entries.get(0).get("id")).get(0);
        assertThat(create.get("contact_id")).isEqualTo(id);
        assertThat(create.get("display_name")).isEqualTo("Janez Novak");
        assertThat(create.get("before")).isNull();
        Map<String, Object> afterCreate = asObject(create.get("after"));
        assertThat(afterCreate)
                .containsEntry("firstName", "Janez")
                .containsEntry("lastName", "Novak")
                .containsEntry("email", "janez@primer.si")
                .containsEntry("phone", "01 234 567")
                .containsEntry("attributes", List.of(Map.of("key", "Oddelek", "value", "IT")))
                .containsEntry("tags", List.of("vip", "konferenca2025"))
                .containsEntry("version", 0);
        assertThat(((Number) afterCreate.get("updatedById")).longValue()).isEqualTo(s.id(Who.EDITOR));

        Map<String, Object> edit =
                audit.changes((UUID) entries.get(1).get("id")).get(0);
        assertThat(asObject(edit.get("before")))
                .containsEntry("phone", "01 234 567")
                .containsEntry("tags", List.of("vip", "konferenca2025"))
                .containsEntry("version", 0);
        assertThat(asObject(edit.get("after")))
                .containsEntry("phone", "031 111 222")
                .containsEntry("tags", List.of("konferenca2025"))
                .containsEntry(
                        "attributes",
                        List.of(
                                Map.of("key", "Oddelek", "value", "IT"),
                                Map.of("key", "kompetenca", "value", "web dev")))
                .containsEntry("version", 1);

        Map<String, Object> delete =
                audit.changes((UUID) entries.get(2).get("id")).get(0);
        assertThat(delete.get("after")).isNull();
        assertThat(asObject(delete.get("before")))
                .containsEntry("phone", "031 111 222")
                .containsEntry("version", 1);
        assertThat(audit.latestEntryId(s.group())).isEqualTo(entries.get(2).get("id"));
    }

    @Test
    @Tag("FR-005-01")
    void rejectedOperationsWriteNoEntry() throws Exception {
        Scenario s = scenario();
        Map<String, Object> created = create(s, Who.EDITOR, janez());
        UUID id = idOf(created);
        UUID other = groups.createGroup(s.id(Who.OWNER), "Skupina B");
        UUID foreign = contacts.insert(other, s.id(Who.OWNER), "Tuj", "Kontakt");
        Map<String, Object> changed = valuesOf(created);
        changed.put("phone", "031 111 222");
        update(s, Who.EDITOR, id, changed, versionOf(created));
        int before = audit.count(s.group());
        assertThat(before).isEqualTo(2);

        Map<String, Object> other2 = valuesOf(created);
        other2.put("phone", "040 999 888");
        List<HttpResponse<String>> rejected = new ArrayList<>();
        // 409 VERSION_CONFLICT: zastarela verzija z drugačnimi vrednostmi.
        rejected.add(put(contactPath(s.group(), id), s.token(Who.EDITOR), body(withVersion(other2, 0))));
        // 400: neveljavni podatki.
        rejected.add(post(contactsPath(s.group()), s.token(Who.EDITOR), body(input(null, null))));
        // 403: bralec.
        rejected.add(post(contactsPath(s.group()), s.token(Who.VIEWER), body(input("Nov", "Kontakt"))));
        rejected.add(delete(contactPath(s.group(), id) + "?version=1", s.token(Who.VIEWER)));
        // 404: tuj kontakt in neobstoječ kontakt.
        rejected.add(put(contactPath(s.group(), foreign), s.token(Who.EDITOR), body(withVersion(janez(), 0))));
        rejected.add(delete(contactPath(s.group(), UUID.randomUUID()) + "?version=0", s.token(Who.EDITOR)));
        // 401: brez žetona.
        rejected.add(post(contactsPath(s.group()), null, body(input("Nov", "Kontakt"))));
        // 409 VERSION_CONFLICT pri izbrisu s staro verzijo.
        rejected.add(delete(contactPath(s.group(), id) + "?version=0", s.token(Who.EDITOR)));

        assertThat(rejected)
                .extracting(HttpResponse::statusCode)
                .containsExactly(409, 400, 403, 403, 404, 404, 401, 409);
        groups.archive(s.group());
        // 409 GROUP_ARCHIVED.
        HttpResponse<String> archived =
                post(contactsPath(s.group()), s.token(Who.EDITOR), body(input("Nov", "Kontakt")));
        assertThat(archived.statusCode()).isEqualTo(409);
        assertThat(audit.count(s.group())).isEqualTo(before);
        assertThat(audit.count(other)).isZero();
    }

    @Test
    @Tag("FR-005-01")
    void savingWithoutChangeAndAStaleVersionWithEqualValuesWriteNoEntry() throws Exception {
        Scenario s = scenario();
        Map<String, Object> created = create(s, Who.EDITOR, janez());
        UUID id = idOf(created);
        Map<String, Object> changed = valuesOf(created);
        changed.put("phone", "031 111 222");
        update(s, Who.EDITOR, id, changed, versionOf(created));
        assertThat(audit.count(s.group())).isEqualTo(2);

        // Shranjevanje brez spremembe (trenutna verzija, enake vrednosti).
        HttpResponse<String> same = put(contactPath(s.group(), id), s.token(Who.EDITOR), body(withVersion(changed, 1)));
        // Zastarela verzija z enakimi vrednostmi, kot jih ima kontakt zdaj.
        HttpResponse<String> stale = put(contactPath(s.group(), id), s.token(Who.ADMIN), body(withVersion(changed, 0)));

        assertThat(same.statusCode()).isEqualTo(200);
        assertThat(stale.statusCode()).isEqualTo(200);
        assertThat(audit.count(s.group())).isEqualTo(2);
    }

    @Test
    @Tag("FR-005-02")
    void anEntryKeepsItsValuesWhenTheActorLaterDeletesTheAccount() throws Exception {
        Scenario s = scenario();
        Map<String, Object> created = create(s, Who.EDITOR, janez());
        UUID entry = (UUID) audit.entries(s.group()).get(0).get("id");
        Map<String, Object> stateBefore = asObject(audit.changes(entry).get(0).get("after"));

        jdbc.update("delete from app_user where id = ?", s.id(Who.EDITOR));

        Map<String, Object> row = audit.entries(s.group()).get(0);
        assertThat(row.get("actor_id")).isNull();
        assertThat(row.get("action")).isEqualTo("CREATE");
        assertThat(row.get("contact_name")).isEqualTo("Janez Novak");
        assertThat(asObject(audit.changes(entry).get(0).get("after"))).isEqualTo(stateBefore);
        assertThat(audit.changes(entry).get(0).get("contact_id")).isEqualTo(idOf(created));
    }

    /**
     * Spremembe članstev, vlog in povabil (006, 007) še nimajo endpointov v API-ju; ko nastanejo, njihovi testi
     * preverjajo, da {@code audit.count} ostane nespremenjen (FR-005-06). Tu: podatki skupine in arhiviranje.
     */
    @Test
    @Tag("FR-005-06")
    void changingTheGroupDataAndArchivingWriteNoEntry() throws Exception {
        Scenario s = scenario();
        create(s, Who.EDITOR, janez());
        assertThat(audit.count(s.group())).isEqualTo(1);
        long version = groups.version(s.group());

        HttpResponse<String> renamed = put(
                "/api/groups/" + s.group(),
                s.token(Who.ADMIN),
                "{\"title\":\"Projekt FERI 2\",\"description\":null,\"color\":\"mah\",\"version\":" + version + "}");
        HttpResponse<String> archive = post("/api/groups/" + s.group() + "/archive", s.token(Who.OWNER), null);
        HttpResponse<String> unarchive = post("/api/groups/" + s.group() + "/unarchive", s.token(Who.OWNER), null);

        assertThat(renamed.statusCode()).isEqualTo(200);
        assertThat(archive.statusCode()).isIn(200, 204);
        assertThat(unarchive.statusCode()).isIn(200, 204);
        assertThat(audit.count(s.group())).isEqualTo(1);
    }

    @Test
    @Tag("FR-005-03")
    void aSingleEntryRecordsAnOperationOverManyContacts() throws Exception {
        Scenario s = scenario();
        List<ContactChange> changes = new ArrayList<>();
        for (int i = 0; i < 12; i++) {
            changes.add(
                    new ContactChange(UUID.randomUUID(), "Kontakt " + i, state("Prej" + i, 1), state("Potem" + i, 2)));
        }

        UUID entry = record(s, AuditAction.UPDATE, changes);

        assertThat(audit.entries(s.group())).hasSize(1);
        Map<String, Object> row = audit.entries(s.group()).get(0);
        assertThat(row.get("id")).isEqualTo(entry);
        assertThat(row.get("action")).isEqualTo("UPDATE");
        assertThat(row.get("contact_count")).isEqualTo(12);
        assertThat(row.get("contact_name")).isNull();
        assertThat(((Number) row.get("actor_id")).longValue()).isEqualTo(s.id(Who.EDITOR));
        List<Map<String, Object>> stored = audit.changes(entry);
        assertThat(stored).hasSize(12);
        assertThat(stored)
                .extracting(c -> c.get("contact_id"))
                .containsExactlyElementsOf(
                        changes.stream().map(ContactChange::contactId).toList());
        assertThat(asObject(stored.get(3).get("before"))).containsEntry("firstName", "Prej3");
        assertThat(asObject(stored.get(3).get("after"))).containsEntry("firstName", "Potem3");
        assertThat(audit.latestEntryId(s.group())).isEqualTo(entry);
    }

    @Test
    @Tag("FR-005-03")
    void aMergeEntryHasTheKeptContactBeforeAndAfterAndTheRemovedOneOnlyBefore() throws Exception {
        Scenario s = scenario();
        UUID kept = UUID.randomUUID();
        UUID removed = UUID.randomUUID();

        UUID entry = record(
                s,
                AuditAction.MERGE,
                List.of(
                        new ContactChange(kept, "Janez Novak", state("Janez", 1), state("Janez", 2)),
                        new ContactChange(removed, "J. Novak", state("J.", 4), null)));

        Map<String, Object> row = audit.entries(s.group()).get(0);
        assertThat(row.get("action")).isEqualTo("MERGE");
        assertThat(row.get("contact_count")).isEqualTo(2);
        List<Map<String, Object>> stored = audit.changes(entry);
        assertThat(stored.get(0).get("before")).isNotNull();
        assertThat(stored.get(0).get("after")).isNotNull();
        assertThat(stored.get(1).get("contact_id")).isEqualTo(removed);
        assertThat(stored.get(1).get("before")).isNotNull();
        assertThat(stored.get(1).get("after")).isNull();
    }

    @Test
    @Tag("FR-005-04")
    void recordingWithoutAnEnclosingTransactionFailsAndWritesNothing() throws Exception {
        Scenario s = scenario();

        assertThatThrownBy(() -> auditLog.record(
                        s.group(),
                        s.id(Who.EDITOR),
                        AuditAction.CREATE,
                        List.of(new ContactChange(UUID.randomUUID(), "Janez Novak", null, state("Janez", 0)))))
                .isInstanceOf(RuntimeException.class);

        assertThat(audit.count(s.group())).isZero();
        assertThat(audit.latestEntryId(s.group())).isNull();
    }

    @Test
    @Tag("FR-005-04")
    void invalidShapesAreRejectedWithoutWritingAnything() throws Exception {
        Scenario s = scenario();
        ContactChange withBefore = new ContactChange(UUID.randomUUID(), "A", state("A", 0), state("A", 1));

        assertThatThrownBy(() -> record(s, AuditAction.UPDATE, List.of())).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> record(s, AuditAction.CREATE, List.of(withBefore)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> record(
                        s, AuditAction.DELETE, List.of(new ContactChange(UUID.randomUUID(), "A", null, state("A", 1)))))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> record(s, AuditAction.ROLLBACK, List.of(withBefore)))
                .isInstanceOf(IllegalArgumentException.class);

        assertThat(audit.count(s.group())).isZero();
    }
}
