package si.contactmanager.carddav;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/**
 * Strežnik CardDAV (FR-014-22, -23, -27; contracts/carddav.md): odkrivanje principal → dom → imeniki, vizitke z ETag,
 * postopna sinhronizacija ({@code sync-collection}), {@code addressbook-multiget}, žetoni z jezikom in verzijo skupine;
 * branje ne ustvari vnosa sledi.
 */
@Tag("FR-014-22")
@Tag("FR-014-23")
class CardDavIT extends DavApiTest {

    @Test
    void discoveryLeadsFromTheRootToTheAddressBooksOfTheUser() throws Exception {
        Scenario s = scenario();
        UUID archived = groups.createGroup(s.id(Who.OWNER), "Stari projekt");
        groups.archive(archived);
        UUID foreign = groups.createGroup(s.id(Who.ADMIN), "Tuja skupina");
        Credentials owner = appPassword(s.users().get(Who.OWNER));

        HttpResponse<String> wellKnown = dav("PROPFIND", "/.well-known/carddav", null, null, Map.of());
        HttpResponse<String> options = dav("OPTIONS", "/dav/", owner, null, Map.of());
        HttpResponse<String> root = propfind("/dav/", owner, "0");
        HttpResponse<String> principal = propfind("/dav/principals/me/", owner, "0");
        HttpResponse<String> home = propfind("/dav/addressbooks/", owner, "1");

        assertThat(wellKnown.statusCode()).isEqualTo(301);
        assertThat(wellKnown.headers().firstValue("Location")).contains("/dav/");
        assertThat(options.statusCode()).isEqualTo(200);
        assertThat(options.headers().firstValue("DAV"))
                .hasValueSatisfying(v -> assertThat(v).contains("addressbook"));
        assertThat(root.statusCode()).isEqualTo(207);
        assertThat(root.body()).contains("<d:current-user-principal><d:href>/dav/principals/me/</d:href>");
        assertThat(principal.body()).contains("<card:addressbook-home-set><d:href>/dav/addressbooks/</d:href>");
        assertThat(home.statusCode()).isEqualTo(207);
        assertThat(home.body())
                .contains(book(s.group()), "Projekt FERI", book(archived), "Stari projekt", "<card:addressbook/>")
                .doesNotContain(foreign.toString())
                .doesNotContain("Tuja skupina");
    }

    @Test
    void aBookListsItsCardsAndACardIsServedWithAnEtag() throws Exception {
        Scenario s = scenario();
        Map<String, Object> created = createViaApi(s, Map.of("firstName", "Ana", "lastName", "Kos", "country", "AT"));
        String id = (String) created.get("id");
        Credentials viewer = appPassword(s.users().get(Who.VIEWER));

        HttpResponse<String> listing = propfind(book(s.group()), viewer, "1");
        HttpResponse<String> vcard = dav("GET", card(s.group(), id), viewer, null, Map.of());
        String etag = vcard.headers().firstValue("ETag").orElseThrow();
        HttpResponse<String> again = dav("GET", card(s.group(), id), viewer, null, Map.of("If-None-Match", etag));

        assertThat(listing.body()).contains(card(s.group(), id), "<d:getetag>", "<cs:getctag>", "<d:sync-token>");
        assertThat(vcard.statusCode()).isEqualTo(200);
        assertThat(vcard.headers().firstValue("Content-Type"))
                .hasValueSatisfying(t -> assertThat(t).startsWith("text/vcard"));
        assertThat(vcard.body()).contains("FN:Ana Kos", "UID:urn:uuid:" + id, "Avstrija");
        assertThat(again.statusCode()).isEqualTo(304);
    }

    @Test
    void syncCollectionReturnsOnlyChangesSinceTheToken() throws Exception {
        Scenario s = scenario();
        String kept = (String) createViaApi(s, input("Ostane", "Enak")).get("id");
        Map<String, Object> changed = createViaApi(s, input("Bo", "Spremenjen"));
        String removed = (String) createViaApi(s, input("Bo", "Izbrisan")).get("id");
        Credentials editor = appPassword(s.users().get(Who.EDITOR));
        HttpResponse<String> initial = report(book(s.group()), editor, syncCollection(""));
        String token = element(initial.body(), "d:sync-token");

        put(
                contactPath(s.group(), changed.get("id")),
                s.token(Who.EDITOR),
                body(withVersion(input("Je", "Spremenjen"), ((Number) changed.get("version")).longValue())));
        delete(contactPath(s.group(), removed) + "?version=0", s.token(Who.EDITOR));
        String added = (String) createViaApi(s, input("Nov", "Kontakt")).get("id");
        HttpResponse<String> delta = report(book(s.group()), editor, syncCollection(token));

        assertThat(initial.statusCode()).isEqualTo(207);
        assertThat(initial.body()).contains(kept, (String) changed.get("id"), removed);
        assertThat(delta.statusCode()).isEqualTo(207);
        assertThat(delta.body())
                .contains(card(s.group(), changed.get("id")), card(s.group(), added))
                .doesNotContain(kept);
        assertThat(delta.body())
                .contains("<d:href>" + card(s.group(), removed) + "</d:href><d:status>HTTP/1.1 404 Not Found");
        assertThat(element(delta.body(), "d:sync-token")).isNotEqualTo(token);
        assertThat(report(book(s.group()), editor, syncCollection("urn:contactmanager:sync:sl:999999"))
                        .statusCode())
                .isEqualTo(403);
        assertThat(report(book(s.group()), editor, syncCollection("nekaj")).statusCode())
                .isEqualTo(403);
    }

