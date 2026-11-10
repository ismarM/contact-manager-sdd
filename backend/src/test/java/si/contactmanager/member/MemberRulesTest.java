package si.contactmanager.member;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import si.contactmanager.group.Role;

/**
 * Pravilo »le nižjim od sebe« (feature-map §2.1, SC-005): **pričakovanja so ročno napisana dobesedna tabela**, neodvisna
 * od izvedbe (ne izračunajo se z logiko vlog). Tabeli imata natanko 64 oziroma 32 vrstic (4×4×4, 4×4×2).
 */
class MemberRulesTest {

    /** klicatelj, cilj, nova vloga, dovoljeno – 4 × 4 × 4 = 64 vrstic. */
    private static final List<String> CHANGE_ROWS = List.of(
            "OWNER, OWNER, OWNER, false",
            "OWNER, OWNER, ADMIN, false",
            "OWNER, OWNER, EDITOR, false",
            "OWNER, OWNER, VIEWER, false",
            "OWNER, ADMIN, OWNER, false",
            "OWNER, ADMIN, ADMIN, true",
            "OWNER, ADMIN, EDITOR, true",
            "OWNER, ADMIN, VIEWER, true",
            "OWNER, EDITOR, OWNER, false",
            "OWNER, EDITOR, ADMIN, true",
            "OWNER, EDITOR, EDITOR, true",
            "OWNER, EDITOR, VIEWER, true",
            "OWNER, VIEWER, OWNER, false",
            "OWNER, VIEWER, ADMIN, true",
            "OWNER, VIEWER, EDITOR, true",
            "OWNER, VIEWER, VIEWER, true",
            "ADMIN, OWNER, OWNER, false",
            "ADMIN, OWNER, ADMIN, false",
            "ADMIN, OWNER, EDITOR, false",
            "ADMIN, OWNER, VIEWER, false",
            "ADMIN, ADMIN, OWNER, false",
            "ADMIN, ADMIN, ADMIN, false",
            "ADMIN, ADMIN, EDITOR, false",
            "ADMIN, ADMIN, VIEWER, false",
            "ADMIN, EDITOR, OWNER, false",
            "ADMIN, EDITOR, ADMIN, false",
            "ADMIN, EDITOR, EDITOR, true",
            "ADMIN, EDITOR, VIEWER, true",
            "ADMIN, VIEWER, OWNER, false",
            "ADMIN, VIEWER, ADMIN, false",
            "ADMIN, VIEWER, EDITOR, true",
            "ADMIN, VIEWER, VIEWER, true",
            "EDITOR, OWNER, OWNER, false",
            "EDITOR, OWNER, ADMIN, false",
            "EDITOR, OWNER, EDITOR, false",
            "EDITOR, OWNER, VIEWER, false",
            "EDITOR, ADMIN, OWNER, false",
            "EDITOR, ADMIN, ADMIN, false",
            "EDITOR, ADMIN, EDITOR, false",
            "EDITOR, ADMIN, VIEWER, false",
            "EDITOR, EDITOR, OWNER, false",
            "EDITOR, EDITOR, ADMIN, false",
            "EDITOR, EDITOR, EDITOR, false",
            "EDITOR, EDITOR, VIEWER, false",
            "EDITOR, VIEWER, OWNER, false",
            "EDITOR, VIEWER, ADMIN, false",
            "EDITOR, VIEWER, EDITOR, false",
            "EDITOR, VIEWER, VIEWER, false",
            "VIEWER, OWNER, OWNER, false",
            "VIEWER, OWNER, ADMIN, false",
            "VIEWER, OWNER, EDITOR, false",
            "VIEWER, OWNER, VIEWER, false",
            "VIEWER, ADMIN, OWNER, false",
            "VIEWER, ADMIN, ADMIN, false",
            "VIEWER, ADMIN, EDITOR, false",
            "VIEWER, ADMIN, VIEWER, false",
            "VIEWER, EDITOR, OWNER, false",
            "VIEWER, EDITOR, ADMIN, false",
            "VIEWER, EDITOR, EDITOR, false",
            "VIEWER, EDITOR, VIEWER, false",
            "VIEWER, VIEWER, OWNER, false",
            "VIEWER, VIEWER, ADMIN, false",
            "VIEWER, VIEWER, EDITOR, false",
            "VIEWER, VIEWER, VIEWER, false");

