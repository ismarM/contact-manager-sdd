package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import si.contactmanager.contact.support.MergeApiTest;

/**
 * Rezervirana imena država, country, podjetje, company (FR-013-08; Clarifications Q2): nov ali spremenjen ključ je
 * zavrnjen, obstoječi atributi ostanejo urejljivi, odstranljivi in združljivi; nič se ne migrira samodejno.
 */
@Tag("FR-013-08")
class ReservedKeysIT extends MergeApiTest {

    private static List<Map<String, String>> attrs(String... pairs) {
        List<Map<String, String>> list = new java.util.ArrayList<>();
        for (int i = 0; i < pairs.length; i += 2) {
            list.add(attribute(pairs[i], pairs[i + 1]));
        }
        return list;
    }

    private UUID legacy(Scenario s, String key, String value) {
        UUID id = contacts.insert(s.group(), s.id(Who.OWNER), "Stari", "Kontakt");
        contacts.addAttribute(id, 0, key, value);
        return id;
    }

    @ParameterizedTest(name = "nov ključ »{0}« je rezerviran")
    @ValueSource(
            strings = {
                "Država",
                "država",
                "DRŽAVA",
                "Country",
                "country",
                "Podjetje",
                "PODJETJE",
                "Company",
                "company",
                "  Country "
            })
    void aNewKeyWithAReservedNameIsRejectedOnCreate(String key) throws Exception {
        Scenario s = scenario();
        Map<String, Object> input = new java.util.LinkedHashMap<>(input("Janez", "Novak"));
        input.put("attributes", attrs(key, "x"));

        HttpResponse<String> response = post(contactsPath(s.group()), s.token(Who.EDITOR), body(input));

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(response.body())).containsEntry("attributes[0].key", "RESERVED_KEY");
        assertThat(contacts.count(s.group())).isZero();
    }

    @Test
    void aNewReservedKeyOnAnExistingContactIsRejectedAfterTheVersionCheck() throws Exception {
        Scenario s = scenario();
        Map<String, Object> created = createViaApi(s, input("Janez", "Novak"));
        Map<String, Object> change = new java.util.LinkedHashMap<>(input("Janez", "Novak"));
        change.put("attributes", attrs("Država", "Slovenija"));

        change.put("version", 99);
        HttpResponse<String> stale = put(contactPath(s.group(), created.get("id")), s.token(Who.EDITOR), body(change));
        change.put("version", 0);
        HttpResponse<String> current =
                put(contactPath(s.group(), created.get("id")), s.token(Who.EDITOR), body(change));

        assertThat(stale.statusCode()).isEqualTo(409);
        assertThat(current.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(current.body())).containsEntry("attributes[0].key", "RESERVED_KEY");
    }

    @Test
    void anExistingAttributeWithAReservedNameStaysAndTheContactCanBeEditedAndSaved() throws Exception {
        Scenario s = scenario();
        UUID id = legacy(s, "Država", "Slovenija");
        Map<String, Object> change = new java.util.LinkedHashMap<>(input("Stari", "Kontakt"));
        change.put("phone", "+38690234567");
        change.put("attributes", attrs("Država", "Slovenija"));
        change.put("version", 0);

        HttpResponse<String> response = put(contactPath(s.group(), id), s.token(Who.EDITOR), body(change));

        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        assertThat(contacts.attributesOf(id)).hasSize(1);
        assertThat(contacts.attributesOf(id).get(0))
                .containsEntry("key", "Država")
                .containsEntry("value", "Slovenija");
        assertThat(contacts.companyAndCountry(id)).containsEntry("country", null);
    }

    @Test
    void anExistingReservedAttributeMayBeEditedOrRemovedAndTransferredIntoTheFieldInOneSave() throws Exception {
        Scenario s = scenario();
        UUID id = legacy(s, "Država", "Slovenija");
        Map<String, Object> transfer = new java.util.LinkedHashMap<>(input("Stari", "Kontakt"));
        transfer.put("country", "SI");
        transfer.put("attributes", List.of());
        transfer.put("version", 0);

        HttpResponse<String> response = put(contactPath(s.group(), id), s.token(Who.EDITOR), body(transfer));

        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        assertThat(contacts.attributesOf(id)).isEmpty();
        assertThat(contacts.companyAndCountry(id)).containsEntry("country", "SI");
        assertThat(audit.count(s.group())).isEqualTo(1);
    }

    @Test
    void bulkSettingAReservedKeyIsRejectedButRemovingTheAttributeIsAllowed() throws Exception {
        Scenario s = scenario();
        UUID id = legacy(s, "Podjetje", "Acme");
        Map<String, Object> set = new java.util.LinkedHashMap<>();
        set.put("contactIds", List.of(id.toString()));
        set.put("attributes", List.of(Map.of("field", "custom", "key", "Company", "value", "Beta")));
        Map<String, Object> remove = new java.util.LinkedHashMap<>();
        remove.put("contactIds", List.of(id.toString()));
        remove.put("attributes", List.of(Map.of("field", "custom", "key", "Podjetje", "value", "")));
        String bulk = "/api/groups/" + s.group() + "/contacts/bulk-update";

        HttpResponse<String> rejected = post(bulk, s.token(Who.EDITOR), body(set));
        assertThat(rejected.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(rejected.body())).containsEntry("attributes[0].key", "RESERVED_KEY");
        assertThat(contacts.attributesOf(id)).hasSize(1);

        HttpResponse<String> removed = post(bulk, s.token(Who.EDITOR), body(remove));
        assertThat(removed.statusCode()).as(removed.body()).isEqualTo(200);
        assertThat(contacts.attributesOf(id)).isEmpty();
    }

    @Test
    void mergeSucceedsWhenAnIncludedContactHoldsAReservedAttributeButNotForABrandNewOne() throws Exception {
        Scenario s = scenario();
        UUID a = legacy(s, "Država", "Slovenija");
        jdbc.update("update contact set email = 'a@feri.si' where id = ?", a);
        Map<String, Object> b = createContact(s, "Stari", "Kontakt", "a@feri.si", null, null);
        Map<String, Object> ok = simpleResult("Stari", "Kontakt", "a@feri.si");
        ok.put("attributes", attrs("Država", "Slovenija"));

        HttpResponse<String> merged = merge(s.token(Who.EDITOR), s.group(), mergeBodyNow(List.of(a, uuid(b)), ok));

        assertThat(merged.statusCode()).as(merged.body()).isEqualTo(200);

        Map<String, Object> c = createContact(s, "Nov", "Dvojnik", "n@feri.si", null, null);
        Map<String, Object> d = createContact(s, "Nov", "Dvojnik", "n@feri.si", null, null);
        Map<String, Object> bad = simpleResult("Nov", "Dvojnik", "n@feri.si");
        bad.put("attributes", attrs("Company", "Acme"));

        HttpResponse<String> rejected =
                merge(s.token(Who.EDITOR), s.group(), mergeBodyNow(List.of(uuid(c), uuid(d)), bad));

        assertThat(rejected.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(rejected.body())).containsEntry("result.attributes[0].key", "RESERVED_KEY");
        assertThat(contacts.exists(uuid(c))).isTrue();
        assertThat(contacts.exists(uuid(d))).isTrue();
    }

    @Test
    void rollbackRestoresAReservedAttributeLiterally() throws Exception {
        Scenario s = scenario();
        UUID id = legacy(s, "Država", "Slovenija");
        Map<String, Object> detail =
                json(get(contactPath(s.group(), id), s.token(Who.EDITOR)).body());
        Map<String, Object> clear = new java.util.LinkedHashMap<>(input("Stari", "Kontakt"));
        clear.put("attributes", List.of());
        clear.put("version", detail.get("version"));
        assertThat(put(contactPath(s.group(), id), s.token(Who.EDITOR), body(clear))
                        .statusCode())
                .isEqualTo(200);
        UUID entry = audit.latestEntryId(s.group());

        HttpResponse<String> response = rollbackInitial(s, Who.ADMIN, entry);

        assertThat(response.statusCode()).as(response.body()).isEqualTo(201);
        assertThat(contacts.attributesOf(id)).hasSize(1);
        assertThat(contacts.attributesOf(id).get(0)).containsEntry("key", "Država");
    }

    private HttpResponse<String> rollbackInitial(Scenario s, Who who, UUID latest) throws Exception {
        return post(
                "/api/groups/" + s.group() + "/audit/initial-state/rollback",
                s.token(who),
                body(Map.of("latestEntryId", latest.toString())));
    }
}
