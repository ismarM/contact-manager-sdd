package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.contact.support.ContactApiTest;

/**
 * Seznam ključev atributov skupine {@code GET …/attribute-keys} (016, FR-016-01, -04, -05): ključi v uporabi s tipom,
 * številom kontaktov in verzijo; stari ključi brez vrstice so {@code OTHER}; iskanje brez razlike velikosti črk in
 * strešic z natančnim ujemanjem prvim; paginacija 25/50/100.
 */
@Tag("FR-016-01")
@Tag("FR-016-04")
@Tag("FR-016-05")
class AttributeKeysIT extends ContactApiTest {

    private static String keysPath(UUID group, String query) {
        return "/api/groups/" + group + "/attribute-keys" + query;
    }

    private void typedKey(UUID group, String keyNorm, String type) {
        jdbc.update(
                "insert into attribute_key (group_id, key_norm, type) values (?, ?, ?)"
                        + " on conflict (group_id, key_norm) do update set type = excluded.type",
                group,
                keyNorm,
                type);
    }

    @Test
    void existingKeysWithoutARowAreOtherAndCarryTheirContactCount() throws Exception {
        Scenario s = scenario();
        UUID a = contacts.insert(s.group(), s.id(Who.OWNER), "Ana", "Novak");
        UUID b = contacts.insert(s.group(), s.id(Who.OWNER), "Bojan", "Horvat");
        contacts.addAttribute(a, 0, "Oddelek", "IT");
        contacts.addAttribute(b, 0, "Oddelek", "Razvoj");
        contacts.addAttribute(b, 1, "mobilni", "041 123 456");
        typedKey(s.group(), "mobilni", "PHONE");

        HttpResponse<String> response = get(keysPath(s.group(), ""), s.token(Who.VIEWER));

        assertThat(response.statusCode()).isEqualTo(200);
        Map<String, Object> page = json(response.body());
        assertThat(page).containsEntry("page", 0).containsEntry("size", 25).containsEntry("total", 2);
        assertThat(asObjects(page.get("items")))
                .containsExactly(
                        Map.of("key", "mobilni", "type", "PHONE", "contactCount", 1, "version", 0),
                        Map.of("key", "Oddelek", "type", "OTHER", "contactCount", 2, "version", 0));
    }

    @Test
    void searchIsCaseAndAccentInsensitiveWithTheExactMatchFirst() throws Exception {
        Scenario s = scenario();
        UUID a = contacts.insert(s.group(), s.id(Who.OWNER), "Ana", "Novak");
        contacts.addAttribute(a, 0, "mobilni telefon", "1");
        contacts.addAttribute(a, 1, "telefon", "2");
        contacts.addAttribute(a, 2, "Služba", "3");
        contacts.addAttribute(a, 3, "Šola", "4");

        List<Object> telefon =
                asObjects(json(get(keysPath(s.group(), "?q=TELEFON"), s.token(Who.EDITOR))
                                        .body())
                                .get("items"))
                        .stream()
                        .map(item -> item.get("key"))
                        .toList();
        List<Object> accent =
                asObjects(json(get(keysPath(s.group(), "?q=sluzba"), s.token(Who.EDITOR))
                                        .body())
                                .get("items"))
                        .stream()
                        .map(item -> item.get("key"))
                        .toList();

        assertThat(telefon).containsExactly("telefon", "mobilni telefon");
        assertThat(accent).containsExactly("Služba");
    }

    @Test
    void pagesHaveTheRequestedSizeAndTheTotalCoversAllKeys() throws Exception {
        Scenario s = scenario();
        UUID a = contacts.insert(s.group(), s.id(Who.OWNER), "Ana", "Novak");
        for (int i = 0; i < 30; i++) {
            contacts.addAttribute(a, i, "ključ" + String.format("%02d", i), "v");
        }

        Map<String, Object> first =
                json(get(keysPath(s.group(), "?size=25"), s.token(Who.VIEWER)).body());
        Map<String, Object> second = json(
                get(keysPath(s.group(), "?size=25&page=1"), s.token(Who.VIEWER)).body());

        assertThat(asObjects(first.get("items"))).hasSize(25);
        assertThat(asObjects(second.get("items"))).hasSize(5);
        assertThat(first).containsEntry("total", 30);
        assertThat(asObjects(second.get("items")).get(0)).containsEntry("key", "ključ25");
    }

    @Test
    void invalidParametersAreRefused() throws Exception {
        Scenario s = scenario();

        assertThat(fieldErrors(get(keysPath(s.group(), "?size=10"), s.token(Who.VIEWER))
                        .body()))
                .containsEntry("size", "INVALID_VALUE");
        assertThat(fieldErrors(get(keysPath(s.group(), "?page=-1"), s.token(Who.VIEWER))
                        .body()))
                .containsEntry("page", "INVALID_VALUE");
        assertThat(fieldErrors(
                        get(keysPath(s.group(), "?page=x"), s.token(Who.VIEWER)).body()))
                .containsEntry("page", "INVALID_VALUE");
        assertThat(fieldErrors(get(keysPath(s.group(), "?q=" + "a".repeat(51)), s.token(Who.VIEWER))
                        .body()))
                .containsEntry("q", "TOO_LONG");
        assertThat(get(keysPath(s.group(), "?size=10"), s.token(Who.VIEWER)).statusCode())
                .isEqualTo(400);
    }
}
