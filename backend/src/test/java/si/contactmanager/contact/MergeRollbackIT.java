package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.contact.support.MergeApiTest;

/**
 * Združitev je razveljavljiva z obstoječim rollbackom 005 (FR-011-17; SC-005), brez novega mehanizma: rollback na vnos
 * tik pred združitvijo povrne celotno skupino v stanje pred njo, obnovljena kontakta imata isti id in višjo verzijo.
 */
@Tag("FR-011-17")
@Tag("SC-005")
class MergeRollbackIT extends MergeApiTest {

    private static final String EMAIL = "ana@primer.si";

    /** Stanje S0: kontakti A, B, C (dvojniki) in drug kontakt D, vsi prek API-ja 004; {@code e0} je glava sledi. */
    private record Initial(Scenario s, UUID a, UUID b, UUID c, UUID d, Map<UUID, Map<String, Object>> s0, UUID e0) {
        List<UUID> abc() {
            return List.of(a, b, c);
        }

        List<UUID> all() {
            return List.of(a, b, c, d);
        }
    }

    private Initial initial() throws Exception {
        Scenario s = scenario();
        UUID a = uuid(
                createContact(s, "Ana", "Prva", EMAIL, List.of(attribute("oddelek", "IT")), List.of("vip", "stari")));
        UUID b = uuid(createContact(
                s,
                "Ana",
                "Druga",
                EMAIL,
                List.of(attribute("mesto", "Maribor"), attribute("hobi", "tek")),
                List.of("b")));
        UUID c =
                uuid(createContact(s, "Ana", "Tretja", EMAIL, List.of(attribute("barva", "modra")), List.of("c", "d")));
        UUID d = uuid(
                createContact(s, "Drugi", "Kontakt", "drug@primer.si", List.of(attribute("vloga", "X")), List.of("x")));
        Map<UUID, Map<String, Object>> s0 = new LinkedHashMap<>();
        for (UUID id : List.of(a, b, c, d)) {
            s0.put(id, content(id));
        }
        return new Initial(s, a, b, c, d, s0, audit.latestEntryId(s.group()));
    }

    private Map<String, Object> mergedValues() {
        return result(
                "Ana",
                "Izbrana",
                null,
                EMAIL,
                "031 111 222",
                List.of(attribute("oddelek", "IT"), attribute("mesto", "Maribor")),
                List.of("vip", "b"));
    }

    private UUID mergeAbc(Initial i) throws Exception {
        HttpResponse<String> response =
                merge(i.s().token(Who.EDITOR), i.s().group(), mergeBodyNow(i.abc(), mergedValues()));
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        return UUID.fromString((String) json(response.body()).get("auditEntryId"));
    }

    /** Uredi telefon kontakta prek API-ja 004 (trenutne vrednosti in verzija iz GET). */
    private void editPhone(Initial i, UUID id, String phone) throws Exception {
        Map<String, Object> detail = json(
                get(contactPath(i.s().group(), id), i.s().token(Who.EDITOR)).body());
        Map<String, Object> values = new LinkedHashMap<>();
        for (String field : List.of("firstName", "lastName", "address", "email", "phone", "attributes", "tags")) {
            values.put(field, detail.get(field));
        }
        values.put("phone", phone);
        HttpResponse<String> response = put(
                contactPath(i.s().group(), id),
                i.s().token(Who.EDITOR),
                body(withVersion(values, ((Number) detail.get("version")).longValue())));
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
    }

    private void assertContent(Initial i, Map<UUID, Map<String, Object>> expected, List<UUID> ids) {
        for (UUID id : ids) {
            assertThat(content(id)).as(id.toString()).isEqualTo(expected.get(id));
        }
    }

    @Test
    void aRollbackToTheEntryRightBeforeTheMergeRestoresAllFourContactsWithTheSameIdsAndHigherVersions()
            throws Exception {
        Initial i = initial();
        mergeAbc(i);
        long keptVersion = contacts.version(i.a());
        assertThat(contacts.exists(i.b())).isFalse();

        HttpResponse<String> response = rollback(i.s(), Who.ADMIN, i.e0(), audit.latestEntryId(i.s().group()));

        assertThat(response.statusCode()).as(response.body()).isEqualTo(201);
        Map<String, Object> entry = json(response.body());
        assertThat(entry).containsEntry("action", "ROLLBACK");
        assertContent(i, i.s0(), i.all());
        assertThat(contacts.version(i.a())).isGreaterThan(keptVersion);
        assertThat(contacts.version(i.b())).isGreaterThan(0);
        assertThat(contacts.version(i.c())).isGreaterThan(0);
        UUID rollbackEntry = UUID.fromString((String) entry.get("id"));
        for (UUID id : i.abc()) {
            assertThat(audit.contactState(id)).as(id.toString()).containsEntry("reverted_entry_id", rollbackEntry);
            Map<String, Object> detail = json(
                    get(contactPath(i.s().group(), id), i.s().token(Who.VIEWER)).body());
            assertThat(asObject(detail.get("reverted"))).containsEntry("rollbackEntryId", rollbackEntry.toString());
        }
        assertThat(auditEntries(i.s().group(), "ROLLBACK")).hasSize(1);
        assertThat(auditEntries(i.s().group(), "MERGE")).hasSize(1);
    }