    /** klicatelj, cilj, skupina arhivirana, meni dejanj viden – 4 × 4 × 2 = 32 vrstic. */
    private static final List<String> MANAGE_ROWS = List.of(
            "OWNER, OWNER, false, false",
            "OWNER, OWNER, true, false",
            "OWNER, ADMIN, false, true",
            "OWNER, ADMIN, true, false",
            "OWNER, EDITOR, false, true",
            "OWNER, EDITOR, true, false",
            "OWNER, VIEWER, false, true",
            "OWNER, VIEWER, true, false",
            "ADMIN, OWNER, false, false",
            "ADMIN, OWNER, true, false",
            "ADMIN, ADMIN, false, false",
            "ADMIN, ADMIN, true, false",
            "ADMIN, EDITOR, false, true",
            "ADMIN, EDITOR, true, false",
            "ADMIN, VIEWER, false, true",
            "ADMIN, VIEWER, true, false",
            "EDITOR, OWNER, false, false",
            "EDITOR, OWNER, true, false",
            "EDITOR, ADMIN, false, false",
            "EDITOR, ADMIN, true, false",
            "EDITOR, EDITOR, false, false",
            "EDITOR, EDITOR, true, false",
            "EDITOR, VIEWER, false, false",
            "EDITOR, VIEWER, true, false",
            "VIEWER, OWNER, false, false",
            "VIEWER, OWNER, true, false",
            "VIEWER, ADMIN, false, false",
            "VIEWER, ADMIN, true, false",
            "VIEWER, EDITOR, false, false",
            "VIEWER, EDITOR, true, false",
            "VIEWER, VIEWER, false, false",
            "VIEWER, VIEWER, true, false");

    static Stream<Arguments> changeRows() {
        return CHANGE_ROWS.stream().map(MemberRulesTest::parse);
    }

    static Stream<Arguments> manageRows() {
        return MANAGE_ROWS.stream().map(MemberRulesTest::parse);
    }

    /** Samo razčlenitev vrstice »A, B, C, D« – brez pravil o vlogah. */
    private static Arguments parse(String row) {
        String[] cells = row.split(", ");
        Object third = cells[2].equals("true") || cells[2].equals("false")
                ? Boolean.parseBoolean(cells[2])
                : Role.valueOf(cells[2]);
        return Arguments.of(Role.valueOf(cells[0]), Role.valueOf(cells[1]), third, Boolean.parseBoolean(cells[3]));
    }

    @Test
    void literalTablesHaveTheFullNumberOfCombinations() {
        assertThat(CHANGE_ROWS).hasSize(64).doesNotHaveDuplicates();
        assertThat(MANAGE_ROWS).hasSize(32).doesNotHaveDuplicates();
        assertThat(CHANGE_ROWS.stream().filter(row -> row.endsWith("true")).count())
                .as("dovoljene spremembe vloge")
                .isEqualTo(13);
        assertThat(MANAGE_ROWS.stream().filter(row -> row.endsWith("true")).count())
                .as("vidni meniji dejanj")
                .isEqualTo(5);
    }

    @Tag("FR-007-03")
    @ParameterizedTest(name = "{0} → cilj {1}, nova vloga {2}: {3}")
    @MethodSource("changeRows")
    void mayChangeFollowsTheLiteralTable(Role caller, Role target, Role newRole, boolean expected) {
        assertThat(MemberRules.mayChange(caller, target, newRole)).isEqualTo(expected);
    }

    @Tag("FR-007-02")
    @ParameterizedTest(name = "{0} → cilj {1}, arhivirana {2}: meni {3}")
    @MethodSource("manageRows")
    void canManageFollowsTheLiteralTable(Role caller, Role target, boolean archived, boolean expected) {
        assertThat(MemberRules.canManage(caller, target, archived)).isEqualTo(expected);
    }

    @Test
    @Tag("FR-007-03")
    void assignableRolesAreStrictlyBelowTheCallerAndNeverOwner() {
        assertThat(MemberRules.assignable(Role.OWNER)).containsExactly(Role.ADMIN, Role.EDITOR, Role.VIEWER);
        assertThat(MemberRules.assignable(Role.ADMIN)).containsExactly(Role.EDITOR, Role.VIEWER);
        assertThat(MemberRules.assignable(Role.EDITOR)).isEmpty();
        assertThat(MemberRules.assignable(Role.VIEWER)).isEmpty();
    }
}
