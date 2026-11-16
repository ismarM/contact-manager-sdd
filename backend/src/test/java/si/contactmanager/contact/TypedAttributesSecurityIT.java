package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.MethodSource;
import si.contactmanager.contact.support.ImportApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import si.contactmanager.support.Http;
import si.contactmanager.support.Tokens;

/**
 * Matrika izolacije endpointov tipiziranih atributov (016; konstitucija III in §3.1; FR-016-01, -02, -05, -06, -24,
 * -25; uvoz, izvoz in vizitka kontakta):
 * seznam ključev, sprememba tipa, ustvarjanje in urejanje kontakta s tipom, predlogi ključev s tipom in množično
 * nastavljanje atributa × akter × stanje skupine, nato vir druge skupine. Neprijavljen 401, nečlan 404 brez telesa,
 * bralec pri pisanju in predlogih 403, urednik in višje uspeh ali 409 {@code GROUP_ARCHIVED} (§2.2).
 */
@Tag("FR-016-01")
@Tag("FR-016-02")
@Tag("FR-016-05")
@Tag("FR-016-06")
@Tag("FR-016-24")
@Tag("FR-016-25")
class TypedAttributesSecurityIT extends ImportApiTest {

    enum Actor {
        NO_TOKEN,
        MALFORMED_TOKEN,
        EXPIRED_TOKEN,
        NON_MEMBER,
        VIEWER,
        EDITOR,
        ADMIN,
        OWNER
    }

    enum Endpoint {
        KEYS,
        CHANGE_TYPE,
        CREATE,
        UPDATE,
        SUGGEST_KEYS,
        BULK_UPDATE,
        SEARCH,
        READ,
        DUPLICATES,
        COMPARE,
        MERGE,
        IMPORT_PARSE,
        IMPORT_PREVIEW,
        IMPORT_COMMIT,
        EXPORT_XLSX,
        EXPORT_VCARD,
        CONTACT_VCARD
    }

    record Expected(int status, Map<String, Object> body) {}

    /** Bere že VIEWER, tudi v arhivirani skupini. */
    static boolean viewerReads(Endpoint endpoint) {
        return endpoint == Endpoint.KEYS
                || endpoint == Endpoint.SEARCH
                || endpoint == Endpoint.READ
                || endpoint == Endpoint.EXPORT_XLSX
                || endpoint == Endpoint.EXPORT_VCARD
                || endpoint == Endpoint.CONTACT_VCARD;
    }

    /** Samo urednik in višje, a brez zapisa: razčlenitev datoteke in predogled uvoza (014). */
    static boolean editorReadOnly(Endpoint endpoint) {
        return endpoint == Endpoint.IMPORT_PARSE || endpoint == Endpoint.IMPORT_PREVIEW;
    }

    static boolean writes(Endpoint endpoint) {
        return !viewerReads(endpoint)
                && endpoint != Endpoint.SUGGEST_KEYS
                && endpoint != Endpoint.DUPLICATES
                && endpoint != Endpoint.COMPARE
                && !editorReadOnly(endpoint);
    }

    /** Arhivirana skupina zavrne pisanje ter iskanje dvojnikov in primerjavo (011, §2.2). */
    static boolean archivedRefused(Endpoint endpoint) {
        return writes(endpoint)
                || editorReadOnly(endpoint)
                || endpoint == Endpoint.DUPLICATES
                || endpoint == Endpoint.COMPARE;
    }

    static Expected expected(Endpoint endpoint, Actor actor, boolean archived) {
        return switch (actor) {
            case NO_TOKEN, MALFORMED_TOKEN, EXPIRED_TOKEN -> new Expected(401, Map.of("code", "UNAUTHENTICATED"));
            case NON_MEMBER -> new Expected(404, null);
            case VIEWER ->
                viewerReads(endpoint) ? new Expected(200, null) : new Expected(403, Map.of("code", "FORBIDDEN"));
            case EDITOR, ADMIN, OWNER -> {
                if (archivedRefused(endpoint) && archived) {
                    yield new Expected(409, Map.of("code", "GROUP_ARCHIVED"));
                }
                yield new Expected(endpoint == Endpoint.CREATE || endpoint == Endpoint.IMPORT_COMMIT ? 201 : 200, null);
            }
        };
    }

