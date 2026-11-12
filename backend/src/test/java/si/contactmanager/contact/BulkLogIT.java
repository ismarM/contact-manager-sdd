package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import si.contactmanager.contact.support.BulkApiTest;

/** Zasebnost (konstitucija VI, research R-15): značke in vrednosti iz telesa množičnih zahtevkov niso v dnevniku. */
@Tag("FR-009-06")
@ExtendWith(OutputCaptureExtension.class)
class BulkLogIT extends BulkApiTest {

    private static final String TAG = "zelo-posebna-znacka-123";
    private static final String VALUE = "zelo-posebna-vrednost-456";

    @Test
    void tagsAndValuesOfTheRequestBodyNeverAppearInTheApplicationLog(CapturedOutput output) throws Exception {
        Scenario s = scenario();
        List<UUID> all = contacts.insertMany(s.group(), s.id(Who.OWNER), 3);

        // uspeh: značka in vrednost dodatnega atributa
        assertThat(bulkUpdate(
                                s.token(Who.EDITOR),
                                s.group(),
                                request(
                                        all,
                                        "addTags",
                                        List.of(TAG),
                                        "attributes",
                                        List.of(attributeSet("custom", "kljuc", VALUE))))
                        .statusCode())
                .isEqualTo(200);
        // zavrnitev 400: neveljaven e-naslov z isto vrednostjo
        assertThat(bulkUpdate(
                                s.token(Who.EDITOR),
                                s.group(),
                                request(
                                        all,
                                        "addTags",
                                        List.of(TAG),
                                        "attributes",
                                        List.of(attributeSet("email", null, VALUE))))
                        .statusCode())
                .isEqualTo(400);

        assertThat(output.getAll()).doesNotContain(TAG).doesNotContain(VALUE);
    }
}
