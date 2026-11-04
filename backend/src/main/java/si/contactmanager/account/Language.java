package si.contactmanager.account;

import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Arrays;
import java.util.Optional;

/** Jezik vmesnika (data-model.md: {@code sl}, {@code en}). */
public enum Language {
    SL("sl"),
    EN("en");

    private final String code;

    Language(String code) {
        this.code = code;
    }

    @JsonValue
    public String code() {
        return code;
    }

    /** Vrednost po kodi (natančno ujemanje, tudi po velikosti črk). */
    public static Optional<Language> fromCode(String code) {
        return Arrays.stream(values()).filter(value -> value.code.equals(code)).findFirst();
    }
}
