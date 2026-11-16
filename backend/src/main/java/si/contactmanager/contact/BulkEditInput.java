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
        COMPANY,
        COUNTRY,
        CUSTOM
    }

    /** Nastavitev polja ali dodatnega atributa; {@code key} samo pri {@link Field#CUSTOM}, prazna vrednost odstrani; {@code type} samo pri novem ključu (016). */
    public record AttributeSet(Field field, String key, String value, AttributeType type, Address parts) {

        /** Nastavitev z deli naslova (016, FR-016-06): {@code value} je tedaj prazen, a to ni odstranitev. */
        public AttributeSet(Field field, String key, String value, AttributeType type) {
            this(field, key, value, type, null);
        }

        /** Odstranitev: prazna vrednost brez delov naslova. */
        public boolean removal() {
            return value.isEmpty() && parts == null;
        }

        /** Nastavitev brez tipa (tip obstoječega ključa ali {@code OTHER} za nov ključ). */
        public AttributeSet(Field field, String key, String value) {
            this(field, key, value, null);
        }
    }
}
