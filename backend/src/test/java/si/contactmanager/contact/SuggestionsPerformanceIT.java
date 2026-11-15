package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.contact.support.ContactApiTest;
import si.contactmanager.contact.support.ContactSearchClient;

/**
 * Zmogljivost predlogov v skupini z 10.000 kontakti (SC-003, FR-013-16): vsak kontakt ima tri atribute, značke,
 * podjetje in državo; po dva ogrevalna in 20 merjenih klicev za vsak tip; 95. percentil pod 300 ms.
 */
@Tag("SC-003")
class SuggestionsPerformanceIT extends ContactApiTest {

    private static final long LIMIT_MS = 300;
    private static final int CONTACTS = 10_000;

    private long call(String token, UUID group, String... pairs) throws Exception {
        long start = System.nanoTime();
        HttpResponse<String> response =
                get("/api/groups/" + group + "/suggestions" + ContactSearchClient.query(pairs), token);
        long ms = (System.nanoTime() - start) / 1_000_000;
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        assertThat(asObjects(json(response.body()).get("items"))).isNotEmpty().hasSizeLessThanOrEqualTo(10);
        return ms;
    }

    private static long percentile95(List<Long> samples) {
        List<Long> sorted = new ArrayList<>(samples);
        Collections.sort(sorted);
        return sorted.get((int) Math.ceil(0.95 * sorted.size()) - 1);
    }

    @Test
    void everySuggestionTypeAnswersWithin300MillisecondsAtTenThousandContacts() throws Exception {
        Scenario s = scenario();
        long owner = s.id(Who.OWNER);
        jdbc.update(
                "insert into contact (group_id, first_name, last_name, company, country, sort_first, sort_last,"
                        + " updated_by) select ?, 'Ime' || g, 'Priimek' || g, 'Podjetje ' || (g % 200),"
                        + " (array['SI','AT','DE','HR','IT'])[g % 5 + 1], 'ime' || g, 'priimek' || g, ?"
                        + " from generate_series(1, ?) g",
                s.group(), owner, CONTACTS);
        jdbc.update(
                "insert into contact_attribute (contact_id, position, key, key_norm, value) select c.id, k.p,"
                        + " 'Ključ ' || k.p, lower('Ključ ' || k.p), 'vrednost ' || (row_number() over () % 50)"
                        + " from contact c cross join (values (0), (1), (2)) k(p) where c.group_id = ?",
                s.group());
        jdbc.update(
                "insert into contact_tag (contact_id, position, tag, tag_norm) select c.id, 0,"
                        + " 'značka' || (row_number() over () % 100), 'značka' || (row_number() over () % 100)"
                        + " from contact c where c.group_id = ?",
                s.group());
        jdbc.execute("analyze contact");
        jdbc.execute("analyze contact_attribute");
        jdbc.execute("analyze contact_tag");
        String token = s.token(Who.EDITOR);
        List<String[]> requests = List.of(
                new String[] {"type", "key"},
                new String[] {"type", "key", "q", "klju"},
                new String[] {"type", "value", "key", "Ključ 1"},
                new String[] {"type", "company", "q", "podj"},
                new String[] {"type", "tag"},
                new String[] {"type", "tag", "q", "znač"},
                new String[] {"type", "country"});

        for (String[] pairs : requests) {
            call(token, s.group(), pairs);
            call(token, s.group(), pairs);
            List<Long> samples = new ArrayList<>();
            for (int i = 0; i < 20; i++) {
                samples.add(call(token, s.group(), pairs));
            }
            assertThat(percentile95(samples)).as(String.join(" ", pairs)).isLessThan(LIMIT_MS);
        }
    }
}
