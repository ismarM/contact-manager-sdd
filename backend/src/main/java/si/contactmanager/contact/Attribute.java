package si.contactmanager.contact;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Dodatni atribut s tipom (contracts/openapi.yaml – Attribute, 016). Natanko eno od {@code value} in {@code parts}:
 * {@code parts} samo pri razčlenjenem naslovu ({@code ADDRESS}). {@code type == null} (stari posnetki sledi pred 016)
 * pomeni {@code OTHER}. Tip je lastnost ključa v skupini; v posnetku je shranjen za prikaz in rollback.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record Attribute(
        String key,
        // Do zgodbe US1 (T012) odgovori API tipa še ne razkrivajo: OTHER se ne zapiše (obstoječe pogodbe ostanejo
        // enake);
        // tip ni v JSON → ob branju je OTHER. US1 filter odstrani in odgovori tip vedno vsebujejo.
        @JsonInclude(value = JsonInclude.Include.CUSTOM, valueFilter = Attribute.OtherFilter.class)
        AttributeType type,

        String value,
        Address parts) {

    /** Filter za {@code @JsonInclude(CUSTOM)}: {@code equals} je resničen za vrednost, ki se izpusti. */
    static final class OtherFilter {
        @Override
        public boolean equals(Object other) {
            return other == AttributeType.OTHER;
        }

        @Override
        public int hashCode() {
            return 0;
        }
    }

    public Attribute {
        type = type == null ? AttributeType.OTHER : type;
    }

    /** Besedilni atribut tipa {@code OTHER} (pred 016 edina oblika). */
    public Attribute(String key, String value) {
        this(key, AttributeType.OTHER, value, null);
    }
}
