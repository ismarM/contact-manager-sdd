package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import si.contactmanager.contact.support.ContactSearchApiTest;
import si.contactmanager.contact.support.ContactSearchClient;

/** Zasebnost (konstitucija VI, research R-12): iskalni nizi, vrednosti, ključi in značke niso v dnevnikih aplikacije. */
@Tag("FR-008-14")
@Tag("FR-008-16")
@ExtendWith(OutputCaptureExtension.class)
class ContactSearchLogIT extends ContactSearchApiTest {

    private static final String[] SECRETS = {
        "zelo-posebna-oseba-123", "vrednost-pogoja-456", "kljuc-atributa-789", "znacka-tajna-321"
    };

    @Test
    void searchStringsAndFilterValuesNeverAppearInTheApplicationLog(CapturedOutput output) throws Exception {
        Scenario s = scenario();
        UUID id = add(s, "Janez", "Novak");
        contacts.addAttribute(id, 0, "kljuc-atributa-789", "x");
        contacts.addTags(id, "znacka-tajna-321");

        // uspešne zahteve
        assertThat(search(s, "q", SECRETS[0]).statusCode()).isEqualTo(200);
        assertThat(search(s, "f", "email:" + SECRETS[1], "tag", SECRETS[3]).statusCode())
                .isEqualTo(200);
        assertThat(search(s, "f", "x.kljuc-atributa-789:" + SECRETS[1], "sort", "x.kljuc-atributa-789")
                        .statusCode())
                .isEqualTo(200);
        // zahteve z napako 400
        assertThat(search(s, "q", SECRETS[0], "size", "7", "f", "x.neobstaja-" + SECRETS[2] + ":" + SECRETS[1])
                        .statusCode())
                .isEqualTo(400);
        assertThat(search(s, "sort", SECRETS[2]).statusCode()).isEqualTo(400);
        assertThat(get(ContactSearchClient.filtersPath(s.group()), s.token(Who.VIEWER))
                        .statusCode())
                .isEqualTo(200);

        for (String secret : SECRETS) {
            assertThat(output.getAll()).as(secret).doesNotContain(secret);
        }
    }
}
