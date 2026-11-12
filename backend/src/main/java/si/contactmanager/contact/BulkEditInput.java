package si.contactmanager.contact;

import java.util.List;
import java.util.UUID;

/**
 * Telo {@code POST …/contacts/bulk-update} po razčlenitvi (data-model.md – BulkEditInput): vrednosti obrezane, seznami
 * neničelni.
 */
public record BulkEditInput(
        List<UUID> contactIds, List<String> addTags, List<String> removeTags, List<AttributeSet> attributes) {

    /** Polje, ki ga je mogoče množično nastaviti; {@code firstName} in {@code lastName} ne. */
    public enum Field {
        ADDRESS,
        EMAIL,
        PHONE,
        CUSTOM
    }

    /** Nastavitev polja ali dodatnega atributa; {@code key} samo pri {@link Field#CUSTOM}, prazna vrednost odstrani. */
    public record AttributeSet(Field field, String key, String value) {}
}
