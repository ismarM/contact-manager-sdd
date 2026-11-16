package si.contactmanager.contact;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Predlog: besedilo (ključ, vrednost, podjetje, značka ali koda države) in število kontaktov (contracts/openapi.yaml).
 * {@code attributeType} je samo pri predlogih ključev ({@code type=key}, 016): tip ključa v skupini.
 */
public record Suggestion(
        String text,
        long count,
        @JsonInclude(JsonInclude.Include.NON_NULL) AttributeType attributeType) {

    public Suggestion(String text, long count) {
        this(text, count, null);
    }
}
