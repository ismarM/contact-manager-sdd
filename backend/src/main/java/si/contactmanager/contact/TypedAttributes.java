package si.contactmanager.contact;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;
import si.contactmanager.contact.ContactInputParser.AttributeExtra;
import si.contactmanager.shared.error.ValidationError.FieldError;

/**
 * Tip ključa in vrednost dodatnih atributov kontakta (016, FR-016-01, -02, -04): tip je lastnost ključa v skupini
 * ({@code attribute_key}); vnos ga lahko določi samo za nov ali prost ključ, sicer mora biti enak tipu ključa v
 * uporabi ({@code INVALID_VALUE} na {@code attributes[i].type}). Vrednost se preveri in normalizira po tipu; vrednost,
 * ki jo kontakt že hrani nespremenjeno, se ne preverja (FR-016-09). Opombe so dobesedne.
 */
@Component
class TypedAttributes {

    /** Atributi z učinkovitimi tipi in normaliziranimi vrednostmi ter napake po {@code attributes[i]}. */
    record Resolution(List<Attribute> attributes, List<FieldError> errors) {}

    private final AttributeKeyRepository keys;

    TypedAttributes(AttributeKeyRepository keys) {
        this.keys = keys;
    }

    /**
     * Razreši tipe in normalizira vrednosti. {@code write == false}: samo branje (primerjava z obstoječim stanjem,
     * vrstni red preverjanj §2.2); {@code write == true}: vrstice ključev se zagotovijo z zaklepom {@code FOR SHARE}
     * (obdajajoča transakcija). {@code stored}: atributi, ki jih kontakt že ima; {@code country}: koda države kontakta.
     */
    Resolution resolve(
            UUID group,
            List<Attribute> input,
            List<AttributeExtra> extras,
            List<Attribute> stored,
            String country,
            boolean write) {
        List<Attribute> result = new ArrayList<>(input.size());
        List<FieldError> errors = new ArrayList<>();
        Map<String, AttributeType> cache = new HashMap<>();
        for (int i = 0; i < input.size(); i++) {
            Attribute attribute = input.get(i);
            AttributeExtra extra = i < extras.size() ? extras.get(i) : null;
            AttributeType requested = extra != null ? extra.type() : null;
            String norm = ContactInputParser.normalize(attribute.key());
            AttributeType effective = cache.computeIfAbsent(norm, n -> effective(group, n, requested, write));
            String prefix = "attributes[" + i + "]";
            if (requested != null && requested != effective) {
                errors.add(new FieldError(prefix + ".type", "INVALID_VALUE"));
            }
            String candidate = effective == AttributeType.NOTES && extra != null ? extra.raw() : attribute.value();
            if (isStored(stored, norm, effective, candidate)) {
                result.add(new Attribute(attribute.key(), effective, candidate, null));
                continue;
            }
            TypedValues.Result normalized = TypedValues.normalize(effective, candidate, country);
            if (normalized.valid()) {
                result.add(new Attribute(attribute.key(), effective, normalized.value(), null));
            } else {
                errors.add(new FieldError(prefix + ".value", normalized.error()));
                result.add(new Attribute(attribute.key(), effective, attribute.value(), null));
            }
        }
        return new Resolution(List.copyOf(result), List.copyOf(errors));
    }

    /** Učinkoviti tip ključa: vrstica ključa, nov ali prost ključ prevzame zahtevani tip (ali {@code OTHER}). */
    AttributeType effective(UUID group, String norm, AttributeType requested, boolean write) {
        Optional<AttributeKeyRepository.Row> row = keys.find(group, norm);
        if (row.isEmpty() && !keys.isFree(group, norm)) {
            // Ključ v uporabi brez vrstice (poti brez razreševanja tipov): vrednosti so besedilo, tip OTHER.
            if (write) {
                keys.register(group, norm);
                row = keys.find(group, norm);
            } else {
                return AttributeType.OTHER;
            }
        }
        if (write) {
            AttributeType wanted = requested != null
                    ? requested
                    : row.map(AttributeKeyRepository.Row::type).orElse(AttributeType.OTHER);
            return keys.ensure(group, norm, wanted);
        }
        if (row.isEmpty()) {
            return requested != null ? requested : AttributeType.OTHER;
        }
        if (requested != null && keys.isFree(group, norm)) {
            return requested;
        }
        return row.get().type();
    }

    private static boolean isStored(List<Attribute> stored, String norm, AttributeType type, String value) {
        for (Attribute attribute : stored) {
            if (ContactInputParser.normalize(attribute.key()).equals(norm)
                    && attribute.type() == type
                    && Objects.equals(attribute.value(), value)) {
                return true;
            }
        }
        return false;
    }
}
