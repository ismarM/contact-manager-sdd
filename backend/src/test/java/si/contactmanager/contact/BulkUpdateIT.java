package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.contact.support.BulkApiTest;

/**
 * Množično urejanje značk in atributov ({@code POST …/contacts/bulk-update}; FR-009-06, -07, -08, -12, -16): pomen
 * operacij, verzije in metapodatki samo pri dejansko spremenjenih kontaktih, štetje.
 */
class BulkUpdateIT extends BulkApiTest {

    private Map<String, Object> updateOk(Scenario s, Object request) throws Exception {
        HttpResponse<String> response = bulkUpdate(s.token(Who.EDITOR), s.group(), request);
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        return json(response.body());
    }

    /** 12 kontaktov: prva dva imata že {@code konferenca2025} in nimata {@code staro}, ostali deset to še potrebuje. */
    private List<UUID> twelve(Scenario s) {
        List<UUID> all = new ArrayList<>();
        for (int i = 1; i <= 12; i++) {
            UUID id = contacts.insert(s.group(), s.id(Who.OWNER), "Ime" + i, "Priimek" + i);
            if (i <= 2) {
                contacts.addTags(id, "konferenca2025");
            } else if (i <= 6) {
                contacts.addTags(id, "a", "staro");
            } else if (i <= 8) {
                contacts.addTags(id, "b");
            }
            all.add(id);
        }
        return all;
    }

    @Test
    @Tag("FR-009-06")
    @Tag("FR-009-08")
    @Tag("FR-009-12")
    void addsAndRemovesTagsAndCountsOnlyTheContactsThatReallyChanged() throws Exception {
        Scenario s = scenario();
        List<UUID> all = twelve(s);
        Snapshot before = snapshot(s.group());

        Map<String, Object> answer =
                updateOk(s, request(all, "addTags", List.of("konferenca2025"), "removeTags", List.of("staro")));

        assertThat(answer).containsEntry("changed", 10);
        for (UUID id : all) {
            assertThat(contacts.tagsOf(id))
                    .as(id.toString())
                    .contains("konferenca2025")
                    .doesNotContain("staro");
        }
        // Kontakt z drugimi značkami jih ohrani, nova gre na konec; odstranitev ohrani vrstni red ostalih.
        assertThat(contacts.tagsOf(all.get(2))).containsExactly("a", "konferenca2025");
        assertThat(contacts.tagsOf(all.get(6))).containsExactly("b", "konferenca2025");
        assertThat(contacts.tagsOf(all.get(11))).containsExactly("konferenca2025");
        for (int i = 0; i < 12; i++) {
            UUID id = all.get(i);
            long versionBefore = ((Number) before.rows().get(id).get("version")).longValue();
            assertThat(contacts.version(id)).as("verzija " + i).isEqualTo(i < 2 ? versionBefore : versionBefore + 1);
        }
    }

    @Test
    @Tag("FR-009-16")
    void changedContactsGetTheActorTheTimeAndLoseTheRevertedMarkerUnchangedOnesKeepEverything() throws Exception {
        Scenario s = scenario();
        List<UUID> all = twelve(s);
        UUID marker = contacts.insert(s.group(), s.id(Who.OWNER), "Označen", "Povrnjen");
        contacts.deleteAsAudited(s.group(), s.id(Who.OWNER), marker);
        UUID entry = audit.latestEntryId(s.group());
        jdbc.update("update contact set reverted_entry_id = ? where id in (?, ?)", entry, all.get(5), all.get(0));
        Snapshot before = snapshot(s.group());
        jdbc.update("update contact set updated_at = now() - interval '1 day' where group_id = ?", s.group());

        updateOk(s, request(all, "addTags", List.of("konferenca2025"), "removeTags", List.of("staro")));

        Map<String, Object> changed = contacts.row(all.get(5));
        assertThat(((Number) changed.get("updated_by")).longValue()).isEqualTo(s.id(Who.EDITOR));
        assertThat(((Timestamp) changed.get("updated_at")).toInstant())
                .isAfter(java.time.Instant.now().minusSeconds(120));
        assertThat(jdbc.queryForObject("select reverted_entry_id from contact where id = ?", UUID.class, all.get(5)))
                .isNull();
        // Nespremenjen kontakt: verzija, izvajalec in oznaka Povrnjeno ostanejo.
        Map<String, Object> unchanged = contacts.row(all.get(0));
        assertThat(unchanged.get("version"))
                .isEqualTo(before.rows().get(all.get(0)).get("version"));
        assertThat(unchanged.get("updated_by"))
                .isEqualTo(before.rows().get(all.get(0)).get("updated_by"));
        assertThat(jdbc.queryForObject("select reverted_entry_id from contact where id = ?", UUID.class, all.get(0)))
                .isEqualTo(entry);
    }