    static Stream<Arguments> matrix() {
        List<Arguments> rows = new ArrayList<>();
        for (Endpoint endpoint : Endpoint.values()) {
            for (boolean archived : new boolean[] {false, true}) {
                for (Actor actor : Actor.values()) {
                    rows.add(Arguments.of(endpoint, actor, archived));
                }
            }
        }
        return rows.stream();
    }

    private static Map<String, String> headers(Actor actor, Map<Who, SignedIn> users) {
        return switch (actor) {
            case NO_TOKEN -> Map.of();
            case MALFORMED_TOKEN -> Map.of("Authorization", "Bearer not-a-jwt");
            case EXPIRED_TOKEN ->
                Http.bearer(Tokens.withClaims(users.get(Who.OWNER).idToken(), claims -> {
                    claims.put("iat", Tokens.epochSeconds(-7200));
                    claims.put("auth_time", Tokens.epochSeconds(-7200));
                    claims.put("exp", Tokens.epochSeconds(-3600));
                }));
            default -> Http.bearer(users.get(Who.valueOf(actor.name())).idToken());
        };
    }

    private static Map<String, Object> typedInput(String first) {
        Map<String, Object> input = input(first, "Kontakt");
        input.put("attributes", List.of(Map.of("key", "mobilni", "type", "PHONE", "value", "041 123 456")));
        return input;
    }

    /** Kandidat ali kontakt uvoza s tipiziranim atributom (FR-016-24). */
    private static Map<String, Object> importRow() {
        Map<String, Object> row = input("Uvožen", "Kontakt");
        row.put("attributes", List.of(Map.of("key", "mobilni", "type", "PHONE", "value", "041 555 666")));
        return row;
    }

    private static String bearerToken(Map<String, String> headers) {
        String authorization = headers.get("Authorization");
        return authorization == null ? null : authorization.substring("Bearer ".length());
    }

    private HttpResponse<String> send(Endpoint endpoint, UUID group, UUID contact, Map<String, String> headers)
            throws Exception {
        String base = "/api/groups/" + group;
        return switch (endpoint) {
            case IMPORT_PARSE ->
                parse(
                        bearerToken(headers),
                        group,
                        xlsx(List.of(List.of("Ime", "Priimek"), List.of("Ana", "Kos"))),
                        "XLSX",
                        "sl");
            case IMPORT_PREVIEW ->
                Http.send(
                        "POST",
                        url(base + "/imports/preview"),
                        headers,
                        body(Map.of("candidates", List.of(importRow()))));
            case IMPORT_COMMIT ->
                Http.send(
                        "POST",
                        url(base + "/imports"),
                        headers,
                        body(Map.of("source", "XLSX", "contacts", List.of(importRow()))));
            case EXPORT_XLSX ->
                Http.send(
                        "POST",
                        url(base + "/contacts/export"),
                        headers,
                        body(Map.of("contactIds", List.of(contact), "language", "sl")));
            case EXPORT_VCARD ->
                Http.send(
                        "POST",
                        url(base + "/contacts/export/vcard"),
                        headers,
                        body(Map.of("contactIds", List.of(contact), "language", "sl")));
            case CONTACT_VCARD -> Http.send("GET", url(base + "/contacts/" + contact + "/vcard"), headers);
            case KEYS -> Http.send("GET", url(base + "/attribute-keys"), headers);
            case CHANGE_TYPE ->
                Http.send(
                        "POST",
                        url(base + "/attribute-keys/change-type"),
                        headers,
                        body(Map.of("key", "pošta", "type", "EMAIL", "version", 0)));
            case CREATE -> Http.send("POST", url(base + "/contacts"), headers, body(typedInput("Nov")));
            case UPDATE ->
                Http.send(
                        "PUT",
                        url(base + "/contacts/" + contact),
                        headers,
                        body(withVersion(
                                Map.of(
                                        "firstName",
                                        "Prepisan",
                                        "attributes",
                                        List.of(Map.of("key", "pošta", "value", "b@primer.si"))),
                                0)));
            case SUGGEST_KEYS -> Http.send("GET", url(base + "/suggestions?type=key"), headers);
            case BULK_UPDATE ->
                Http.send(
                        "POST",
                        url(base + "/contacts/bulk-update"),
                        headers,
                        body(Map.of(
                                "contactIds",
                                List.of(contact),
                                "attributes",
                                List.of(Map.of("field", "custom", "key", "pošta", "value", "c@primer.si")))));
            case SEARCH -> Http.send("GET", url(base + "/contacts?q=041+123"), headers);
            case READ -> Http.send("GET", url(base + "/contacts/" + contact), headers);
            case DUPLICATES -> Http.send("GET", url(base + "/duplicates?category=phone"), headers);
            case COMPARE -> {
                UUID partner = partner(group, contact);
                yield Http.send("GET", url(base + "/duplicates/compare?ids=" + contact + "," + partner), headers);
            }
            case MERGE -> {
                UUID partner = partner(group, contact);
                yield Http.send(
                        "POST",
                        url(base + "/duplicates/merge"),
                        headers,
                        body(Map.of(
                                "contacts",
                                List.of(target(contact), target(partner)),
                                "result",
                                Map.of(
                                        "firstName",
                                        "Janez",
                                        "lastName",
                                        "Novak",
                                        "phone",
                                        "041 123 456",
                                        "attributes",
                                        List.of(Map.of("key", "pošta", "value", "a@primer.si"))))));
            }
        };
    }

