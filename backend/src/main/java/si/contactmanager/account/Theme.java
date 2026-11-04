package si.contactmanager.account;

import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Arrays;
import java.util.Optional;

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

    /** Vrednost po kodi (natančno ujemanje). */
    public static Optional<Theme> fromCode(String code) {
        return Arrays.stream(values()).filter(value -> value.code.equals(code)).findFirst();
    }
}