    @Test
    @Tag("FR-009-07")
    void aCustomAttributeOverwritesTheExistingKeyIgnoringCaseWithTheSpellingOfTheRequest() throws Exception {
        Scenario s = scenario();
        UUID withKey = contacts.insert(s.group(), s.id(Who.OWNER), "Ana", "Prva");
        contacts.addAttribute(withKey, 0, "Oddelek", "IT");
        contacts.addAttribute(withKey, 1, "Podjetje", "stari d.o.o.");
        UUID without = contacts.insert(s.group(), s.id(Who.OWNER), "Bojan", "Drugi");

        Map<String, Object> answer = updateOk(
                s,
                request(List.of(withKey, without), "attributes", List.of(attributeSet("custom", "podjetje", "FERI"))));

        assertThat(answer).containsEntry("changed", 2);
        assertThat(contacts.attributesOf(withKey))
                .containsExactly(Map.of("key", "Oddelek", "value", "IT"), Map.of("key", "podjetje", "value", "FERI"));
        assertThat(contacts.attributesOf(without)).containsExactly(Map.of("key", "podjetje", "value", "FERI"));
    }

    @Test
    @Tag("FR-009-07")
    void anEmptyValueRemovesTheAttributeOnlyWhereItExists() throws Exception {
        Scenario s = scenario();
        UUID has = contacts.insert(s.group(), s.id(Who.OWNER), "Ana", "Prva");
        contacts.addAttribute(has, 0, "podjetje", "FERI");
        contacts.addAttribute(has, 1, "mesto", "MB");
        UUID hasNot = contacts.insert(s.group(), s.id(Who.OWNER), "Bojan", "Drugi");
        long hasNotVersion = contacts.version(hasNot);

        Map<String, Object> answer = updateOk(
                s, request(List.of(has, hasNot), "attributes", List.of(attributeSet("custom", "Podjetje", ""))));

        assertThat(answer).containsEntry("changed", 1);
        assertThat(contacts.attributesOf(has)).containsExactly(Map.of("key", "mesto", "value", "MB"));
        assertThat(contacts.version(hasNot)).isEqualTo(hasNotVersion);
        assertThat(contacts.attributeRows(hasNot)).isZero();
    }

    @Test
    @Tag("FR-009-07")
    void predefinedFieldsAreSetForAllAndEmptiedByAnEmptyValue() throws Exception {
        Scenario s = scenario();
        List<UUID> all = new ArrayList<>();
        for (int i = 1; i <= 3; i++) {
            all.add(contacts.insert(
                    s.group(), s.id(Who.OWNER), "Ime" + i, "Priimek" + i, "stari" + i + "@primer.si", "01 111", null));
        }

        updateOk(
                s,
                request(
                        all,
                        "attributes",
                        List.of(attributeSet("phone", null, "01 234 56 78"), attributeSet("email", null, ""))));

        for (UUID id : all) {
            Map<String, Object> row = contacts.row(id);
            assertThat(row.get("phone")).isEqualTo("01 234 56 78");
            assertThat(row.get("email")).isNull();
            assertThat(row.get("first_name")).isNotNull();
        }
    }

    @Test
    @Tag("FR-009-12")
    void anOperationWithoutAnyRealChangeSucceedsWithZeroChanged() throws Exception {
        Scenario s = scenario();
        List<UUID> all = contacts.insertManyWithTagsAndAttributes(
                s.group(), s.id(Who.OWNER), 4, List.of("vip"), Map.of("podjetje", "FERI"));
        Snapshot before = snapshot(s.group());

        Map<String, Object> answer = updateOk(
                s,
                request(
                        all,
                        "addTags",
                        List.of("VIP"),
                        "removeTags",
                        List.of("neobstaja"),
                        "attributes",
                        List.of(attributeSet("custom", "PODJETJE", "FERI"))));

        assertThat(answer).containsEntry("changed", 0);
        Snapshot after = snapshot(s.group());
        assertThat(after.rows()).isEqualTo(before.rows());
        assertThat(after.tags()).isEqualTo(before.tags());
        assertThat(after.auditEntries()).isEqualTo(before.auditEntries());
    }

    @Test
    @Tag("FR-009-12")
    void aDuplicateIdentityIsCountedOnce() throws Exception {
        Scenario s = scenario();
        UUID a = contacts.insert(s.group(), s.id(Who.OWNER), "Ana", "Prva");
        UUID b = contacts.insert(s.group(), s.id(Who.OWNER), "Bojan", "Drugi");

        Map<String, Object> answer = updateOk(s, request(List.of(a, b, a, a), "addTags", List.of("nova")));

        assertThat(answer).containsEntry("changed", 2);
        assertThat(contacts.tagsOf(a)).containsExactly("nova");
        assertThat(contacts.version(a)).isEqualTo(1);
    }

    @Test
    @Tag("FR-009-16")
    void savingAContactWithAnOldVersionAfterTheBulkOperationIsAVersionConflict() throws Exception {
        Scenario s = scenario();
        Map<String, Object> created = createViaApi(s, input("Janez", "Novak"));
        UUID id = UUID.fromString((String) created.get("id"));
        long oldVersion = ((Number) created.get("version")).longValue();
        updateOk(s, request(List.of(id), "addTags", List.of("nova")));

        HttpResponse<String> stale = put(
                contactPath(s.group(), id),
                s.token(Who.EDITOR),
                body(withVersion(input("Janez", "Prepisan"), oldVersion)));

        assertThat(stale.statusCode()).isEqualTo(409);
        assertThat(json(stale.body())).containsEntry("code", "VERSION_CONFLICT");
        assertThat(contacts.tagsOf(id)).containsExactly("nova");
    }
}
