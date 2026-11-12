package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.contact.support.DuplicateApiTest;

/**
 * Združitev kontaktov prek HTTP (FR-011-11, FR-011-13, FR-011-15; data-model.md – MergeResult): ohranjeni je najstarejši
 * kontakt, dobi dobesedne izbrane vrednosti in verzijo + 1, ostali so izbrisani, kontakti zunaj zahtevka se ne
 * dotaknejo.
 */
@Tag("FR-011-11")
@Tag("FR-011-13")
@Tag("FR-011-15")
class MergeIT extends DuplicateApiTest {

    private static final Instant BASE = Instant.parse("2026-02-01T10:00:00Z");

    private UUID a;
    private UUID b;
    private UUID c;

    /** A (najstarejši), B in C z različnimi vrednostmi; A ima atribut in znački, ki ju rezultat zamenja. */
    private Scenario threeContacts() throws Exception {
        Scenario s = scenario();
        long owner = s.id(Who.OWNER);
        a = contacts.insertContact(s.group(), owner, "Ana", "Kos", "ana@primer.si", "041 000 001", BASE);
        b = contacts.insertContact(
                s.group(), owner, "Bojan", "Breg", "bojan@primer.si", "041 111 222", BASE.plusSeconds(10));
        c = contacts.insertContact(
                s.group(), owner, "Cene", "Cerar", "cene@primer.si", "041 000 003", BASE.plusSeconds(20));
        contacts.addAttribute(a, 0, "Oddelek", "IT");
        contacts.addTags(a, "stara", "druga");
        contacts.addTags(b, "bbb");
        return s;
    }

    private Map<String, Object> janez(String phone) {
        return result(
                "Janez",
                "Novak",
                "Ulica 5, Maribor",
                "ana@primer.si",
                phone,
                List.of(attribute("Kompetenca", "java")),
                List.of("vip", "konferenca2025", "alumni"));
    }

    private HttpResponse<String> mergeAsEditor(Scenario s, List<UUID> ids, Map<String, Object> result)
            throws Exception {
        return merge(s.token(Who.EDITOR), s.group(), mergeBodyNow(ids, result));
    }

    private Map<String, Object> detail(Scenario s, UUID id) throws Exception {
        HttpResponse<String> response = get(contactPath(s.group(), id), s.token(Who.VIEWER));
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        return json(response.body());
    }

    private List<Map<String, Object>> list(Scenario s) throws Exception {
        HttpResponse<String> response = get(contactsPath(s.group()), s.token(Who.VIEWER));
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        return asObjects(json(response.body()).get("items"));
    }

    @Test
    void mergeKeepsTheOldestContactWithTheChosenValuesAndDeletesTheOthers() throws Exception {
        Scenario s = threeContacts();
        Instant createdBefore = contacts.createdAt(a);
        Instant requested = Instant.now();

        HttpResponse<String> response = mergeAsEditor(s, List.of(a, b, c), janez("041 111 222"));

        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        Map<String, Object> merged = json(response.body());
        assertThat(merged)
                .containsEntry("keptContactId", a.toString())
                .containsEntry("mergedCount", 3)
                .containsEntry("keptDisplayName", "Janez Novak");
        List<Map<String, Object>> entries = auditEntries(s.group(), "MERGE");
        assertThat(entries).hasSize(1);
        assertThat(merged.get("auditEntryId"))
                .isEqualTo(entries.get(0).get("id").toString());

        Map<String, Object> kept = detail(s, a);
        assertThat(kept)
                .containsEntry("id", a.toString())
                .containsEntry("firstName", "Janez")
                .containsEntry("lastName", "Novak")
                .containsEntry("address", "Ulica 5, Maribor")
                .containsEntry("email", "ana@primer.si")
                .containsEntry("phone", "041 111 222")
                .containsEntry("tags", List.of("vip", "konferenca2025", "alumni"))
                .containsEntry("version", 1);
        assertThat(asObjects(kept.get("attributes"))).containsExactly(Map.of("key", "Kompetenca", "value", "java"));
        assertThat(Instant.parse((String) kept.get("updatedAt"))).isAfterOrEqualTo(requested);
        assertThat(contacts.createdAt(a)).isEqualTo(createdBefore);
        assertThat(contacts.row(a).get("updated_by")).isEqualTo(s.id(Who.EDITOR));
        assertThat(jdbc.queryForObject("select reverted_entry_id from contact where id = ?", UUID.class, a))
                .isNull();

        List<Map<String, Object>> listed = list(s);
        assertThat(listed).hasSize(1);
        assertThat(listed.get(0))
                .containsEntry("id", a.toString())
                .containsEntry("displayName", "Janez Novak")
                .containsEntry("tags", List.of("vip", "konferenca2025", "alumni"))
                .containsEntry("reverted", false);
        assertThat(get(contactPath(s.group(), b), s.token(Who.VIEWER)).statusCode())
                .isEqualTo(404);
        assertThat(get(contactPath(s.group(), c), s.token(Who.VIEWER)).statusCode())
                .isEqualTo(404);
    }

