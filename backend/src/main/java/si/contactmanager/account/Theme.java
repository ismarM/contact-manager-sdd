package si.contactmanager.account;

import com.fasterxml.jackson.annotation.JsonValue;

/** Tema vmesnika (data-model.md: {@code light}, {@code dark}; {@code null} = Sistemska). */
public enum Theme {
    LIGHT("light"),
    DARK("dark");

    private final String code;

    Theme(String code) {
        this.code = code;
    }

    @JsonValue
    public String code() {
        return code;
    }
}
