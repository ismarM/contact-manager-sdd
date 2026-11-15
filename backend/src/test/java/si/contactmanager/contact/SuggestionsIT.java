package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.contact.support.ContactApiTest;
import si.contactmanager.contact.support.ContactSearchClient;

/** Predlogi ključev, vrednosti, podjetij, držav in značk prek {@code GET …/suggestions} (FR-013-09 … -14, -16). */
class SuggestionsIT extends ContactApiTest {

    private static String path(UUID group, String... pairs) {
        return "/api/groups/" + group + "/suggestions" + ContactSearchClient.query(pairs);
    }

    private List<Map<String, Object>> items(Scenario s, Who who, String... pairs) throws Exception {
        HttpResponse<String> response = get(path(s.group(), pairs), s.token(who));
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        assertThat(json(response.body())).containsOnlyKeys("items");
        return asObjects(json(response.body()).get("items"));
    }

    private List<String> texts(Scenario s, String... pairs) throws Exception {
        return items(s, Who.EDITOR, pairs).stream()
                .map(i -> (String) i.get("text"))
                .toList();
    }

    private UUID contact(Scenario s, String first) {
        return contacts.insert(s.group(), s.id(Who.OWNER), first, "Test");
    }

    @Test
    @Tag("FR-013-09")
    void keysAreOrderedByNumberOfContactsMostFrequentFirstWithCounts() throws Exception {
        Scenario s = scenario();
        for (int i = 0; i < 3; i++) {
            contacts.addAttribute(contact(s, "K" + i), 0, "Kompetenca", "x");
        }
        UUID b = contact(s, "B");
        contacts.addAttribute(b, 0, "Vloga", "y");
        contacts.addAttribute(b, 1, "Projekt", "z");
        contacts.addAttribute(contact(s, "C"), 0, "Vloga", "y");

        List<Map<String, Object>> items = items(s, Who.EDITOR, "type", "key");

        assertThat(items)
                .extracting(i -> i.get("text"), i -> ((Number) i.get("count")).intValue())
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple("Kompetenca", 3),
                        org.assertj.core.groups.Tuple.tuple("Vloga", 2),
                        org.assertj.core.groups.Tuple.tuple("Projekt", 1));
    }

    @Test
    @Tag("FR-013-09")
    void keyQueryMatchesIgnoringCaseAndDiacriticsPrefixBeforeMiddle() throws Exception {
        Scenario s = scenario();
        UUID a = contact(s, "A");
        contacts.addAttribute(a, 0, "Kompetenca", "x");
        contacts.addAttribute(a, 1, "Še vloga", "x");
        contacts.addAttribute(a, 2, "Vloga", "x");
        contacts.addAttribute(contact(s, "B"), 0, "Še vloga", "x");

        // »vlog«: predpona (Vloga) pred ujemanjem v sredini (Še vloga) kljub manjši pogostosti.
        assertThat(texts(s, "type", "key", "q", "VLOG")).containsExactly("Vloga", "Še vloga");
        assertThat(texts(s, "type", "key", "q", "sev")).isEmpty();
        assertThat(texts(s, "type", "key", "q", "se v")).containsExactly("Še vloga");
        assertThat(texts(s, "type", "key", "q", "KOMPE")).containsExactly("Kompetenca");
    }

    @Test
    @Tag("FR-013-09")
    @Tag("FR-013-10")
    void aKeyThatDiffersOnlyInCaseIsOneSuggestionInTheMostFrequentForm() throws Exception {
        Scenario s = scenario();
        contacts.addAttribute(contact(s, "A"), 0, "kompetenca", "x");
        contacts.addAttribute(contact(s, "B"), 0, "Kompetenca", "x");
        contacts.addAttribute(contact(s, "C"), 0, "Kompetenca", "x");

        List<Map<String, Object>> items = items(s, Who.EDITOR, "type", "key");

        assertThat(items).hasSize(1);
        assertThat(items.get(0)).containsEntry("text", "Kompetenca").containsEntry("count", 3);
    }

    @Test
    @Tag("FR-013-10")
    void withEqualCountsTheFormOfTheOldestContactIsCanonical() throws Exception {
        Scenario s = scenario();
        UUID older = contact(s, "Starejši");
        contacts.addAttribute(older, 0, "kompetenca", "x");
        UUID newer = contact(s, "Mlajši");
        contacts.addAttribute(newer, 0, "Kompetenca", "x");
        jdbc.update("update contact set created_at = now() - interval '1 day' where id = ?", older);

        assertThat(texts(s, "type", "key")).containsExactly("kompetenca");
    }

    @Test
    @Tag("FR-013-09")
    @Tag("FR-013-08")
    void reservedNamesAreNeverSuggestedEvenWhenLegacyContactsHaveThem() throws Exception {
        Scenario s = scenario();
        UUID a = contact(s, "A");
        contacts.addAttribute(a, 0, "Država", "Slovenija");
        contacts.addAttribute(a, 1, "Company", "Acme");
        contacts.addAttribute(a, 2, "E-naslov", "x@y.si");
        contacts.addAttribute(a, 3, "Vloga", "x");

        assertThat(texts(s, "type", "key")).containsExactly("Vloga");
    }

    @Test
    @Tag("FR-013-11")
    void valuesAreOfTheGivenKeyOnlyByFrequencyAndFilteredByQuery() throws Exception {
        Scenario s = scenario();
        for (int i = 0; i < 3; i++) {
            contacts.addAttribute(contact(s, "A" + i), 0, "Kompetenca", "web dev");
        }
        UUID b = contact(s, "B");
        contacts.addAttribute(b, 0, "kompetenca", "data");
        contacts.addAttribute(b, 1, "Vloga", "vodja");

        assertThat(texts(s, "type", "value", "key", "KOMPETENCA")).containsExactly("web dev", "data");
        assertThat(texts(s, "type", "value", "key", "Kompetenca", "q", "DA")).containsExactly("data");
        assertThat(texts(s, "type", "value", "key", "neznan")).isEmpty();
        assertThat(texts(s, "type", "value", "key", "vloga")).containsExactly("vodja");
    }

    @Test
    @Tag("FR-013-12")
    void companiesAreByFrequencyAndCountriesAreCodesByFrequency() throws Exception {
        Scenario s = scenario();
        for (int i = 0; i < 3; i++) {
            UUID c = contact(s, "A" + i);
            contacts.setCompanyAndCountry(c, "Acme d.o.o.", i < 2 ? "AT" : "DE");
        }
        contacts.setCompanyAndCountry(contact(s, "B"), "Beta", "DE");
        contacts.setCompanyAndCountry(contact(s, "C"), null, "DE");
        contact(s, "Brez");

        assertThat(texts(s, "type", "company")).containsExactly("Acme d.o.o.", "Beta");
        assertThat(texts(s, "type", "company", "q", "AC")).containsExactly("Acme d.o.o.");
        assertThat(texts(s, "type", "country")).containsExactly("DE", "AT");
        assertThat(items(s, Who.EDITOR, "type", "country").get(0)).containsEntry("count", 3);
    }

    @Test
    @Tag("FR-013-14")
    void tagsAreByFrequencyWithCountsCanonicalFormAndPrefixBeforeMiddle() throws Exception {
        Scenario s = scenario();
        for (int i = 0; i < 3; i++) {
            contacts.addTag(contact(s, "A" + i), 0, "vip");
        }
        contacts.addTag(contact(s, "B"), 0, "VIP");
        UUID c = contact(s, "C");
        contacts.addTag(c, 0, "stranka");
        contacts.addTag(contact(s, "D"), 0, "ni-stranka");

        List<Map<String, Object>> all = items(s, Who.EDITOR, "type", "tag");

        assertThat(all).extracting(i -> i.get("text")).containsExactly("vip", "ni-stranka", "stranka");
        assertThat(all.get(0)).containsEntry("count", 4);
        assertThat(texts(s, "type", "tag", "q", "STR")).containsExactly("stranka", "ni-stranka");
    }

    @Test
    @Tag("FR-013-09")
    void atMostTenSuggestionsAreReturned() throws Exception {
        Scenario s = scenario();
        UUID c = contact(s, "A");
        for (int i = 0; i < 15; i++) {
            contacts.addAttribute(c, i, "ključ" + String.format("%02d", i), "v");
        }

        assertThat(texts(s, "type", "key")).hasSize(10);
    }

    @Test
    @Tag("FR-013-16")
    void onlyTheGroupOfTheRequestIsUsedAndNoContactIdsAreReturned() throws Exception {
        Scenario a = scenario();
        UUID b = groups.createGroup(a.id(Who.OWNER), "Skupina B");
        contacts.addAttribute(contact(a, "A"), 0, "Javno", "x");
        UUID secret = contacts.insert(b, a.id(Who.OWNER), "Tajni", "Kontakt");
        contacts.addAttribute(secret, 0, "Tajno", "x");
        contacts.addTag(secret, 0, "tajna");
        contacts.setCompanyAndCountry(secret, "Tajna družba", "FR");

        assertThat(texts(a, "type", "key")).containsExactly("Javno");
        assertThat(texts(a, "type", "value", "key", "Tajno")).isEmpty();
        assertThat(texts(a, "type", "tag")).isEmpty();
        assertThat(texts(a, "type", "company")).isEmpty();
        assertThat(texts(a, "type", "country")).isEmpty();
        HttpResponse<String> inB = get(path(b, "type", "key"), a.token(Who.OWNER));
        assertThat(json(inB.body()).toString()).doesNotContain(secret.toString());
    }

    @Test
    @Tag("FR-013-16")
    void invalidParametersAreRejectedAfterTheAccessChecks() throws Exception {
        Scenario s = scenario();
        String editor = s.token(Who.EDITOR);

        HttpResponse<String> missingType = get(path(s.group()), editor);
        HttpResponse<String> unknownType = get(path(s.group(), "type", "foo"), editor);
        HttpResponse<String> valueWithoutKey = get(path(s.group(), "type", "value"), editor);
        HttpResponse<String> countryWithQuery = get(path(s.group(), "type", "country", "q", "a"), editor);
        HttpResponse<String> tooLong = get(path(s.group(), "type", "key", "q", "x".repeat(101)), editor);
        HttpResponse<String> viewerInvalid = get(path(s.group(), "type", "foo"), s.token(Who.VIEWER));
        HttpResponse<String> nonMemberInvalid = get(path(s.group(), "type", "foo"), s.token(Who.NON_MEMBER));

        assertThat(fieldErrors(missingType.body())).containsEntry("type", "REQUIRED");
        assertThat(fieldErrors(unknownType.body())).containsEntry("type", "INVALID_VALUE");
        assertThat(fieldErrors(valueWithoutKey.body())).containsEntry("key", "REQUIRED");
        assertThat(fieldErrors(countryWithQuery.body())).containsEntry("q", "INVALID_VALUE");
        assertThat(fieldErrors(tooLong.body())).containsEntry("q", "TOO_LONG");
        assertThat(viewerInvalid.statusCode()).isEqualTo(403);
        assertThat(nonMemberInvalid.statusCode()).isEqualTo(404);
    }

    @Test
    @Tag("FR-013-14")
    void theOldTagsEndpointIsGone() throws Exception {
        Scenario s = scenario();

        HttpResponse<String> response = get("/api/groups/" + s.group() + "/tags?q=v", s.token(Who.EDITOR));

        assertThat(response.statusCode()).isIn(404, 405);
    }

    @Test
    @Tag("FR-013-14")
    void deletingTheLastContactWithATagOrKeyRemovesTheSuggestion() throws Exception {
        Scenario s = scenario();
        UUID c = contact(s, "Edini");
        contacts.addTag(c, 0, "edinstvena");
        contacts.addAttribute(c, 0, "Posebnost", "x");
        assertThat(texts(s, "type", "tag", "q", "edin")).containsExactly("edinstvena");
        assertThat(texts(s, "type", "key", "q", "poseb")).containsExactly("Posebnost");

        assertThat(delete(contactPath(s.group(), c) + "?version=0", s.token(Who.EDITOR))
                        .statusCode())
                .isEqualTo(204);

        assertThat(texts(s, "type", "tag", "q", "edin")).isEmpty();
        assertThat(texts(s, "type", "key", "q", "poseb")).isEmpty();
    }
}