    @Test
    void multigetReturnsAddressDataAndMissingHrefsAsNotFound() throws Exception {
        Scenario s = scenario();
        String id = (String) createViaApi(s, input("Ana", "Kos")).get("id");
        Credentials viewer = appPassword(s.users().get(Who.VIEWER));
        String body = "<?xml version=\"1.0\"?><card:addressbook-multiget xmlns:d=\"DAV:\""
                + " xmlns:card=\"urn:ietf:params:xml:ns:carddav\"><d:prop><d:getetag/><card:address-data/></d:prop>"
                + "<d:href>" + card(s.group(), id) + "</d:href><d:href>" + card(s.group(), UUID.randomUUID())
                + "</d:href></card:addressbook-multiget>";

        HttpResponse<String> response = report(book(s.group()), viewer, body);

        assertThat(response.statusCode()).isEqualTo(207);
        assertThat(response.body()).contains("<card:address-data>BEGIN:VCARD", "FN:Ana Kos", "404 Not Found");
    }

    @Test
    void ctagFollowsTheGroupTitleAndTheLanguageChangesEtagsAndTokens() throws Exception {
        Scenario s = scenario();
        String id = (String) createViaApi(s, input("Ana", "Kos")).get("id");
        Credentials viewer = appPassword(s.users().get(Who.VIEWER));
        String before = propfind(book(s.group()), viewer, "0").body();
        String token = element(before, "d:sync-token");
        String etag = dav("GET", card(s.group(), id), viewer, null, Map.of())
                .headers()
                .firstValue("ETag")
                .orElseThrow();

        jdbc.update("update contact_group set title = 'Nov naslov', version = version + 1 where id = ?", s.group());
        String renamed = propfind(book(s.group()), viewer, "0").body();
        jdbc.update("update app_user set language = 'en' where id = ?", s.id(Who.VIEWER));
        String english = dav("GET", card(s.group(), id), viewer, null, Map.of())
                .headers()
                .firstValue("ETag")
                .orElseThrow();

        assertThat(element(renamed, "cs:getctag")).isNotEqualTo(element(before, "cs:getctag"));
        assertThat(renamed).contains("Nov naslov");
        assertThat(english).isNotEqualTo(etag);
        assertThat(report(book(s.group()), viewer, syncCollection(token)).statusCode())
                .isEqualTo(403);
    }

    @Test
    void readingCreatesNoAuditEntryAndInfiniteDepthIsRefused() throws Exception {
        Scenario s = scenario();
        createViaApi(s, input("Ana", "Kos"));
        Credentials viewer = appPassword(s.users().get(Who.VIEWER));
        Integer before =
                jdbc.queryForObject("select count(*) from audit_entry where group_id = ?", Integer.class, s.group());

        propfind(book(s.group()), viewer, "1");
        report(book(s.group()), viewer, syncCollection(""));
        HttpResponse<String> infinite = propfind("/dav/addressbooks/", viewer, "infinity");

        assertThat(jdbc.queryForObject("select count(*) from audit_entry where group_id = ?", Integer.class, s.group()))
                .isEqualTo(before);
        assertThat(infinite.statusCode()).isEqualTo(403);
        assertThat(infinite.body()).contains("propfind-finite-depth");
    }

    @Test
    void anExternalEntityIsNotResolved() throws Exception {
        Scenario s = scenario();
        Credentials viewer = appPassword(s.users().get(Who.VIEWER));
        String xxe = "<?xml version=\"1.0\"?><!DOCTYPE d [<!ENTITY x SYSTEM \"file:///etc/passwd\">]>"
                + "<d:propfind xmlns:d=\"DAV:\"><d:prop><d:displayname>&x;</d:displayname></d:prop></d:propfind>";

        HttpResponse<String> response = dav("PROPFIND", "/dav/", viewer, xxe, Map.of("Depth", "0"));

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(response.body()).doesNotContain("root:");
    }
}