    @Test
    void theOwnerMayRollBackAMergeWhileEditorAndViewerAreForbidden() throws Exception {
        Initial i = initial();
        mergeAbc(i);
        Snapshot before = snapshot(i.s().group());
        UUID latest = audit.latestEntryId(i.s().group());

        HttpResponse<String> editor = rollback(i.s(), Who.EDITOR, i.e0(), latest);
        HttpResponse<String> viewer = rollback(i.s(), Who.VIEWER, i.e0(), latest);

        assertThat(editor.statusCode()).isEqualTo(403);
        assertThat(viewer.statusCode()).isEqualTo(403);
        assertUnchanged(before, snapshot(i.s().group()));

        HttpResponse<String> owner = rollback(i.s(), Who.OWNER, i.e0(), latest);

        assertThat(owner.statusCode()).as(owner.body()).isEqualTo(201);
        assertContent(i, i.s0(), i.all());
    }

    @Test
    void aRollbackInAnArchivedGroupIsRejectedAsGroupArchived() throws Exception {
        Initial i = initial();
        mergeAbc(i);
        groups.archive(i.s().group());
        Snapshot before = snapshot(i.s().group());
        UUID latest = audit.latestEntryId(i.s().group());

        HttpResponse<String> admin = rollback(i.s(), Who.ADMIN, i.e0(), latest);

        assertThat(admin.statusCode()).as(admin.body()).isEqualTo(409);
        assertThat(codeOf(admin)).isEqualTo("GROUP_ARCHIVED");
        assertUnchanged(before, snapshot(i.s().group()));
    }

    @Test
    void aRollbackBeforeTheMergeReturnsTheWholeGroupAndItsOwnRollbackCanBeUndone() throws Exception {
        Initial i = initial();
        mergeAbc(i);
        editPhone(i, i.a(), "040 777 666");
        editPhone(i, i.d(), "041 555 444");
        Map<UUID, Map<String, Object>> afterEdits = new LinkedHashMap<>();
        afterEdits.put(i.a(), content(i.a()));
        afterEdits.put(i.d(), content(i.d()));
        int entriesBefore = audit.count(i.s().group());

        HttpResponse<String> first = rollback(i.s(), Who.ADMIN, i.e0(), audit.latestEntryId(i.s().group()));

        assertThat(first.statusCode()).as(first.body()).isEqualTo(201);
        assertContent(i, i.s0(), i.all());
        assertThat(contacts.row(i.d()).get("phone")).isNull();
        // Poznejši vnosi ostanejo v sledi, dodan je en vnos ROLLBACK.
        assertThat(audit.count(i.s().group())).isEqualTo(entriesBefore + 1);
        assertThat(auditEntries(i.s().group(), "MERGE")).hasSize(1);
        assertThat(auditEntries(i.s().group(), "UPDATE")).hasSize(2);
        UUID rollbackEntry = UUID.fromString((String) json(first.body()).get("id"));

        UUID beforeRollback = entryBefore(i.s().group(), rollbackEntry);
        HttpResponse<String> undo = rollback(i.s(), Who.ADMIN, beforeRollback, audit.latestEntryId(i.s().group()));

        assertThat(undo.statusCode()).as(undo.body()).isEqualTo(201);
        assertThat(content(i.a())).isEqualTo(afterEdits.get(i.a()));
        assertThat(content(i.d())).isEqualTo(afterEdits.get(i.d()));
        assertThat(contacts.exists(i.b())).isFalse();
        assertThat(contacts.exists(i.c())).isFalse();
        assertThat(auditEntries(i.s().group(), "ROLLBACK")).hasSize(2);
    }

