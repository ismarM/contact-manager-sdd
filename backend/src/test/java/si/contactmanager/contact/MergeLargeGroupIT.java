package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.contact.support.MergeApiTest;

/**
 * Velika skupina dvojnikov (D-89: 40 kontaktov z istim e-naslovom): iskanje vrne eno skupino s 40 kontakti, primerjava
 * in združitev sprejmeta največ 10, zato se skupina zmanjšuje v krogih po 10 (ohranjeni je vedno najstarejši), vsak
 * krog ustvari natanko en vnos {@code MERGE} in je razveljavljiv z rollbackom 005.
 */
@Tag("FR-011-02")
@Tag("FR-011-07")
@Tag("FR-011-08")
@Tag("FR-011-11")
@Tag("FR-011-15")
@Tag("FR-011-21")
class MergeLargeGroupIT extends MergeApiTest {

    private static final String EMAIL = "skupina@primer.si";

    private List<UUID> duplicates;
    private List<UUID> others;
    private Scenario s;

    private void seed() throws Exception {
        s = scenario();
        long owner = s.id(Who.OWNER);
        duplicates = contacts.insertDuplicates(s.group(), owner, 40, EMAIL);
        others = new ArrayList<>();
        Instant start = Instant.parse("2026-02-01T00:00:00Z");
        for (int i = 1; i <= 5; i++) {
            others.add(contacts.insertContact(
                    s.group(),
                    owner,
                    "Drug" + i,
                    "Kontakt" + i,
                    "drug" + i + "@primer.si",
                    null,
                    start.plusSeconds(i)));
        }
    }

    private List<UUID> found() throws Exception {
        HttpResponse<String> response = duplicates(s.token(Who.EDITOR), s.group(), "category", "email");
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        List<Map<String, Object>> groups = asObjects(json(response.body()).get("groups"));
        if (groups.isEmpty()) {
            return List.of();
        }
        assertThat(groups).hasSize(1);
        Map<String, Object> group = groups.get(0);
        List<UUID> ids = asObjects(group.get("contacts")).stream()
                .map(contact -> UUID.fromString((String) contact.get("id")))
                .toList();
        assertThat(group.get("size")).isEqualTo(ids.size());
        return ids;
    }

    /** Rezultat kroga {@code round}: ime, priimek in telefon kroga ter značka kroga. */
    private Map<String, Object> roundResult(int round) {
        return result("Ime01", "Priimek01", null, EMAIL, "01 000 00" + round, null, List.of("krog" + round));
    }

    /** Primerjava in združitev prvih {@code ids}; vrne {@code auditEntryId}. */
    private UUID mergeRound(List<UUID> ids, int round) throws Exception {
        HttpResponse<String> opened = compare(s.token(Who.EDITOR), s.group(), ids);
        assertThat(opened.statusCode()).as(opened.body()).isEqualTo(200);
        List<Map<String, Object>> rows = new ArrayList<>();
        List<Map<String, Object>> fetched = asObjects(json(opened.body()).get("contacts"));
        assertThat(fetched)
                .extracting(c -> c.get("id"))
                .containsExactlyElementsOf(ids.stream().map(UUID::toString).toList());
        for (Map<String, Object> contact : fetched) {
            rows.add(contact(
                    UUID.fromString((String) contact.get("id")), ((Number) contact.get("version")).longValue()));
        }
        HttpResponse<String> response = merge(s.token(Who.EDITOR), s.group(), mergeBody(rows, roundResult(round)));
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        Map<String, Object> merged = json(response.body());
        assertThat(merged)
                .containsEntry("mergedCount", ids.size())
                .containsEntry("keptContactId", ids.get(0).toString());
        return UUID.fromString((String) merged.get("auditEntryId"));
    }

    private Map<UUID, Map<String, Object>> contentOfAll() {
        Map<UUID, Map<String, Object>> all = new LinkedHashMap<>();
        for (UUID id : audit.contactIds(s.group())) {
            all.put(id, content(id));
        }
        return all;
    }

    @Test
    void theSearchReturnsOneGroupOfFortyInCreationOrder() throws Exception {
        seed();

        List<UUID> ids = found();

        assertThat(ids).containsExactlyElementsOf(duplicates);
        HttpResponse<String> response = duplicates(s.token(Who.EDITOR), s.group(), "category", "email");
        Map<String, Object> page = json(response.body());
        assertThat(page).containsEntry("total", 1);
        assertThat(asObject(asObjects(page.get("groups")).get(0))).containsEntry("size", 40);
    }

