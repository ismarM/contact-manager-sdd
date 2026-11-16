package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.contact.support.DuplicateApiTest;

/** Dvojniki po normaliziranih vrednostih (016, FR-016-11): stari zapisi se normalizirajo samo za primerjavo. */
@Tag("FR-016-11")
class DuplicateNormalizationIT extends DuplicateApiTest {

    private static final Instant BASE = Instant.parse("2026-02-01T10:00:00Z");

    @Test
    void phonesWrittenInDifferentFormsAreOneGroupAndTheDataIsUnchanged() throws Exception {
        Scenario s = scenario();
        long owner = s.id(Who.OWNER);
        contacts.insertContact(s.group(), owner, "Ana", "A", null, "041 123 456", BASE.plusSeconds(1));
        contacts.insertContact(s.group(), owner, "Bojan", "B", null, "+38641123456", BASE.plusSeconds(2));
        contacts.insertContact(s.group(), owner, "Cene", "C", null, "00386 41/123-456", BASE.plusSeconds(3));
        contacts.insertContact(s.group(), owner, "Dana", "D", null, "031 123 456", BASE.plusSeconds(4));

        HttpResponse<String> response = duplicates(s.token(Who.EDITOR), s.group(), "category", "phone");

        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        List<Map<String, Object>> groups = asObjects(json(response.body()).get("groups"));
        assertThat(groups).hasSize(1);
        assertThat(asObjects(groups.get(0).get("contacts"))).hasSize(3);
        assertThat(jdbc.queryForList(
                        "select phone from contact where group_id = ? order by created_at", String.class, s.group()))
                .containsExactly("041 123 456", "+38641123456", "00386 41/123-456", "031 123 456");
    }

    @Test
    void emailsDifferingOnlyInCaseAreOneGroup() throws Exception {
        Scenario s = scenario();
        long owner = s.id(Who.OWNER);
        contacts.insertContact(s.group(), owner, "Ana", "A", "Ana@Primer.si", null, BASE.plusSeconds(1));
        contacts.insertContact(s.group(), owner, "Bojan", "B", "ana@PRIMER.SI", null, BASE.plusSeconds(2));

        HttpResponse<String> response = duplicates(s.token(Who.EDITOR), s.group(), "category", "email");

        assertThat(asObjects(json(response.body()).get("groups"))).hasSize(1);
    }
}
