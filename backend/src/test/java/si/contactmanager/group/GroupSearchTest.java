package si.contactmanager.group;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/** Normalizacija iskanja skupin (FR-017-14): male črke, brez šumnikov; enaka je v bazi in v Javi. */
@Tag("FR-017-14")
class GroupSearchTest {

    @Test
    void lowercasesAndStripsDiacritics() {
        assertThat(GroupSearch.normalize("ČŠŽ Ćevapčići Đurđevak Łódź")).isEqualTo("csz cevapcici durdevak lodz");
        assertThat(GroupSearch.normalize("Zoë Müller")).isEqualTo("zoe muller");
    }

    @Test
    void keepsSpecialCharactersAsTheyAre() {
        assertThat(GroupSearch.normalize("100%_a\\b")).isEqualTo("100%_a\\b");
    }

    @Test
    void sqlExpressionUsesTheSameMapping() {
        assertThat(GroupSearch.titleExpression("g.title")).startsWith("translate(lower(g.title), '");
        assertThat(GroupSearch.titleExpression("g.title")).contains("č").contains("đ");
    }
}