    @Test
    void compareAndMergeOfAllFortyAreRejectedAsTooManyWithoutAnyChange() throws Exception {
        seed();
        Snapshot before = snapshot(s.group());

        HttpResponse<String> compared = compare(s.token(Who.EDITOR), s.group(), duplicates);
        List<Map<String, Object>> all = new ArrayList<>();
        for (UUID id : duplicates) {
            all.add(contact(id, 0));
        }
        HttpResponse<String> merged = merge(s.token(Who.EDITOR), s.group(), mergeBody(all, roundResult(1)));

        assertThat(compared.statusCode()).as(compared.body()).isEqualTo(400);
        assertThat(fieldErrors(compared.body())).containsEntry("ids", "TOO_MANY");
        assertThat(merged.statusCode()).as(merged.body()).isEqualTo(400);
        assertThat(fieldErrors(merged.body())).containsEntry("contacts", "TOO_MANY");
        assertUnchanged(before, snapshot(s.group()));
    }

    @Test
    void fiveRoundsOfTenShrinkTheGroupToNothingAndEachWritesOneEntry() throws Exception {
        seed();
        UUID kept = duplicates.get(0);
        List<UUID> expected = new ArrayList<>(duplicates);
        List<Integer> expectedSizes = List.of(31, 22, 13, 4, 1);
        int mergeEntries = 0;

        for (int round = 1; round <= 5; round++) {
            List<UUID> current = found();
            assertThat(current).as("krog " + round).containsExactlyElementsOf(expected);
            List<UUID> taken = new ArrayList<>(current.subList(0, Math.min(10, current.size())));
            Snapshot before = snapshot(s.group());

            mergeRound(taken, round);

            // Združeni so samo vključeni kontakti, ostali (tudi tisti, ki jih krog ni vključil) so nespremenjeni.
            Snapshot after = snapshot(s.group());
            for (UUID id : current.subList(taken.size(), current.size())) {
                assertThat(after.rows().get(id))
                        .as("nespremenjen " + id)
                        .isEqualTo(before.rows().get(id));
                assertThat(after.tags().get(id)).isEqualTo(before.tags().get(id));
                assertThat(after.attributes().get(id))
                        .isEqualTo(before.attributes().get(id));
            }
            for (UUID id : others) {
                assertThat(after.rows().get(id)).isEqualTo(before.rows().get(id));
            }
            for (UUID id : taken.subList(1, taken.size())) {
                assertThat(contacts.exists(id)).as("združen " + id).isFalse();
            }
            assertThat(contacts.row(kept).get("phone")).isEqualTo("01 000 00" + round);
            assertThat(contacts.tagsOf(kept)).containsExactly("krog" + round);
            mergeEntries++;
            assertThat(auditEntries(s.group(), "MERGE")).hasSize(mergeEntries);
            assertThat(after.auditEntries()).isEqualTo(before.auditEntries() + 1);

            expected = new ArrayList<>();
            expected.add(kept);
            expected.addAll(current.subList(taken.size(), current.size()));
            assertThat(expected.size()).isEqualTo(expectedSizes.get(round - 1));
            if (expected.size() < 2) {
                expected = List.of();
            }
        }

        assertThat(found()).isEmpty();
        HttpResponse<String> page = duplicates(s.token(Who.EDITOR), s.group(), "category", "email");
        assertThat(json(page.body())).containsEntry("total", 0);
        assertThat(asObjects(json(page.body()).get("groups"))).isEmpty();
        assertThat(contacts.count(s.group())).isEqualTo(1 + others.size());
        assertThat(auditEntries(s.group(), "MERGE")).hasSize(5);
    }

    @Test
    void aRollbackToThePointBeforeRoundThreeRestoresTheStateRightBeforeIt() throws Exception {
        seed();
        UUID kept = duplicates.get(0);
        List<UUID> current = found();
        mergeRound(new ArrayList<>(current.subList(0, 10)), 1);
        current = found();
        UUID round2 = mergeRound(new ArrayList<>(current.subList(0, 10)), 2);
        Map<UUID, Map<String, Object>> afterRound2 = contentOfAll();
        assertThat(afterRound2).hasSize(1 + 22 + others.size());
        current = found();
        mergeRound(new ArrayList<>(current.subList(0, 10)), 3);
        current = found();
        mergeRound(new ArrayList<>(current.subList(0, 10)), 4);
        assertThat(contacts.count(s.group())).isEqualTo(1 + 4 + others.size());

        rollbackTo(s, round2);

        assertThat(contentOfAll()).isEqualTo(afterRound2);
        assertThat(found()).hasSize(22).startsWith(kept);
        assertThat(contacts.tagsOf(kept)).containsExactly("krog2");
    }
}
