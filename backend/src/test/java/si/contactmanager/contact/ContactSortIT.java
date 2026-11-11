package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.contact.support.ContactSearchApiTest;
import si.contactmanager.contact.support.ContactSearchClient;
import si.contactmanager.support.Http;

/**
 * Razvrščanje seznama po slovenski abecedi, neodvisno od jezika vmesnika (FR-008-07, D-63; SC-003). Vsi pričakovani
 * vrstni redi so dobesedni seznami, napisani iz specifikacije, ne izračunani s kolacijo baze.
 */
@Tag("FR-008-07")
class ContactSortIT extends ContactSearchApiTest {

    private void lastNames(Scenario s, String... lastNames) {
        for (String last : lastNames) {
            add(s, "X", last);
        }
    }

    private static List<String> reversed(List<String> list) {
        List<String> copy = new ArrayList<>(list);
        java.util.Collections.reverse(copy);
        return copy;
    }

    @Test
    void sloveneAlphabetPlacesCaronLettersAfterTheirBaseLetters() throws Exception {
        Scenario s = scenario();
        lastNames(s, "Zupan", "Žagar", "Čeh", "Cene", "Dana", "Šuligoj");
        List<String> ascending = List.of("X Cene", "X Čeh", "X Dana", "X Šuligoj", "X Zupan", "X Žagar");

        assertThat(found(s, "sort", "lastName", "dir", "asc")).containsExactlyElementsOf(ascending);
        assertThat(found(s, "sort", "lastName", "dir", "desc")).containsExactlyElementsOf(reversed(ascending));
    }

    @Test
    void sloveneOrderWithRSAndSBeforeCaron() throws Exception {
        Scenario s = scenario();
        lastNames(s, "Šuligoj", "Suhadolnik", "Rus", "Sever", "Tomšič");

        assertThat(found(s)).containsExactly("X Rus", "X Sever", "X Suhadolnik", "X Šuligoj", "X Tomšič");
    }

    @Test
    void defaultOrderIsLastNameAscendingLikeExplicitSort() throws Exception {
        Scenario s = scenario();
        lastNames(s, "Žagar", "Čeh", "Cene");

        List<String> expected = List.of("X Cene", "X Čeh", "X Žagar");
        assertThat(found(s)).containsExactlyElementsOf(expected);
        assertThat(found(s, "sort", "lastName")).containsExactlyElementsOf(expected);
        assertThat(found(s, "sort", "lastName", "dir", "asc")).containsExactlyElementsOf(expected);
    }

    @Test
    void orderIsTheSameForSloveneAndEnglishRequests() throws Exception {
        Scenario s = scenario();
        lastNames(s, "Žagar", "Zupan", "Čeh", "Cene");
        String path = ContactSearchClient.listPath(s.group()) + ContactSearchClient.query("sort", "lastName");

        for (String language : List.of("sl", "en", "sl-SI,en;q=0.5", "de")) {
            HttpResponse<String> response = Http.send(
                    "GET",
                    url(path),
                    Map.of("Authorization", "Bearer " + s.token(Who.VIEWER), "Accept-Language", language));

            assertThat(ContactSearchClient.names(response.body()))
                    .as(language)
                    .containsExactly("X Cene", "X Čeh", "X Zupan", "X Žagar");
        }
        assertThat(found(s, "lang", "en")).containsExactly("X Cene", "X Čeh", "X Zupan", "X Žagar");
    }

    @Test
    void letterCaseDoesNotInfluenceTheOrderAndTiesAreDecidedByFirstName() throws Exception {
        Scenario s = scenario();
        add(s, "Bojan", "Novak");
        add(s, "Ana", "novak");
        add(s, "Aaa", "NOVAK");
        add(s, "Cene", "Čeh");
        add(s, "Dana", "cene");

        // Č je takoj za C (pred D in N): cene, Čeh, nato trije Novaki po imenu
        assertThat(found(s, "sort", "lastName", "dir", "asc"))
                .containsExactly("Dana cene", "Cene Čeh", "Aaa NOVAK", "Ana novak", "Bojan Novak");
        // pri padajoči smeri se enaki priimki še vedno razvrstijo po imenu naraščajoče
        assertThat(found(s, "sort", "lastName", "dir", "desc"))
                .containsExactly("Aaa NOVAK", "Ana novak", "Bojan Novak", "Cene Čeh", "Dana cene");
    }