    @Test
    void aRollbackOntoTheMergeEntryKeepsTheMergedContactAndLeavesBAndCDeleted() throws Exception {
        Initial i = initial();
        UUID mergeEntry = mergeAbc(i);
        Map<String, Object> mergedContent = content(i.a());
        editPhone(i, i.a(), "040 777 666");
        editPhone(i, i.d(), "041 555 444");

        HttpResponse<String> response = rollback(i.s(), Who.ADMIN, mergeEntry, audit.latestEntryId(i.s().group()));

        assertThat(response.statusCode()).as(response.body()).isEqualTo(201);
        assertThat(content(i.a())).isEqualTo(mergedContent);
        assertThat(content(i.d())).isEqualTo(i.s0().get(i.d()));
        assertThat(contacts.exists(i.b())).isFalse();
        assertThat(contacts.exists(i.c())).isFalse();
    }

    @Test
    void aStaleLatestEntryIdAfterAnotherMergeIsAVersionConflictAndChangesNothing() throws Exception {
        Initial i = initial();
        mergeAbc(i);
        UUID seen = audit.latestEntryId(i.s().group());
        UUID e = uuid(createContact(i.s(), "Eva", "Nova", "eva@primer.si", List.of(), List.of()));
        UUID f = uuid(createContact(i.s(), "Eva", "Stara", "eva@primer.si", List.of(), List.of()));
        HttpResponse<String> second = merge(
                i.s().token(Who.EDITOR),
                i.s().group(),
                mergeBodyNow(List.of(e, f), simpleResult("Eva", "Nova", "eva@primer.si")));
        assertThat(second.statusCode()).as(second.body()).isEqualTo(200);
        Snapshot before = snapshot(i.s().group());

        HttpResponse<String> response = rollback(i.s(), Who.ADMIN, i.e0(), seen);

        assertThat(response.statusCode()).as(response.body()).isEqualTo(409);
        assertThat(codeOf(response)).isEqualTo("VERSION_CONFLICT");
        assertUnchanged(before, snapshot(i.s().group()));
    }

    @Test
    void repeatingTheSameRollbackWithAFreshLatestEntryIdChangesNothingAndIsRejected() throws Exception {
        Initial i = initial();
        mergeAbc(i);
        HttpResponse<String> first = rollback(i.s(), Who.ADMIN, i.e0(), audit.latestEntryId(i.s().group()));
        assertThat(first.statusCode()).as(first.body()).isEqualTo(201);
        Snapshot before = snapshot(i.s().group());

        HttpResponse<String> second = rollback(i.s(), Who.ADMIN, i.e0(), audit.latestEntryId(i.s().group()));

        assertThat(second.statusCode()).as(second.body()).isEqualTo(409);
        assertThat(codeOf(second)).isEqualTo("ROLLBACK_NO_CHANGES");
        assertUnchanged(before, snapshot(i.s().group()));
    }

    @Test
    void twoSimultaneousRollbacksToTheSamePointGiveOneSuccessAndOneConflict() throws Exception {
        Initial i = initial();
        mergeAbc(i);
        UUID latest = audit.latestEntryId(i.s().group());

        List<HttpResponse<String>> responses = concurrently(List.of(
                () -> rollback(i.s(), Who.ADMIN, i.e0(), latest), () -> rollback(i.s(), Who.OWNER, i.e0(), latest)));

        assertThat(responses.stream().map(HttpResponse::statusCode).sorted().toList())
                .as(responses.toString())
                .containsExactly(201, 409);
        assertContent(i, i.s0(), i.all());
        assertThat(auditEntries(i.s().group(), "ROLLBACK")).hasSize(1);
    }

    @Test
    void aMergeWithTheOldVersionsAfterARollbackIsAVersionConflict() throws Exception {
        Initial i = initial();
        List<Map<String, Object>> opened = List.of(
                contact(i.a(), contacts.version(i.a())),
                contact(i.b(), contacts.version(i.b())),
                contact(i.c(), contacts.version(i.c())));
        mergeAbc(i);
        HttpResponse<String> rolledBack = rollback(i.s(), Who.ADMIN, i.e0(), audit.latestEntryId(i.s().group()));
        assertThat(rolledBack.statusCode()).as(rolledBack.body()).isEqualTo(201);
        Snapshot before = snapshot(i.s().group());

        HttpResponse<String> response =
                merge(i.s().token(Who.EDITOR), i.s().group(), mergeBody(opened, mergedValues()));

        assertThat(response.statusCode()).as(response.body()).isEqualTo(409);
        assertThat(codeOf(response)).isEqualTo("VERSION_CONFLICT");
        assertUnchanged(before, snapshot(i.s().group()));
    }
}
