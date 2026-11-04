package si.contactmanager.account;

import com.fasterxml.jackson.annotation.JsonValue;

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
}