    @Test
    void sortByFirstNameUsesTheSameAlphabet() throws Exception {
        Scenario s = scenario();
        add(s, "Čaba", "Prvi");
        add(s, "Cene", "Drugi");
        add(s, "Ana", "Tretji");
        add(s, "Žan", "Četrti");
        add(s, "Zala", "Peti");

        assertThat(found(s, "sort", "firstName"))
                .containsExactly("Ana Tretji", "Cene Drugi", "Čaba Prvi", "Zala Peti", "Žan Četrti");
        assertThat(found(s, "sort", "firstName", "dir", "desc"))
                .containsExactly("Žan Četrti", "Zala Peti", "Čaba Prvi", "Cene Drugi", "Ana Tretji");
    }

    @Test
    void emptyLastNamesAreAtTheEndInBothDirections() throws Exception {
        Scenario s = scenario();
        add(s, "Ana", null);
        add(s, "Bojan", "Čeh");
        add(s, "Cene", "Abc");

        assertThat(found(s, "sort", "lastName", "dir", "asc")).containsExactly("Cene Abc", "Bojan Čeh", "Ana");
        assertThat(found(s, "sort", "lastName", "dir", "desc")).containsExactly("Bojan Čeh", "Cene Abc", "Ana");
    }

    @Test
    void contactsWithoutAPredefinedValueAreAtTheEndInBothDirections() throws Exception {
        Scenario s = scenario();
        add(s, "A", "Prvi", "b@x.si", "031 222", "Ulica B");
        add(s, "B", "Drugi", "a@x.si", "041 111", "Ulica A");
        add(s, "C", "Brez", null, null, null);

        assertThat(found(s, "sort", "email", "dir", "asc")).containsExactly("B Drugi", "A Prvi", "C Brez");
        assertThat(found(s, "sort", "email", "dir", "desc")).containsExactly("A Prvi", "B Drugi", "C Brez");
        assertThat(found(s, "sort", "phone", "dir", "asc")).containsExactly("A Prvi", "B Drugi", "C Brez");
        assertThat(found(s, "sort", "phone", "dir", "desc")).containsExactly("B Drugi", "A Prvi", "C Brez");
        assertThat(found(s, "sort", "address", "dir", "asc")).containsExactly("B Drugi", "A Prvi", "C Brez");
        assertThat(found(s, "sort", "address", "dir", "desc")).containsExactly("A Prvi", "B Drugi", "C Brez");
    }

    @Test
    void sortByAdditionalAttributePutsContactsWithoutItLastInBothDirections() throws Exception {
        Scenario s = scenario();
        UUID beta = add(s, "A", "Prvi");
        contacts.addAttribute(beta, 0, "podjetje", "Beta");
        UUID alfa = add(s, "B", "Drugi");
        contacts.addAttribute(alfa, 0, "podjetje", "Alfa");
        add(s, "C", "Brez");

        assertThat(found(s, "sort", "x.podjetje", "dir", "asc")).containsExactly("B Drugi", "A Prvi", "C Brez");
        assertThat(found(s, "sort", "x.podjetje", "dir", "desc")).containsExactly("A Prvi", "B Drugi", "C Brez");
        assertThat(found(s, "sort", "x.Podjetje", "dir", "asc")).containsExactly("B Drugi", "A Prvi", "C Brez");
    }

