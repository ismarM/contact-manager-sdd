package si.contactmanager.account;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/** Gesla za aplikacijo (FR-014-21; research R-09): oblika, abeceda, entropija, normalizacija in zgoščena vrednost. */
@Tag("FR-014-21")
class AppPasswordsTest {

    @Test
    void aPasswordHas28CharactersOfTheAlphabetInGroupsOfFour() {
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < 1000; i++) {
            String password = AppPasswords.generate();
            assertThat(password).matches("([" + AppPasswords.ALPHABET + "]{4}-){6}[" + AppPasswords.ALPHABET + "]{4}");
            seen.add(password);
        }
        assertThat(seen).hasSize(1000);
        assertThat(AppPasswords.ALPHABET).hasSize(32).doesNotContain("i", "l", "o", "u");
        assertThat(AppPasswords.LENGTH * 5).isGreaterThanOrEqualTo(128);
    }

    @Test
    void dashesSpacesAndCaseDoNotMatterButEveryCharacterDoes() {
        byte[] stored = AppPasswords.hash("abcd-efgh-jkmn");

        assertThat(AppPasswords.matches(AppPasswords.hash("ABCD EFGH JKMN"), stored))
                .isTrue();
        assertThat(AppPasswords.matches(AppPasswords.hash("abcdefghjkmn"), stored))
                .isTrue();
        assertThat(AppPasswords.matches(AppPasswords.hash("abcd-efgh-jkmp"), stored))
                .isFalse();
        assertThat(stored).hasSize(32);
    }
}
