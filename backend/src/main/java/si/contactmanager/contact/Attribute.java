package si.contactmanager.contact;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Dodatni atribut s tipom (contracts/openapi.yaml – Attribute, 016). Natanko eno od {@code value} in {@code parts}:
 * {@code parts} samo pri razčlenjenem naslovu ({@code ADDRESS}). {@code type == null} (stari posnetki sledi pred 016)
 * pomeni {@code OTHER}. Tip je lastnost ključa v skupini; v posnetku je shranjen za prikaz in rollback.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record Attribute(String key, AttributeType type, String value, Address parts) {

    public Attribute {
        type = type == null ? AttributeType.OTHER : type;
    }

    /** Besedilni atribut tipa {@code OTHER} (pred 016 edina oblika). */
    public Attribute(String key, String value) {
        this(key, AttributeType.OTHER, value, null);
    }
}