    /** Drug kontakt skupine {@code group} (za primerjavo in združitev). */
    private UUID partner(UUID group, UUID contact) {
        return jdbc.queryForObject(
                "select id from contact where group_id = ? and id <> ? order by id limit 1",
                UUID.class,
                group,
                contact);
    }

    private Map<String, Object> target(UUID contact) {
        return Map.of(
                "id",
                contact.toString(),
                "version",
                jdbc.queryForObject("select version from contact where id = ?", Long.class, contact));
    }

    /** Stanje, ki ga zavrnjen zahtevek ne sme spremeniti: ključi s tipi, atributi, verzije in vnosi sledi. */
    private Map<String, Object> groupState(UUID group) {
        return Map.of(
                "keys",
                jdbc.queryForList(
                        "select key_norm, type, version from attribute_key where group_id = ? order by key_norm",
                        group),
                "attributes",
                jdbc.queryForList(
                        "select a.key, a.value from contact_attribute a join contact c on c.id = a.contact_id"
                                + " where c.group_id = ? order by a.key, a.value",
                        group),
                "contacts",
                jdbc.queryForList("select id, version from contact where group_id = ? order by id", group),
                "entries",
                jdbc.queryForObject("select count(*) from audit_entry where group_id = ?", Long.class, group));
    }

    private UUID fixture(Scenario s) {
        UUID contact = contacts.insert(s.group(), s.id(Who.OWNER), "Janez", "Novak");
        contacts.addAttribute(contact, 0, "pošta", "a@primer.si");
        jdbc.update("insert into attribute_key (group_id, key_norm) values (?, 'pošta')", s.group());
        UUID second = contacts.insert(s.group(), s.id(Who.OWNER), "Janez", "Novak");
        jdbc.update("update contact set phone = '+38641123456' where id in (?, ?)", contact, second);
        return contact;
    }

    @ParameterizedTest(name = "{0} {2} skupina, {1}")
    @MethodSource("matrix")
    void isolationMatrix(Endpoint endpoint, Actor actor, boolean archived) throws Exception {
        Scenario s = scenario();
        UUID contact = fixture(s);
        if (archived) {
            groups.archive(s.group());
        }
        Map<String, Object> before = groupState(s.group());

        HttpResponse<String> response = send(endpoint, s.group(), contact, headers(actor, s.users()));

        Expected expected = expected(endpoint, actor, archived);
        assertThat(response.statusCode()).isEqualTo(expected.status());
        if (expected.body() != null) {
            assertThat(json(response.body())).isEqualTo(expected.body());
        } else if (expected.status() == 404) {
            assertThat(response.body()).isEmpty();
        }
        boolean mutated = expected.status() >= 200 && expected.status() < 300 && writes(endpoint);
        if (!mutated) {
            assertThat(groupState(s.group())).isEqualTo(before);
        }
    }