    @Test
    void theOldestContactIsKeptRegardlessOfTheOrderInTheRequest() throws Exception {
        Scenario s = threeContacts();

        HttpResponse<String> response = mergeAsEditor(s, List.of(c, b, a), janez("041 111 222"));

        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        assertThat(json(response.body())).containsEntry("keptContactId", a.toString());
        assertThat(contacts.exists(a)).isTrue();
        assertThat(contacts.exists(b)).isFalse();
        assertThat(contacts.exists(c)).isFalse();
    }

    @Test
    void aMergeWithValuesIdenticalToTheKeptContactStillRaisesItsVersion() throws Exception {
        Scenario s = threeContacts();
        Map<String, Object> same = result(
                "Ana",
                "Kos",
                null,
                "ana@primer.si",
                "041 000 001",
                List.of(attribute("Oddelek", "IT")),
                List.of("stara", "druga"));

        HttpResponse<String> response = mergeAsEditor(s, List.of(a, b), same);

        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        assertThat(contacts.version(a)).isEqualTo(1);
        assertThat(contacts.exists(b)).isFalse();
        assertThat(contacts.exists(c)).isTrue();
        Map<String, Object> kept = detail(s, a);
        assertThat(kept)
                .containsEntry("firstName", "Ana")
                .containsEntry("lastName", "Kos")
                .containsEntry("phone", "041 000 001")
                .containsEntry("tags", List.of("stara", "druga"));
    }

    @Test
    void anEmptyChoiceLeavesTheFieldEmpty() throws Exception {
        Scenario s = threeContacts();

        HttpResponse<String> response = mergeAsEditor(s, List.of(a, b, c), janez(null));

        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        assertThat(detail(s, a).get("phone")).isNull();
        assertThat(contacts.row(a).get("phone")).isNull();
    }

    @Test
    void contactsOutsideTheRequestAreNotTouched() throws Exception {
        Scenario s = threeContacts();
        long owner = s.id(Who.OWNER);
        UUID d = contacts.insertContact(
                s.group(), owner, "Dana", "Dolenc", "ana@primer.si", "041 000 004", BASE.plusSeconds(30));
        UUID e = contacts.insertContact(
                s.group(), owner, "Eva", "Erjavec", "ana@primer.si", "041 000 005", BASE.plusSeconds(40));
        contacts.addTags(d, "d1", "d2");
        contacts.addAttribute(e, 0, "Mesto", "Celje");
        Map<String, Object> rowD = contacts.row(d);
        Map<String, Object> rowE = contacts.row(e);

        HttpResponse<String> response = mergeAsEditor(s, List.of(a, b), janez("041 111 222"));

        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        assertThat(json(response.body())).containsEntry("mergedCount", 2);
        assertThat(contacts.row(d)).isEqualTo(rowD);
        assertThat(contacts.row(e)).isEqualTo(rowE);
        assertThat(contacts.version(d)).isZero();
        assertThat(contacts.version(e)).isZero();
        assertThat(contacts.tagsOf(d)).containsExactly("d1", "d2");
        assertThat(contacts.attributesOf(e)).containsExactly(Map.of("key", "Mesto", "value", "Celje"));
        assertThat(contacts.exists(c)).isTrue();
        assertThat(contacts.version(c)).isZero();
    }

    @Test
    void theMergedContactIsSortedByItsNewLastName() throws Exception {
        Scenario s = scenario();
        long owner = s.id(Who.OWNER);
        UUID first = contacts.insertContact(s.group(), owner, "Anton", "Abram", "x@primer.si", null, BASE);
        UUID second =
                contacts.insertContact(s.group(), owner, "Bojan", "Abram", "x@primer.si", null, BASE.plusSeconds(1));
        contacts.insertContact(s.group(), owner, "Ana", "Kos", null, null, BASE.plusSeconds(2));
        assertThat(list(s))
                .extracting(item -> item.get("displayName"))
                .containsExactly("Anton Abram", "Bojan Abram", "Ana Kos");

        HttpResponse<String> response = mergeAsEditor(
                s, List.of(first, second), result("Janez", "Zupan", null, "x@primer.si", null, null, null));

        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        assertThat(list(s)).extracting(item -> item.get("displayName")).containsExactly("Ana Kos", "Janez Zupan");
    }

    @Test
    void theLinkToTheKeptContactWorksAndTheLinksToDeletedOnesGive404() throws Exception {
        Scenario s = threeContacts();

        HttpResponse<String> response = mergeAsEditor(s, List.of(a, b, c), janez("041 111 222"));

        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        assertThat(get(contactPath(s.group(), a), s.token(Who.EDITOR)).statusCode())
                .isEqualTo(200);
        assertThat(get(contactPath(s.group(), b), s.token(Who.EDITOR)).statusCode())
                .isEqualTo(404);
        assertThat(get(contactPath(s.group(), c), s.token(Who.EDITOR)).statusCode())
                .isEqualTo(404);
    }
}
