package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.contact.support.MergeApiTest;

/**
 * Revizijska sled združitve (FR-011-17; SC-003): natanko en vnos {@code MERGE} z vsemi tremi spremembami (ohranjeni
 * kontakt prej in potem, odstranjena samo prej), viden v seznamu in v filtru po kontaktu; zavrnjene združitve vnosa
 * ne ustvarijo.
 */
@Tag("FR-011-17")
@Tag("SC-003")
class MergeAuditIT extends MergeApiTest {

    private record Three(Map<String, Object> a, Map<String, Object> b, Map<String, Object> c) {
        List<UUID> ids() {
            return List.of(uuid(a), uuid(b), uuid(c));
        }
    }

    private Three three(Scenario s) throws Exception {
        Map<String, Object> a =
                createContact(s, "Ana", "Prva", "ana@primer.si", List.of(attribute("oddelek", "IT")), List.of("vip"));
        Map<String, Object> b =
                createContact(s, "Ana", "Druga", "ana@primer.si", List.of(attribute("mesto", "Maribor")), List.of("b"));
        Map<String, Object> c = createContact(s, "Ana", "Tretja", "ana@primer.si", List.of(), List.of("c"));
        return new Three(a, b, c);
    }

    private Map<String, Object> chosen() {
        return result(
                "Ana",
                "Izbrana",
                "Ulica 1",
                "izbrana@primer.si",
                "031 111 222",
                List.of(attribute("oddelek", "IT"), attribute("mesto", "Maribor")),
                List.of("vip", "b"));
    }

    private static Instant instantOf(Object value) {
        if (value instanceof java.sql.Timestamp timestamp) {
            return timestamp.toInstant();
        }
        return ((OffsetDateTime) value).toInstant();
    }

    @Test
    void aMergeOfThreeContactsWritesExactlyOneMergeEntryWithTheActorAndServerTime() throws Exception {
        Scenario s = scenario();
        Three t = three(s);
        int entriesBefore = audit.count(s.group());
        Instant start = Instant.now();

        HttpResponse<String> response = merge(s.token(Who.EDITOR), s.group(), mergeBodyNow(t.ids(), chosen()));

        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        assertThat(audit.count(s.group())).isEqualTo(entriesBefore + 1);
        List<Map<String, Object>> merges = auditEntries(s.group(), "MERGE");
        assertThat(merges).hasSize(1);
        Map<String, Object> entry = merges.get(0);
        assertThat(entry.get("id").toString()).isEqualTo(json(response.body()).get("auditEntryId"));
        assertThat(entry.get("contact_count")).isEqualTo(3);
        assertThat(((Number) entry.get("actor_id")).longValue()).isEqualTo(s.id(Who.EDITOR));
        assertThat(entry.get("target_entry_id")).isNull();
        assertThat(entry.get("target_initial")).isIn(null, false);
        assertThat(instantOf(entry.get("created_at")))
                .isBetween(start.minus(Duration.ofMinutes(1)), Instant.now().plus(Duration.ofMinutes(1)));
        assertThat(audit.latestEntryId(s.group())).isEqualTo(entry.get("id"));
    }

    @Test
    void theAuditListShowsTheMergeEntryOfThreeContacts() throws Exception {
        Scenario s = scenario();
        Three t = three(s);
        HttpResponse<String> merged = merge(s.token(Who.EDITOR), s.group(), mergeBodyNow(t.ids(), chosen()));
        assertThat(merged.statusCode()).as(merged.body()).isEqualTo(200);

        HttpResponse<String> response = get("/api/groups/" + s.group() + "/audit?size=25", s.token(Who.VIEWER));

        assertThat(response.statusCode()).isEqualTo(200);
        Map<String, Object> newest =
                asObjects(json(response.body()).get("items")).get(0);
        assertThat(newest).containsEntry("action", "MERGE").containsEntry("contactCount", 3);
        assertThat(asObject(newest.get("actor"))).containsEntry("name", "EDITOR");
    }