    @ParameterizedTest(name = "viri druge skupine, {0}")
    @EnumSource(
            value = Actor.class,
            names = {"VIEWER", "EDITOR", "ADMIN", "OWNER"})
    void resourcesOfAnotherGroupAreNotFoundAndKeysAreNotVisible(Actor actor) throws Exception {
        Scenario s = scenario();
        Who who = Who.valueOf(actor.name());
        UUID other = groups.createGroup(s.id(Who.OWNER), "Skupina B");
        if (who != Who.OWNER) {
            groups.addMember(other, s.id(who), who.name());
        }
        UUID foreign = contacts.insert(other, s.id(Who.OWNER), "Tuj", "Kontakt");
        contacts.addAttribute(foreign, 0, "pošta", "tuj@primer.si");
        jdbc.update("update contact set phone = '+38641123456' where id = ?", foreign);
        jdbc.update("insert into attribute_key (group_id, key_norm) values (?, 'pošta')", other);
        UUID own = fixture(s);
        Map<String, String> headers = Http.bearer(s.token(who));

        HttpResponse<String> update = send(Endpoint.UPDATE, s.group(), foreign, headers);
        HttpResponse<String> bulk = send(Endpoint.BULK_UPDATE, s.group(), foreign, headers);
        HttpResponse<String> keys = send(Endpoint.KEYS, s.group(), own, headers);
        HttpResponse<String> read = send(Endpoint.READ, s.group(), foreign, headers);
        HttpResponse<String> search = send(Endpoint.SEARCH, s.group(), own, headers);

        assertThat(update.statusCode()).isEqualTo(404);
        assertThat(update.body()).isEmpty();
        assertThat(bulk.statusCode()).isEqualTo(404);
        assertThat(read.statusCode()).isEqualTo(404);
        assertThat(read.body()).isEmpty();
        // Iskanje ne razkrije kontaktov druge skupine (FR-016-10), čeprav ima enak telefon.
        assertThat(search.statusCode()).isEqualTo(200);
        assertThat(asObjects(json(search.body()).get("items")))
                .extracting(row -> row.get("id"))
                .doesNotContain(foreign.toString());
        if (who != Who.VIEWER) {
            HttpResponse<String> compare = send(Endpoint.COMPARE, s.group(), foreign, headers);
            HttpResponse<String> merge = send(Endpoint.MERGE, s.group(), foreign, headers);
            assertThat(compare.statusCode()).isEqualTo(404);
            assertThat(merge.statusCode()).isEqualTo(404);
        }
        assertThat(keys.statusCode()).isEqualTo(200);
        // Seznam ključev skupine A šteje samo njene kontakte (en kontakt), ne tujega.
        assertThat(asObjects(json(keys.body()).get("items")))
                .containsExactly(Map.of("key", "pošta", "type", "OTHER", "contactCount", 1, "version", 0));
        // Zahtevek v skupini A ne vpliva na ključ ali kontakt skupine B.
        if (who != Who.VIEWER) {
            HttpResponse<String> change = send(Endpoint.CHANGE_TYPE, other, foreign, headers);
            assertThat(change.statusCode()).isEqualTo(200);
            assertThat(jdbc.queryForObject(
                            "select type from attribute_key where group_id = ? and key_norm = 'pošta'",
                            String.class,
                            s.group()))
                    .isEqualTo("OTHER");
        }
        assertThat(contacts.attributesOf(foreign)).containsExactly(Map.of("key", "pošta", "value", "tuj@primer.si"));
        // Izvoz in vizitka kontakta druge skupine: 404 brez telesa (FR-016-25).
        for (Endpoint endpoint : List.of(Endpoint.EXPORT_XLSX, Endpoint.EXPORT_VCARD, Endpoint.CONTACT_VCARD)) {
            HttpResponse<String> exported = send(endpoint, s.group(), foreign, headers);
            assertThat(exported.statusCode()).as(endpoint.name()).isEqualTo(404);
            assertThat(exported.body()).isEmpty();
        }
        // Tipiziran uvoz v skupino A ne zapiše ključa v skupino B (FR-016-24).
        if (who != Who.VIEWER) {
            assertThat(send(Endpoint.IMPORT_COMMIT, s.group(), own, headers).statusCode())
                    .isEqualTo(201);
            assertThat(jdbc.queryForObject(
                            "select count(*) from attribute_key where group_id = ? and key_norm = 'mobilni'",
                            Long.class,
                            other))
                    .isZero();
        }
    }

