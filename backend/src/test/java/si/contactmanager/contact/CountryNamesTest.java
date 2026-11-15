package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import si.contactmanager.contact.CountryNames.Resolution;

/** Seznam držav, imena, iskanje in prepoznavanje (FR-013-03, -13, -19; SC-006). */
@Tag("FR-013-13")
@Tag("FR-013-19")
class CountryNamesTest {

    @Test
    void hasTheOfficialIsoCodesWithNamesInBothLanguages() {
        assertThat(CountryNames.codes())
                .hasSize(249)
                .contains("SI", "AT", "DE", "US")
                .doesNotContain("XK");
        for (String code : CountryNames.codes()) {
            assertThat(CountryNames.display(code, "sl")).as(code + " sl").isNotBlank();
            assertThat(CountryNames.display(code, "en")).as(code + " en").isNotBlank();
        }
        assertThat(CountryNames.display("SI", "sl")).isEqualTo("Slovenija");
        assertThat(CountryNames.display("SI", "en")).isEqualTo("Slovenia");
        assertThat(CountryNames.display("AT", "sl")).isEqualTo("Avstrija");
        assertThat(CountryNames.display(null, "sl")).isNull();
    }

    @ParameterizedTest
    @CsvSource({"SI,true", "AT,true", "si,false", "SVN,false", "XX,false", "'',false", "S,false"})
    void onlyOfficialUppercaseAlpha2CodesAreValid(String code, boolean valid) {
        assertThat(CountryNames.isValid(code)).isEqualTo(valid);
    }

    @ParameterizedTest
    @CsvSource({
        "Slovenija,SI",
        "Slovenia,SI",
        "SI,SI",
        "si,SI",
        "SVN,SI",
        "  slovenija ,SI",
        "AVSTRIJA,AT",
        "Austria,AT",
        "Nemčija,DE",
        "nemcija,DE",
        "Germany,DE",
        "Češka,CZ",
        "Czech Republic,CZ",
        "UK,GB",
        "USA,US",
        "Severna Makedonija,MK"
    })
    void exactNamesCodesAndAliasesResolveToOneCountry(String text, String code) {
        assertThat(CountryNames.resolve(text)).isEqualTo(new Resolution.Found(code));
    }

    @ParameterizedTest
    @CsvSource({"Korea", "Slovenij", "Gvin", "Kongo", "Sloven"})
    void partialMatchesAreNeverResolvedAutomatically(String text) {
        assertThat(CountryNames.resolve(text)).isInstanceOf(Resolution.Ambiguous.class);
        assertThat(((Resolution.Ambiguous) CountryNames.resolve(text)).candidates())
                .isNotEmpty()
                .hasSizeLessThanOrEqualTo(CountryNames.MAX_CANDIDATES);
    }

    @Test
    void koreaHasBothKoreasAsCandidates() {
        assertThat(((Resolution.Ambiguous) CountryNames.resolve("Korea")).candidates())
                .contains("KR", "KP");
    }

    @ParameterizedTest
    @CsvSource({"Slovenija?!", "Atlantida", "xyz", "''", "ab"})
    void unknownTextIsNeverGuessed(String text) {
        assertThat(CountryNames.resolve(text)).isEqualTo(new Resolution.Unknown());
    }

    @Test
    void nullAndBlankAreUnknown() {
        assertThat(CountryNames.resolve(null)).isEqualTo(new Resolution.Unknown());
        assertThat(CountryNames.resolve("   ")).isEqualTo(new Resolution.Unknown());
    }

    @Test
    void searchMatchesCodeAndNamesInBothLanguagesIgnoringCaseAndDiacritics() {
        assertThat(CountryNames.matching("avstrija")).containsExactly("AT");
        assertThat(CountryNames.matching("AUSTRIA")).containsExactly("AT");
        assertThat(CountryNames.matching("at")).containsExactly("AT");
        assertThat(CountryNames.matching("nemc")).contains("DE");
        assertThat(CountryNames.matching("slo")).contains("SI", "SK");
        assertThat(CountryNames.matching("")).isEmpty();
        assertThat(CountryNames.matching("zzzz")).isEmpty();
    }

    @Test
    void aTwoLetterTextOnlyMatchesTheCodeNotNamesContainingIt() {
        List<String> found = CountryNames.matching("at");

        assertThat(found).containsExactly("AT");
    }
}
