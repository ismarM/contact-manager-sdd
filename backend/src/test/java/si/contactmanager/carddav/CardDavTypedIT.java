package si.contactmanager.carddav;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * CardDAV s tipi (016, FR-016-18, -25; matrika izolacije vrstice {@code PROPFIND, REPORT, GET /dav/addressbooks/…}):
 * vizitka je ista kot pri izvozu vCard (kanonične vrednosti, {@code ADR} po delih, tipizirani atributi z oznako
 * ključa); brez ali z napačnim geslom 401, nečlan 404, vsi člani berejo (207/200) tudi v arhivirani skupini.
 */
@Tag("FR-016-18")
@Tag("FR-016-25")
class CardDavTypedIT extends DavApiTest {

    private Map<String, Object> typedContact(Scenario s) throws Exception {
        Map<String, Object> input = input("Ana", "Kos");
        input.put("country", "SI");
        input.put(
                "addressParts", Map.of("street", "Trg 1", "postalCode", "1000", "city", "Ljubljana", "country", "SI"));
        Map<String, Object> phone = new LinkedHashMap<>();
        phone.put("key", "Služba");
        phone.put("type", "PHONE");
        phone.put("value", "01 234 5678");
        Map<String, Object> web = new LinkedHashMap<>();
        web.put("key", "Splet");
        web.put("type", "URL");
        web.put("value", "https://primer.si");
        input.put("attributes", List.of(phone, web));
        return createViaApi(s, input);
    }

    static Stream<Arguments> members() {
        return Stream.of(Who.VIEWER, Who.EDITOR, Who.ADMIN, Who.OWNER)
                .flatMap(who -> Stream.of(Arguments.of(who, false), Arguments.of(who, true)));
    }

    @ParameterizedTest(name = "{0}, arhivirana {1}")
    @MethodSource("members")
    void everyMemberReadsTheCanonicalTypedCard(Who who, boolean archived) throws Exception {
        Scenario s = scenario();
        String id = (String) typedContact(s).get("id");
        if (archived) {
            groups.archive(s.group());
        }
        Credentials credentials = appPassword(s.users().get(who));
        // Prikazna shema bralca ne vpliva na CardDAV (FR-016-18).
        put("/api/me/preferences", s.token(who), "{\"language\":\"sl\",\"theme\":null,\"phoneFormat\":\"NATIONAL\"}");

        HttpResponse<String> propfind = propfind(book(s.group()), credentials, "1");
        HttpResponse<String> get = dav("GET", card(s.group(), id), credentials, null, Map.of());
        HttpResponse<String> multiget =
                report(book(s.group()), credentials, CardDavIsolationMatrixSecurityIT.multiget(s.group(), id));

        assertThat(propfind.statusCode()).isEqualTo(207);
        assertThat(get.statusCode()).isEqualTo(200);
        assertThat(multiget.statusCode()).isEqualTo(207);
        for (String vcard : List.of(get.body(), multiget.body())) {
            assertThat(vcard.replace("\r\n ", ""))
                    .contains("ADR;X-CM-PARTS=1;X-CM-PC=SI;X-CM-CC=SI:;;Trg 1;Ljubljana;;1000;Slovenija")
                    .contains("attr1.TEL:+38612345678", "attr1.X-ABLabel:Služba", "attr1.X-CM-KEY:Služba")
                    .contains("attr2.URL:https://primer.si", "attr2.X-CM-KEY:Splet");
        }
    }

    @Test
    void withoutOrWithAWrongPasswordIs401AndANonMemberIs404() throws Exception {
        Scenario s = scenario();
        String id = (String) typedContact(s).get("id");
        Credentials valid = appPassword(s.users().get(Who.VIEWER));
        Credentials wrong = new Credentials(valid.email(), "napacno-geslo");
        Credentials stranger = appPassword(s.users().get(Who.NON_MEMBER));

        for (Credentials credentials : new Credentials[] {null, wrong}) {
            assertThat(propfind(book(s.group()), credentials, "1").statusCode()).isEqualTo(401);
            assertThat(dav("GET", card(s.group(), id), credentials, null, Map.of())
                            .statusCode())
                    .isEqualTo(401);
            assertThat(report(book(s.group()), credentials, syncCollection("")).statusCode())
                    .isEqualTo(401);
        }
        for (HttpResponse<String> response : List.of(
                propfind(book(s.group()), stranger, "1"),
                dav("GET", card(s.group(), id), stranger, null, Map.of()),
                report(book(s.group()), stranger, CardDavIsolationMatrixSecurityIT.multiget(s.group(), id)))) {
            assertThat(response.statusCode()).isEqualTo(404);
            assertThat(response.body()).doesNotContain("Ana Kos", "+38612345678");
        }
    }

    @Test
    void aTypedContactOfAnotherGroupIsNotFoundThroughTheBookOfAnotherGroup() throws Exception {
        Scenario s = scenario();
        UUID foreign = UUID.fromString((String) typedContact(s).get("id"));
        UUID other = groups.createGroup(s.id(Who.OWNER), "Skupina B");
        Credentials owner = appPassword(s.users().get(Who.OWNER));

        HttpResponse<String> response = dav("GET", card(other, foreign), owner, null, Map.of());

        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(response.body()).doesNotContain("Ana", "Trg 1");
    }
}
