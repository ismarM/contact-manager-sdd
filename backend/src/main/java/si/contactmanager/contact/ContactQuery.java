package si.contactmanager.contact;

import java.util.List;

/**
 * Nepremenljiva poizvedba seznama kontaktov (specs/008-iskanje/data-model.md): iskane besede, pogoji atributov, značke,
 * razvrščanje, stran in velikost. Brez odvisnosti od spletnega sloja, zato jo lahko ponovno uporabita 009 in 010.
 */
public record ContactQuery(
        List<String> words,
        List<Condition> conditions,
        List<String> tags,
        Field sort,
        Direction direction,
        int page,
        int size) {

    public ContactQuery {
        words = List.copyOf(words);
        conditions = List.copyOf(conditions);
        tags = List.copyOf(tags);
    }

    /** Vrsta polja: predefinirani atributi ali dodatni atribut ({@code keyNorm}). */
    public enum Kind {
        FIRST_NAME,
        LAST_NAME,
        ADDRESS,
        EMAIL,
        PHONE,
        ATTRIBUTE
    }

    /** Polje pogoja ali razvrščanja; {@code keyNorm} je normaliziran ključ samo pri {@link Kind#ATTRIBUTE}. */
    public record Field(Kind kind, String keyNorm) {}

    /** Pogoj »polje vsebuje vrednost«. */
    public record Condition(Field field, String value) {}

    public enum Direction {
        ASC,
        DESC
    }
}
