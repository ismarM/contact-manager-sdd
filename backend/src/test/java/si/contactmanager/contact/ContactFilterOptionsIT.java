package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.contact.support.ContactSearchApiTest;
import si.contactmanager.contact.support.ContactSearchClient;

/** Možnosti filtrov skupine: dodatni ključi in značke samo te skupine (FR-008-06, FR-008-16, FR-008-15). */
class ContactFilterOptionsIT extends ContactSearchApiTest {

    private HttpResponse<String> options(Scenario s, Who who) throws Exception {
        return get(ContactSearchClient.filtersPath(s.group()), s.token(who));
    }

    @Test
    @Tag("FR-008-06")
    @Tag("FR-008-16")
    void optionsContainOnlyKeysAndTagsOfThisGroup() throws Exception {
        Scenario a = scenario();
        UUID one = add(a, "A", "Prvi");
        contacts.addAttribute(one, 0, "kompetenca", "web");
        contacts.addAttribute(one, 1, "podjetje", "FERI");
        contacts.addTags(one, "vip");
        UUID two = add(a, "B", "Drugi");
        contacts.addTags(two, "konferenca2025");

        UUID other = groups.createGroup(a.id(Who.OWNER), "Skupina B");
        UUID foreign = contacts.insert(other, a.id(Who.OWNER), "Tuj", "Kontakt");
        contacts.addAttribute(foreign, 0, "skrivno", "x");
        contacts.addTags(foreign, "tajno");

        HttpResponse<String> response = options(a, Who.VIEWER);

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(ContactSearchClient.page(response.body())).containsOnlyKeys("keys", "tags");
        assertThat(ContactSearchClient.options(response.body(), "keys")).containsExactly("kompetenca", "podjetje");
        assertThat(ContactSearchClient.options(response.body(), "tags")).containsExactly("konferenca2025", "vip");
        assertThat(response.body()).doesNotContain("skrivno").doesNotContain("tajno");
    }

    @Test
    @Tag("FR-008-06")
    void aKeyWrittenWithDifferentCaseIsOneEntryInTheFormOfTheOldestContact() throws Exception {
        Scenario s = scenario();
        UUID oldest = add(s, "A", "Prvi");
        contacts.addAttribute(oldest, 0, "Kompetenca", "x");
        contacts.addTags(oldest, "VIP");
        jdbc.update("update contact set created_at = now() - interval '1 day' where id = ?", oldest);
        UUID newer = add(s, "B", "Drugi");
        contacts.addAttribute(newer, 0, "kompetenca", "y");
        contacts.addTags(newer, "vip");

        HttpResponse<String> response = options(s, Who.VIEWER);

        assertThat(ContactSearchClient.options(response.body(), "keys")).containsExactly("Kompetenca");
        assertThat(ContactSearchClient.options(response.body(), "tags")).containsExactly("VIP");
    }

    @Test
    @Tag("FR-008-06")
    @Tag("FR-008-07")
    void optionsAreSortedAlphabeticallyInSlovene() throws Exception {
        Scenario s = scenario();
        UUID id = add(s, "A", "Prvi");
        contacts.addAttribute(id, 0, "Žival", "x");
        contacts.addAttribute(id, 1, "Cas", "x");
        contacts.addAttribute(id, 2, "Čas", "x");
        contacts.addAttribute(id, 3, "Dan", "x");
        contacts.addAttribute(id, 4, "Zaposlitev", "x");
        contacts.addTags(id, "žaba", "cvet", "čebela", "dež", "zlato");

        HttpResponse<String> response = options(s, Who.VIEWER);

        assertThat(ContactSearchClient.options(response.body(), "keys"))
                .containsExactly("Cas", "Čas", "Dan", "Zaposlitev", "Žival");
        assertThat(ContactSearchClient.options(response.body(), "tags"))
                .containsExactly("cvet", "čebela", "dež", "zlato", "žaba");
    }

    @Test
    @Tag("FR-008-06")
    void emptyGroupHasNoOptions() throws Exception {
        Scenario s = scenario();

        HttpResponse<String> response = options(s, Who.VIEWER);

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(ContactSearchClient.options(response.body(), "keys")).isEmpty();
        assertThat(ContactSearchClient.options(response.body(), "tags")).isEmpty();
    }

    @Test
    @Tag("FR-008-06")
    @Tag("FR-008-15")
    void everyRoleAndMembersOfAnArchivedGroupMayReadTheOptions() throws Exception {
        Scenario s = scenario();
        UUID id = add(s, "A", "Prvi");
        contacts.addTags(id, "vip");

        for (Who who : new Who[] {Who.VIEWER, Who.EDITOR, Who.ADMIN, Who.OWNER}) {
            assertThat(options(s, who).statusCode()).as(who.name()).isEqualTo(200);
        }
        groups.archive(s.group());
        assertThat(options(s, Who.VIEWER).statusCode()).isEqualTo(200);
        assertThat(ContactSearchClient.options(options(s, Who.VIEWER).body(), "tags"))
                .containsExactly("vip");
    }

    @Test
    @Tag("FR-008-06")
    void groupWithManyDistinctTagsReturnsAllOfThemQuickly() throws Exception {
        Scenario s = scenario();
        contacts.insertManyDistinctTags(s.group(), s.id(Who.OWNER), 1000);
        options(s, Who.VIEWER); // ogrevanje

        long start = System.nanoTime();
        HttpResponse<String> response = options(s, Who.VIEWER);
        long millis = (System.nanoTime() - start) / 1_000_000;

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(ContactSearchClient.options(response.body(), "tags")).hasSize(1000);
        assertThat(millis).as("odgovor z 1000 značkami").isLessThan(500);
    }

    @Test
    @Tag("FR-008-06")
    void optionsOfALargeGroupAreFast() throws Exception {
        Scenario s = scenario();
        contacts.insertDistribution(s.group(), s.id(Who.OWNER), 10_000);
        options(s, Who.VIEWER); // ogrevanje

        long start = System.nanoTime();
        HttpResponse<String> response = options(s, Who.VIEWER);
        long millis = (System.nanoTime() - start) / 1_000_000;

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(ContactSearchClient.options(response.body(), "keys")).containsExactly("kompetenca");
        assertThat(ContactSearchClient.options(response.body(), "tags")).containsExactly("konferenca2025", "vip");
        assertThat(millis).as("odgovor pri 10.000 kontaktih").isLessThan(500);
    }
}
