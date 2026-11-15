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
import si.contactmanager.audit.support.AuditApiTest;
import si.contactmanager.contact.support.ContactSearchClient;
import si.contactmanager.support.Http;

/**
 * Polji podjetje in država (013, US1): shranjevanje, branje, validacija, ohranitev obstoječih kontaktov, iskanje,
 * filter, množično urejanje, sled in rollback. Pričakovani izidi so napisani iz specifikacije.
 */
class ContactNewFieldsIT extends AuditApiTest {

    private static Map<String, Object> withFields(String first, String company, String country) {
        Map<String, Object> input = input(first, "Novak");
        input.put("company", company);
        input.put("country", country);
        return input;
    }

    private List<String> found(Scenario s, String... pairs) throws Exception {
        HttpResponse<String> response =
                get(ContactSearchClient.listPath(s.group()) + ContactSearchClient.query(pairs), s.token(Who.VIEWER));
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        return ContactSearchClient.names(response.body());
    }

    @Test
    @Tag("FR-013-01")
    @Tag("FR-013-13")
    void createStoresCompanyAndCountryCodeAndTheDetailReturnsThem() throws Exception {
        Scenario s = scenario();

        Map<String, Object> created = create(s, Who.EDITOR, withFields("Janez", "  Acme d.o.o. ", "SI"));

        assertThat(created).containsEntry("company", "Acme d.o.o.").containsEntry("country", "SI");
        HttpResponse<String> read = get(contactPath(s.group(), created.get("id")), s.token(Who.VIEWER));
        assertThat(json(read.body())).containsEntry("company", "Acme d.o.o.").containsEntry("country", "SI");
        assertThat(contacts.companyAndCountry(idOf(created)))
                .containsEntry("company", "Acme d.o.o.")
                .containsEntry("country", "SI");
    }

    @Test
    @Tag("FR-013-01")
    void emptyCompanyAndCountryAreStoredAsAbsent() throws Exception {
        Scenario s = scenario();

        Map<String, Object> created = create(s, Who.EDITOR, withFields("Janez", "  ", ""));

        assertThat(created).containsEntry("company", null).containsEntry("country", null);
    }

