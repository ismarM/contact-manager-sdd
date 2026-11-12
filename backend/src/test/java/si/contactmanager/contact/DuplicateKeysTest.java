package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Optional;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/**
 * Normalizirani ključi ujemanja (FR-011-03 … FR-011-06; research R-03): vsak primer iz specifikacije dobesedno.
 * Pri {@code name} je vsebina ključa notranja stvar izvedbe, zato se preverja enakost in neenakost ključev; pri
 * {@code email} in {@code phone} je ključ dobesedno določen.
 */
class DuplicateKeysTest {

    private static Optional<String> name(String first, String last) {
        return DuplicateKeys.key("name", first, last, null, null);
    }

    private static Optional<String> email(String email) {
        return DuplicateKeys.key("email", null, null, email, null);
    }

    private static Optional<String> phone(String phone) {
        return DuplicateKeys.key("phone", null, null, null, phone);
    }

    // --- name --------------------------------------------------------------------------------------------------------

    @Test
    @Tag("FR-011-03")
    void nameIgnoresCaseAndSurroundingWhitespace() {
        assertThat(name("Janez", "Novak")).isPresent();
        assertThat(name("  janez ", "NOVAK")).isEqualTo(name("Janez", "Novak"));
    }

    @Test
    @Tag("FR-011-03")
    void nameCollapsesConsecutiveWhitespaceIncludingNonBreakingSpace() {
        assertThat(name("Ana   Marija", "Novak")).isEqualTo(name("Ana Marija", "Novak"));
        assertThat(name("Ana  Marija", "Novak")).isEqualTo(name("Ana Marija", "Novak"));
        assertThat(name("Ana \t Marija", "Novak")).isEqualTo(name("Ana Marija", "Novak"));
    }

    @Test
    @Tag("FR-011-03")
    void nameIgnoresDiacritics() {
        assertThat(name("Janez", "Nóvak")).isEqualTo(name("Janez", "Novak"));
        assertThat(name("Janez", "Čeh")).isEqualTo(name("Janez", "Ceh"));
        assertThat(name("Janez", "Kovačič")).isEqualTo(name("Janez", "Kovacic"));
    }

    @Test
    @Tag("FR-011-03")
    void firstAndLastNameAreComparedSeparately() {
        assertThat(name("Janez", "Novak")).isNotEqualTo(name("Novak", "Janez"));
    }

    @Test
    @Tag("FR-011-03")
    @Tag("FR-011-06")
    void aMissingComponentMatchesAnEmptyOneButNotTheOtherComponent() {
        assertThat(name("Janez", null)).isPresent().isEqualTo(name("Janez", ""));
        assertThat(name("Janez", null)).isNotEqualTo(name(null, "Janez"));
    }

    @Test
    @Tag("FR-011-06")
    void nameWithBothComponentsEmptyIsSkipped() {
        assertThat(name(null, null)).isEmpty();
        assertThat(name("  ", "")).isEmpty();
    }

    @Test
    @Tag("FR-011-03")
    void lettersWithoutDecompositionAreNotMapped() {
        // O-4: brez posebnih preslikav (đ ni kombinirani znak)
        assertThat(name("Đorđe", "Novak")).isNotEqualTo(name("Dorde", "Novak"));
    }

    // --- email -------------------------------------------------------------------------------------------------------

    @Test
    @Tag("FR-011-04")
    void emailIgnoresCaseAndSurroundingWhitespace() {
        assertThat(email("Janez@Primer.si")).isEqualTo(Optional.of("janez@primer.si"));
        assertThat(email(" janez@primer.si")).isEqualTo(email("Janez@Primer.si"));
    }

    @Test
    @Tag("FR-011-04")
    void emailKeepsDiacritics() {
        assertThat(email("žan@primer.si")).isNotEqualTo(email("zan@primer.si"));
        assertThat(email("žan@primer.si")).isEqualTo(Optional.of("žan@primer.si"));
    }

    @Test
    @Tag("FR-011-06")
    void blankOrMissingEmailIsSkipped() {
        assertThat(email("  ")).isEmpty();
        assertThat(email("")).isEmpty();
        assertThat(email(null)).isEmpty();
    }

    // --- phone -------------------------------------------------------------------------------------------------------

    @Test
    @Tag("FR-011-05")
    void phoneKeepsOnlyDigitsAndRemovesALeadingDoubleZeroOnce() {
        assertThat(phone("+386 41 123 456")).isEqualTo(Optional.of("38641123456"));
        assertThat(phone("00386 41-123-456")).isEqualTo(Optional.of("38641123456"));
        assertThat(phone("0000123")).isEqualTo(Optional.of("00123"));
    }

    @Test
    @Tag("FR-011-05")
    void nationalAndInternationalFormsAreNotConverted() {
        assertThat(phone("(041) 123 456")).isEqualTo(Optional.of("041123456"));
        assertThat(phone("041/123-456")).isEqualTo(Optional.of("041123456"));
        assertThat(phone("(041) 123 456")).isNotEqualTo(phone("+386 41 123 456"));
        assertThat(phone("(041) 123 456")).isNotEqualTo(phone("00386 41-123-456"));
    }

    @Test
    @Tag("FR-011-06")
    void phoneWithoutDigitsIsSkippedAlsoAfterRemovingTheDoubleZero() {
        assertThat(phone("()")).isEmpty();
        assertThat(phone("00")).isEmpty();
        assertThat(phone("")).isEmpty();
        assertThat(phone(null)).isEmpty();
    }

    // --- neodvisnost kategorij -------------------------------------------------------------------------------------

    @Test
    @Tag("FR-011-06")
    void anEmptyValueOfAnotherCategoryDoesNotSkipTheContact() {
        assertThat(DuplicateKeys.key("name", "Janez", "Novak", "", null)).isPresent();
        assertThat(DuplicateKeys.key("name", "Janez", "Novak", null, "()")).isPresent();
        assertThat(DuplicateKeys.key("email", "", "", "janez@primer.si", "")).isPresent();
        assertThat(DuplicateKeys.key("phone", null, null, "", "041 123 456")).isPresent();
        assertThat(DuplicateKeys.key("email", "Janez", "Novak", null, "041 123 456"))
                .isEmpty();
    }
}
