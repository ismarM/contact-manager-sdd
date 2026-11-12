package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Optional;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * Besedilo celice izvoza (FR-010-08, FR-010-09; SC-004; research R-07): prazno → brez celice, nevarni začetek dobi
 * predpono {@code '}, vse drugo je nespremenjeno. Vrednosti so dobesedne.
 */
@Tag("FR-010-08")
@Tag("FR-010-09")
@Tag("SC-004")
class CellTextTest {

    @ParameterizedTest
    @NullAndEmptySource
    void nullAndEmptyGiveNoCell(String value) {
        assertThat(CellText.of(value)).isEqualTo(Optional.empty());
    }

    @Test
    void aDangerousFirstCharacterGetsALeadingApostrophe() {
        assertThat(CellText.of("=HYPERLINK(\"http://x\",\"klik\")")).contains("'=HYPERLINK(\"http://x\",\"klik\")");
        assertThat(CellText.of("+386 41 123 456")).contains("'+386 41 123 456");
        assertThat(CellText.of("-Glavni trg 1")).contains("'-Glavni trg 1");
        assertThat(CellText.of("@SUM(A1)")).contains("'@SUM(A1)");
    }

    @Test
    void aLeadingTabOrCarriageReturnGetsALeadingApostrophe() {
        assertThat(CellText.of("\tx")).contains("'\tx");
        assertThat(CellText.of("\rx")).contains("'\rx");
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {" =1", "041 123 456", "007", "Glavni trg 1\nMaribor", "Ana", "a=b"})
    void otherValuesStayUnchanged(String value) {
        assertThat(CellText.of(value)).contains(value);
    }
}