    @Test
    void changeTypeRefusesAKeyThatExistsOnlyInAnotherGroupWithoutTouchingIt() throws Exception {
        Scenario s = scenario();
        UUID other = groups.createGroup(s.id(Who.OWNER), "Skupina B");
        UUID foreign = contacts.insert(other, s.id(Who.OWNER), "Tuj", "Kontakt");
        contacts.addAttribute(foreign, 0, "tuji", "x");
        jdbc.update("insert into attribute_key (group_id, key_norm) values (?, 'tuji')", other);

        HttpResponse<String> response = post(
                "/api/groups/" + s.group() + "/attribute-keys/change-type",
                s.token(Who.EDITOR),
                body(Map.of("key", "tuji", "type", "URL", "version", 0)));

        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(jdbc.queryForObject(
                        "select type from attribute_key where group_id = ? and key_norm = 'tuji'", String.class, other))
                .isEqualTo("OTHER");
        assertThat(contacts.attributesOf(foreign)).containsExactly(Map.of("key", "tuji", "value", "x"));
    }

    @Test
    void conflictsAndInvalidValuesLeaveEverythingUnchanged() throws Exception {
        Scenario s = scenario();
        UUID contact = fixture(s);
        contacts.addAttribute(contacts.insert(s.group(), s.id(Who.OWNER), "Ana", "Horvat"), 0, "pošta", "ni-naslov");
        String token = s.token(Who.EDITOR);
        Map<String, Object> before = groupState(s.group());
        String keysBase = "/api/groups/" + s.group() + "/attribute-keys/change-type";

        HttpResponse<String> typeConflict =
                post(keysBase, token, body(Map.of("key", "pošta", "type", "EMAIL", "version", 0)));
        HttpResponse<String> versionConflict =
                post(keysBase, token, body(Map.of("key", "pošta", "type", "EMAIL", "version", 7)));
        HttpResponse<String> badCreate = post(
                contactsPath(s.group()),
                token,
                body(Map.of(
                        "firstName",
                        "Nov",
                        "attributes",
                        List.of(Map.of("key", "mobilni", "type", "PHONE", "value", "ni-telefon")))));
        HttpResponse<String> stale =
                put(contactPath(s.group(), contact), token, body(withVersion(input("Janez", "Novak"), 9)));
        HttpResponse<String> badBulk = post(
                "/api/groups/" + s.group() + "/contacts/bulk-update",
                token,
                body(Map.of(
                        "contactIds",
                        List.of(contact),
                        "attributes",
                        List.of(Map.of("field", "custom", "key", "datum", "type", "DATE", "value", "x")))));

        // Uvoz: vrednost, neveljavna za tip, je napaka vrstice v predogledu in zavrne potrditev (FR-016-24).
        Map<String, Object> badRow = input("Uvožen", "Kontakt");
        badRow.put("attributes", List.of(Map.of("key", "mobilni", "type", "PHONE", "value", "ni-telefon")));
        HttpResponse<String> badPreview = post(
                "/api/groups/" + s.group() + "/imports/preview", token, body(Map.of("candidates", List.of(badRow))));
        HttpResponse<String> badImport = post(
                "/api/groups/" + s.group() + "/imports",
                token,
                body(Map.of("source", "XLSX", "contacts", List.of(badRow))));

        assertThat(badPreview.statusCode()).isEqualTo(200);
        assertThat(asObjects(
                        asObjects(json(badPreview.body()).get("rows")).get(0).get("errors")))
                .containsExactly(Map.of("field", "attributes[0].value", "code", "INVALID_VALUE"));
        assertThat(badImport.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(badImport.body())).containsEntry("contacts[0].attributes[0].value", "INVALID_VALUE");
        assertThat(typeConflict.statusCode()).isEqualTo(409);
        assertThat(json(typeConflict.body())).containsEntry("code", "ATTRIBUTE_TYPE_CONFLICT");
        assertThat(versionConflict.statusCode()).isEqualTo(409);
        assertThat(json(versionConflict.body())).containsEntry("code", "VERSION_CONFLICT");
        assertThat(badCreate.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(badCreate.body())).containsEntry("attributes[0].value", "INVALID_VALUE");
        assertThat(stale.statusCode()).isEqualTo(409);
        assertThat(badBulk.statusCode()).isEqualTo(400);
        assertThat(groupState(s.group())).isEqualTo(before);
    }
}