    @Test
    void theChangesHoldTheFullStateBeforeForAllAndTheChosenValuesAfterOnlyForTheKeptContact() throws Exception {
        Scenario s = scenario();
        Three t = three(s);

        HttpResponse<String> response = merge(s.token(Who.EDITOR), s.group(), mergeBodyNow(t.ids(), chosen()));

        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        UUID entry = (UUID) lastEntry(s.group()).get("id");
        List<Map<String, Object>> changes = audit.changes(entry);
        assertThat(changes).hasSize(3);
        assertThat(changes).extracting(c -> c.get("contact_id")).containsExactlyElementsOf(t.ids());

        Map<String, Object> kept = changes.get(0);
        assertThat(kept.get("display_name")).isEqualTo("Ana Izbrana");
        Map<String, Object> keptBefore = asObject(kept.get("before"));
        assertThat(keptBefore)
                .containsEntry("firstName", "Ana")
                .containsEntry("lastName", "Prva")
                .containsEntry("email", "ana@primer.si")
                .containsEntry("version", 0);
        assertThat(keptBefore.get("attributes")).isEqualTo(List.of(attribute("oddelek", "IT")));
        assertThat(keptBefore.get("tags")).isEqualTo(List.of("vip"));
        Map<String, Object> keptAfter = asObject(kept.get("after"));
        assertThat(keptAfter)
                .containsEntry("firstName", "Ana")
                .containsEntry("lastName", "Izbrana")
                .containsEntry("address", "Ulica 1")
                .containsEntry("email", "izbrana@primer.si")
                .containsEntry("phone", "031 111 222")
                .containsEntry("version", 1);
        assertThat(keptAfter.get("attributes"))
                .isEqualTo(List.of(attribute("oddelek", "IT"), attribute("mesto", "Maribor")));
        assertThat(keptAfter.get("tags")).isEqualTo(List.of("vip", "b"));

        Map<String, Object> removedB = changes.get(1);
        assertThat(removedB.get("display_name")).isEqualTo("Ana Druga");
        assertThat(asObject(removedB.get("before")))
                .containsEntry("lastName", "Druga")
                .containsEntry("version", 0);
        assertThat(removedB.get("after")).isNull();
        Map<String, Object> removedC = changes.get(2);
        assertThat(removedC.get("display_name")).isEqualTo("Ana Tretja");
        assertThat(asObject(removedC.get("before"))).containsEntry("lastName", "Tretja");
        assertThat(removedC.get("after")).isNull();

        // Isto prek REST: ohranjeni je spremenjen, ostala dva odstranjena.
        HttpResponse<String> rest =
                get("/api/groups/" + s.group() + "/audit/" + entry + "/changes", s.token(Who.VIEWER));
        assertThat(rest.statusCode()).isEqualTo(200);
        assertThat(asObjects(json(rest.body()).get("items")))
                .extracting(i -> i.get("kind"), i -> i.get("contactId"), i -> i.get("displayName"))
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple("CHANGED", t.a().get("id"), "Ana Izbrana"),
                        org.assertj.core.groups.Tuple.tuple("REMOVED", t.b().get("id"), "Ana Druga"),
                        org.assertj.core.groups.Tuple.tuple("REMOVED", t.c().get("id"), "Ana Tretja"));
    }

    @Test
    void theContactFilterOfAMergedAwayContactStillReturnsTheMergeEntry() throws Exception {
        Scenario s = scenario();
        Three t = three(s);
        HttpResponse<String> merged = merge(s.token(Who.EDITOR), s.group(), mergeBodyNow(t.ids(), chosen()));
        assertThat(merged.statusCode()).as(merged.body()).isEqualTo(200);
        UUID entry = (UUID) lastEntry(s.group()).get("id");
        assertThat(contacts.exists(uuid(t.b()))).isFalse();

        HttpResponse<String> response =
                get("/api/groups/" + s.group() + "/audit?contact=" + t.b().get("id"), s.token(Who.VIEWER));

        assertThat(response.statusCode()).isEqualTo(200);
        List<Map<String, Object>> items = asObjects(json(response.body()).get("items"));
        assertThat(items).extracting(item -> item.get("id")).contains(entry.toString());
        assertThat(items).extracting(item -> item.get("action")).contains("MERGE");
    }

    @Test
    void rejectedMergesWriteNoEntry() throws Exception {
        Scenario s = scenario();
        Three t = three(s);
        Snapshot before = snapshot(s.group());
        Map<String, Object> noName = result(null, null, null, "x@primer.si", null, null, null);
        UUID foreign =
                contacts.insert(groups.createGroup(s.id(Who.OWNER), "Druga skupina"), s.id(Who.OWNER), "Tuj", "K");
        List<Map<String, Object>> stale = List.of(contact(uuid(t.a()), 5), contact(uuid(t.b()), 0));

        HttpResponse<String> invalid = merge(s.token(Who.EDITOR), s.group(), mergeBodyNow(t.ids(), noName));
        HttpResponse<String> viewer = merge(s.token(Who.VIEWER), s.group(), mergeBodyNow(t.ids(), chosen()));
        HttpResponse<String> nonMember = merge(s.token(Who.NON_MEMBER), s.group(), mergeBodyNow(t.ids(), chosen()));
        HttpResponse<String> unknown = merge(
                s.token(Who.EDITOR),
                s.group(),
                mergeBody(List.of(contact(uuid(t.a()), 0), contact(foreign, 0)), chosen()));
        HttpResponse<String> conflict = merge(s.token(Who.EDITOR), s.group(), mergeBody(stale, chosen()));

        assertThat(invalid.statusCode()).isEqualTo(400);
        assertThat(viewer.statusCode()).isEqualTo(403);
        assertThat(nonMember.statusCode()).isEqualTo(404);
        assertThat(unknown.statusCode()).isEqualTo(404);
        assertThat(conflict.statusCode()).isEqualTo(409);
        assertUnchanged(before, snapshot(s.group()));
        assertThat(auditEntries(s.group(), "MERGE")).isEmpty();
    }

    @Test
    void aMergeWithoutAnyChangeOfValuesStillWritesAnEntryBecauseTheSetOfContactsChanged() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a =
                createContact(s, "Ana", "Prva", "ana@primer.si", List.of(attribute("oddelek", "IT")), List.of("vip"));
        Map<String, Object> b = createContact(s, "Ana", "Prva", "ana@primer.si", List.of(), List.of());
        Map<String, Object> same =
                result("Ana", "Prva", null, "ana@primer.si", null, List.of(attribute("oddelek", "IT")), List.of("vip"));
        int entriesBefore = audit.count(s.group());

        HttpResponse<String> response =
                merge(s.token(Who.EDITOR), s.group(), mergeBodyNow(List.of(uuid(a), uuid(b)), same));

        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        assertThat(audit.count(s.group())).isEqualTo(entriesBefore + 1);
        List<Map<String, Object>> merges = auditEntries(s.group(), "MERGE");
        assertThat(merges).hasSize(1);
        assertThat(merges.get(0).get("contact_count")).isEqualTo(2);
        assertThat(contacts.exists(uuid(b))).isFalse();
        assertThat(contacts.version(uuid(a))).isEqualTo(1);
    }
}