    @ParameterizedTest(name = "država »{0}« ni veljavna koda alpha-2")
    @ValueSource(strings = {"si", "SVN", "XX", "Slovenija", "S", "1A", "XK"})
    @Tag("FR-013-13")
    void anInvalidCountryIsRejectedWithInvalidValueAndNothingChanges(String country) throws Exception {
        Scenario s = scenario();

        HttpResponse<String> response =
                post(contactsPath(s.group()), s.token(Who.EDITOR), body(withFields("Janez", null, country)));

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(response.body())).containsEntry("country", "INVALID_VALUE");
        assertThat(contacts.count(s.group())).isZero();
    }

    @Test
    @Tag("FR-013-01")
    void aCompanyOfTwoHundredCharactersIsAcceptedAndOneMoreIsTooLong() throws Exception {
        Scenario s = scenario();

        HttpResponse<String> ok =
                post(contactsPath(s.group()), s.token(Who.EDITOR), body(withFields("A", "p".repeat(200), null)));
        HttpResponse<String> tooLong =
                post(contactsPath(s.group()), s.token(Who.EDITOR), body(withFields("B", "p".repeat(201), null)));

        assertThat(ok.statusCode()).isEqualTo(201);
        assertThat(tooLong.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(tooLong.body())).containsEntry("company", "TOO_LONG");
        assertThat(contacts.count(s.group())).isEqualTo(1);
    }

    @Test
    @Tag("FR-013-02")
    void aContactFromBefore013HasEmptyFieldsAndAnUnchangedVersion() throws Exception {
        Scenario s = scenario();
        UUID old = contacts.insert(s.group(), s.id(Who.OWNER), "Stari", "Kontakt", "stari@feri.si", null, null);

        HttpResponse<String> read = get(contactPath(s.group(), old), s.token(Who.VIEWER));

        assertThat(read.statusCode()).isEqualTo(200);
        assertThat(json(read.body()))
                .containsEntry("company", null)
                .containsEntry("country", null)
                .containsEntry("version", 0);
        assertThat(contacts.version(old)).isZero();
    }

    @Test
    @Tag("FR-013-01")
    void updatingOnlyTheCompanyBumpsTheVersionAndSavingTheSameValuesDoesNot() throws Exception {
        Scenario s = scenario();
        Map<String, Object> created = create(s, Who.EDITOR, withFields("Janez", "Acme", "SI"));
        UUID id = idOf(created);

        Map<String, Object> same = update(s, Who.EDITOR, id, valuesWithFields(created), versionOf(created));
        Map<String, Object> values = valuesWithFields(created);
        values.put("company", "Beta");
        Map<String, Object> changed = update(s, Who.EDITOR, id, values, versionOf(same));

        assertThat(versionOf(same)).isEqualTo(versionOf(created));
        assertThat(versionOf(changed)).isEqualTo(versionOf(created) + 1);
        assertThat(changed).containsEntry("company", "Beta").containsEntry("country", "SI");
        assertThat(audit.count(s.group())).isEqualTo(2);
    }

    private static Map<String, Object> valuesWithFields(Map<String, Object> detail) {
        Map<String, Object> values = valuesOf(detail);
        values.put("company", detail.get("company"));
        values.put("country", detail.get("country"));
        return values;
    }

    @Test
    @Tag("FR-013-03")
    void quickSearchFindsByCompanyAndByCountryCodeOrNameInBothLanguages() throws Exception {
        Scenario s = scenario();
        create(s, Who.EDITOR, withFields("Ana", "Acme d.o.o.", "AT"));
        create(s, Who.EDITOR, withFields("Bojan", "Beta", "DE"));
        create(s, Who.EDITOR, withFields("Cene", null, null));

        assertThat(found(s, "q", "acme")).containsExactly("Ana Novak");
        assertThat(found(s, "q", "avstrija")).containsExactly("Ana Novak");
        assertThat(found(s, "q", "Austria")).containsExactly("Ana Novak");
        assertThat(found(s, "q", "at")).containsExactly("Ana Novak");
        assertThat(found(s, "q", "nemčija")).containsExactly("Bojan Novak");
        assertThat(found(s, "q", "zzzz")).isEmpty();
    }

    @Test
    @Tag("FR-013-03")
    void filtersByCompanyAndCountryAndCombinesThemWithOthers() throws Exception {
        Scenario s = scenario();
        create(s, Who.EDITOR, withFields("Ana", "Acme d.o.o.", "AT"));
        create(s, Who.EDITOR, withFields("Bojan", "Acme", "DE"));
        create(s, Who.EDITOR, withFields("Cene", "Beta", "AT"));

        assertThat(found(s, "f", "company:acme")).containsExactly("Ana Novak", "Bojan Novak");
        assertThat(found(s, "f", "country:AT")).containsExactly("Ana Novak", "Cene Novak");
        assertThat(found(s, "f", "country:austria", "f", "company:acme")).containsExactly("Ana Novak");
        assertThat(found(s, "f", "country:xyz")).isEmpty();
    }

    @ParameterizedTest(name = "razvrščanje po {0} ni podprto")
    @ValueSource(strings = {"company", "country"})
    @Tag("FR-013-03")
    void sortingByTheNewFieldsIsRejected(String field) throws Exception {
        Scenario s = scenario();

        HttpResponse<String> response = get(
                ContactSearchClient.listPath(s.group()) + ContactSearchClient.query("sort", field),
                s.token(Who.VIEWER));

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(ContactSearchClient.errors(response.body())).containsEntry("sort", "UNKNOWN_FIELD");
    }

    @Test
    @Tag("FR-013-05")
    void bulkUpdateSetsAndClearsCompanyAndCountryAtomicallyWithOneEntry() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = create(s, Who.EDITOR, withFields("Ana", "Acme", "AT"));
        Map<String, Object> b = create(s, Who.EDITOR, withFields("Bojan", null, null));
        int entries = audit.count(s.group());
        Map<String, Object> request = new java.util.LinkedHashMap<>();
        request.put("contactIds", List.of(a.get("id"), b.get("id")));
        request.put(
                "attributes",
                List.of(Map.of("field", "country", "value", "DE"), Map.of("field", "company", "value", "")));

        HttpResponse<String> response =
                post("/api/groups/" + s.group() + "/contacts/bulk-update", s.token(Who.EDITOR), body(request));

        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        assertThat(contacts.companyAndCountry(idOf(a)))
                .containsEntry("company", null)
                .containsEntry("country", "DE");
        assertThat(contacts.companyAndCountry(idOf(b)))
                .containsEntry("company", null)
                .containsEntry("country", "DE");
        assertThat(audit.count(s.group())).isEqualTo(entries + 1);
    }

    @Test
    @Tag("FR-013-05")
    void bulkUpdateWithAnInvalidCountryChangesNothing() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = create(s, Who.EDITOR, withFields("Ana", "Acme", "AT"));
        int entries = audit.count(s.group());
        Map<String, Object> request = new java.util.LinkedHashMap<>();
        request.put("contactIds", List.of(a.get("id")));
        request.put("attributes", List.of(Map.of("field", "country", "value", "Slovenija")));

        HttpResponse<String> response =
                post("/api/groups/" + s.group() + "/contacts/bulk-update", s.token(Who.EDITOR), body(request));

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(response.body())).containsEntry("attributes[0].value", "INVALID_VALUE");
        assertThat(contacts.companyAndCountry(idOf(a))).containsEntry("country", "AT");
        assertThat(audit.count(s.group())).isEqualTo(entries);
    }

    @Test
    @Tag("FR-013-07")
    void theAuditTrailShowsCompanyAndCountryAsFieldsAndRollbackRestoresThem() throws Exception {
        Scenario s = scenario();
        Map<String, Object> created = create(s, Who.EDITOR, withFields("Janez", "Acme", "SI"));
        UUID id = idOf(created);
        UUID afterCreate = audit.latestEntryId(s.group());
        Map<String, Object> values = valuesWithFields(created);
        values.put("country", "AT");
        values.put("company", null);
        update(s, Who.EDITOR, id, values, versionOf(created));
        UUID updateEntry = audit.latestEntryId(s.group());

        HttpResponse<String> changes = get(entryPath(s.group(), updateEntry) + "/changes", s.token(Who.VIEWER));
        List<Map<String, Object>> fields =
                asObjects(asObjects(json(changes.body()).get("items")).get(0).get("fields"));

        assertThat(fields).extracting(f -> f.get("field")).containsExactly("COUNTRY", "COMPANY");
        assertThat(fields.get(0)).containsEntry("before", "SI").containsEntry("after", "AT");
        assertThat(fields.get(1)).containsEntry("before", "Acme").containsEntry("after", null);

        rollbackToEntry(s, afterCreate);

        assertThat(contacts.companyAndCountry(id))
                .containsEntry("company", "Acme")
                .containsEntry("country", "SI");
    }

    @Test
    @Tag("FR-013-07")
    @Tag("FR-013-02")
    void rollbackToAStateWithoutTheFieldsClearsThemAndAnOldSnapshotReadsAsEmpty() throws Exception {
        Scenario s = scenario();
        // Posnetek v sledi iz časa pred 013: jsonb brez ključev company in country.
        UUID id = contacts.insert(s.group(), s.id(Who.OWNER), "Stari", "Kontakt");
        Map<String, Object> detail =
                json(get(contactPath(s.group(), id), s.token(Who.EDITOR)).body());
        Map<String, Object> values = valuesWithFields(detail);
        values.put("company", "Acme");
        values.put("country", "SI");
        update(s, Who.EDITOR, id, values, versionOf(detail));

        List<UUID> entries =
                audit.entries(s.group()).stream().map(e -> (UUID) e.get("id")).toList();
        // Edini vnos je urejanje; njegov posnetek »prej« nima polj. Začetno stanje je stanje brez njih.
        HttpResponse<String> response = rollbackInitial(s, Who.ADMIN, entries.get(0));

        assertThat(response.statusCode()).as(response.body()).isEqualTo(201);
        assertThat(contacts.companyAndCountry(id))
                .containsEntry("company", null)
                .containsEntry("country", null);
    }

    @Test
    @Tag("FR-013-01")
    void viewerCannotWriteTheNewFields() throws Exception {
        Scenario s = scenario();

        HttpResponse<String> response =
                post(contactsPath(s.group()), s.token(Who.VIEWER), body(withFields("Janez", "Acme", "SI")));

        assertThat(response.statusCode()).isEqualTo(403);
        assertThat(contacts.count(s.group())).isZero();
    }

    @Test
    @Tag("FR-013-01")
    @Tag("FR-013-05")
    void writingTheNewFieldsFollowsTheAccessRulesOfEveryWriteEndpoint() throws Exception {
        Scenario s = scenario();
        Map<String, Object> created = create(s, Who.EDITOR, withFields("Janez", "Acme", "AT"));
        String contact = contactPath(s.group(), created.get("id"));
        Map<String, Object> change = withFields("Janez", "Beta", "DE");
        change.put("version", versionOf(created));
        Map<String, Object> bulk = new java.util.LinkedHashMap<>();
        bulk.put("contactIds", List.of(created.get("id")));
        bulk.put("attributes", List.of(Map.of("field", "country", "value", "DE")));
        String bulkPath = "/api/groups/" + s.group() + "/contacts/bulk-update";
        String newBody = body(withFields("Nov", "Beta", "DE"));

        // 401: brez žetona
        assertThat(Http.send("POST", url(contactsPath(s.group())), Map.of("Content-Type", "application/json"), newBody)
                        .statusCode())
                .isEqualTo(401);
        // 404: nečlan; 403: bralec (PUT in množično)
        assertThat(post(contactsPath(s.group()), s.token(Who.NON_MEMBER), newBody)
                        .statusCode())
                .isEqualTo(404);
        assertThat(put(contact, s.token(Who.NON_MEMBER), body(change)).statusCode())
                .isEqualTo(404);
        assertThat(put(contact, s.token(Who.VIEWER), body(change)).statusCode()).isEqualTo(403);
        assertThat(post(bulkPath, s.token(Who.VIEWER), body(bulk)).statusCode()).isEqualTo(403);
        assertThat(contacts.companyAndCountry(idOf(created)))
                .containsEntry("company", "Acme")
                .containsEntry("country", "AT");

        // 409 VERSION_CONFLICT: zastarela verzija z drugačnimi vrednostmi novih polj
        Map<String, Object> stale = new java.util.LinkedHashMap<>(change);
        stale.put("version", versionOf(created) + 5);
        HttpResponse<String> conflict = put(contact, s.token(Who.EDITOR), body(stale));
        assertThat(conflict.statusCode()).isEqualTo(409);
        assertThat(json(conflict.body())).containsEntry("code", "VERSION_CONFLICT");
        assertThat(contacts.companyAndCountry(idOf(created))).containsEntry("company", "Acme");

        // 409 GROUP_ARCHIVED za vse tri pisalne poti, nič se ne spremeni
        groups.archive(s.group());
        for (HttpResponse<String> response : List.of(
                post(contactsPath(s.group()), s.token(Who.EDITOR), newBody),
                put(contact, s.token(Who.EDITOR), body(change)),
                post(bulkPath, s.token(Who.EDITOR), body(bulk)))) {
            assertThat(response.statusCode()).as(response.body()).isEqualTo(409);
            assertThat(json(response.body())).containsEntry("code", "GROUP_ARCHIVED");
        }
        assertThat(contacts.count(s.group())).isEqualTo(1);
        assertThat(contacts.companyAndCountry(idOf(created)))
                .containsEntry("company", "Acme")
                .containsEntry("country", "AT");
    }

    @Test
    @Tag("FR-013-05")
    void bulkUpdateWithACompanyOfTwoHundredAndOneCharactersIsTooLongAndChangesNothing() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = create(s, Who.EDITOR, withFields("Ana", "Acme", "AT"));
        int entries = audit.count(s.group());
        Map<String, Object> request = new java.util.LinkedHashMap<>();
        request.put("contactIds", List.of(a.get("id")));
        request.put("attributes", List.of(Map.of("field", "company", "value", "p".repeat(201))));

        HttpResponse<String> response =
                post("/api/groups/" + s.group() + "/contacts/bulk-update", s.token(Who.EDITOR), body(request));

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(response.body())).containsEntry("attributes[0].value", "TOO_LONG");
        assertThat(contacts.companyAndCountry(idOf(a))).containsEntry("company", "Acme");
        assertThat(audit.count(s.group())).isEqualTo(entries);
    }
}
