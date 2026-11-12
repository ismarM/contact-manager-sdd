package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import si.contactmanager.contact.support.DuplicateApiTest;

/**
 * Zasebnost (konstitucija VI, FR-011-13, FR-011-15): ime, e-naslov in telefon kontaktov niso v dnevniku aplikacije
 * med iskanjem, primerjavo, uspešno in zavrnjeno združitvijo.
 */
@Tag("FR-011-13")
@Tag("FR-011-15")
@ExtendWith(OutputCaptureExtension.class)
class DuplicateLogIT extends DuplicateApiTest {

    private static final String NAME = "Zelo-Posebno-Ime-123";
    private static final String EMAIL = "zelo.posebno.456@primer.si";
    private static final String PHONE = "041 999 888";
    private static final Instant START = Instant.parse("2026-01-01T00:00:00Z");

    private List<UUID> pair(Scenario s, String suffix) {
        long owner = s.id(Who.OWNER);
        return List.of(
                contacts.insertContact(s.group(), owner, NAME, suffix, EMAIL, PHONE, START.plusSeconds(1)),
                contacts.insertContact(s.group(), owner, NAME, suffix, EMAIL, PHONE, START.plusSeconds(2)));
    }

    @Test
    void namesEmailsAndPhonesNeverAppearInTheApplicationLog(CapturedOutput output) throws Exception {
        Scenario s = scenario();
        String editor = s.token(Who.EDITOR);
        List<UUID> accepted = pair(s, "Uspeh");
        List<UUID> conflicting = pair(s, "Konflikt");
        List<UUID> invalid = pair(s, "Napaka");

        // iskanje po vseh treh kategorijah in primerjava
        for (String category : List.of("name", "email", "phone")) {
            HttpResponse<String> search = duplicates(editor, s.group(), "category", category);
            assertThat(search.statusCode()).as(category + " " + search.body()).isEqualTo(200);
        }
        assertThat(compare(editor, s.group(), accepted).statusCode()).isEqualTo(200);

        // zavrnjena združitev 409: kontakt je bil po odprtju primerjave spremenjen
        List<java.util.Map<String, Object>> stale = List.of(
                contact(conflicting.get(0), contacts.version(conflicting.get(0))),
                contact(conflicting.get(1), contacts.version(conflicting.get(1))));
        contacts.editedByOther(conflicting.get(0), s.id(Who.OWNER), "041 000 000");
        assertThat(merge(editor, s.group(), mergeBody(stale, result(NAME, "Konflikt", null, EMAIL, PHONE, null, null)))
                        .statusCode())
                .isEqualTo(409);

        // zavrnjena združitev 400: rezultat brez imena in priimka
        assertThat(merge(editor, s.group(), mergeBodyNow(invalid, result(null, null, null, EMAIL, PHONE, null, null)))
                        .statusCode())
                .isEqualTo(400);

        // uspešna združitev
        HttpResponse<String> merged =
                merge(editor, s.group(), mergeBodyNow(accepted, result(NAME, "Uspeh", null, EMAIL, PHONE, null, null)));
        assertThat(merged.statusCode()).as(merged.body()).isEqualTo(200);

        for (String secret : List.of(NAME, EMAIL, PHONE)) {
            assertThat(output.getAll()).as(secret).doesNotContain(secret);
        }
    }
}
