package si.contactmanager.group;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

/** Osem poimenovanih barv (FR-002-03; design.md 4.2, data-model.md): imena so male črke, privzeta je tinta. */
class GroupColorTest {

    @ParameterizedTest
    @ValueSource(strings = {"tinta", "mah", "opeka", "oker", "sliva", "morje", "grafit", "rja"})
    @Tag("FR-002-03")
    void everyNamedColorIsRecognised(String code) {
        assertThat(GroupColor.fromCode(code)).map(GroupColor::code).contains(code);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"Tinta", "MAH", "blue", " mah"})
    @Tag("FR-002-03")
    void unknownOrWrongCaseNameIsNotAColor(String code) {
        assertThat(GroupColor.fromCode(code)).isEmpty();
    }

    @Test
    @Tag("FR-002-03")
    void defaultColorIsTinta() {
        assertThat(GroupColor.DEFAULT.code()).isEqualTo("tinta");
        assertThat(GroupColor.values()).hasSize(8);
    }
}