    @Test
    void attributeValuesAreSortedAsTextAlphabeticallyInSlovene() throws Exception {
        Scenario s = scenario();
        String[][] rows = {{"A", "9"}, {"B", "10"}, {"C", "2"}, {"D", "čaj"}, {"E", "Cvet"}, {"F", "dan"}};
        for (String[] row : rows) {
            UUID id = add(s, row[0], "Priimek");
            contacts.addAttribute(id, 0, "vrednost", row[1]);
        }

        // besedilna primerjava: »10« pred »2« pred »9«, nato Cvet pred čaj (č je za c), nato dan
        assertThat(found(s, "sort", "x.vrednost"))
                .containsExactly("B Priimek", "C Priimek", "A Priimek", "E Priimek", "D Priimek", "F Priimek");
    }

    @Test
    void equalValuesAreOrderedByLastNameThenFirstNameAscending() throws Exception {
        Scenario s = scenario();
        add(s, "Bojan", "Zupan", "x@feri.si", null, null);
        add(s, "Ana", "Zupan", "x@feri.si", null, null);
        add(s, "Cene", "Čeh", "x@feri.si", null, null);
        add(s, "Dana", "Abc", "x@feri.si", null, null);

        List<String> expected = List.of("Dana Abc", "Cene Čeh", "Ana Zupan", "Bojan Zupan");
        assertThat(found(s, "sort", "email", "dir", "asc")).containsExactlyElementsOf(expected);
        assertThat(found(s, "sort", "email", "dir", "desc")).containsExactlyElementsOf(expected);
    }

    @Test
    void identicalContactsAreOrderedByCreationTimeThenId() throws Exception {
        Scenario s = scenario();
        UUID first = add(s, "Ana", "Novak");
        UUID second = add(s, "Ana", "Novak");
        UUID third = add(s, "Ana", "Novak");
        jdbc.update("update contact set created_at = timestamptz '2026-01-03 10:00:00+00' where id = ?", first);
        jdbc.update("update contact set created_at = timestamptz '2026-01-01 10:00:00+00' where id = ?", second);
        jdbc.update("update contact set created_at = timestamptz '2026-01-02 10:00:00+00' where id = ?", third);

        List<String> ids = ContactSearchClient.items(search(s).body()).stream()
                .map(item -> (String) item.get("id"))
                .toList();

        assertThat(ids).containsExactly(second.toString(), third.toString(), first.toString());
    }

    @Test
    void identicalContactsWithEqualCreationTimeAreOrderedById() throws Exception {
        Scenario s = scenario();
        List<UUID> created = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            created.add(add(s, "Ana", "Novak"));
        }
        jdbc.update(
                "update contact set created_at = timestamptz '2026-01-01 10:00:00+00' where group_id = ?", s.group());

        List<String> ids = ContactSearchClient.items(search(s).body()).stream()
                .map(item -> (String) item.get("id"))
                .toList();

        assertThat(ids)
                .containsExactlyElementsOf(
                        created.stream().map(UUID::toString).sorted().toList());
    }

    @Test
    void punctuationAndSpacesFollowTheIcuRulesForSlovene() throws Exception {
        Scenario s = scenario();
        lastNames(s, "Obrien", "O'Brien", "Novakk", "Ob", "Novak-Kralj", "O Brien", "Novak Kralj");

        assertThat(found(s))
                .containsExactly(
                        "X Novak Kralj", "X Novak-Kralj", "X Novakk", "X O Brien", "X O'Brien", "X Ob", "X Obrien");
    }

    @Test
    void sortCombinesWithSearchAndFilters() throws Exception {
        Scenario s = scenario();
        UUID a = add(s, "A", "Žagar", "a@feri.si", null, null);
        contacts.addTags(a, "vip");
        UUID b = add(s, "B", "Čeh", "b@feri.si", null, null);
        contacts.addTags(b, "vip");
        add(s, "C", "Cene", "c@feri.si", null, null);

        assertThat(found(s, "q", "feri", "tag", "vip", "sort", "lastName", "dir", "desc"))
                .containsExactly("A Žagar", "B Čeh");
        assertThat(found(s, "q", "feri", "tag", "vip", "sort", "lastName")).containsExactly("B Čeh", "A Žagar");
    }
}
