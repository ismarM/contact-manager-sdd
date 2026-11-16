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
        return resolve(group, input, extras, stored, country, write, new HashMap<>());
    }

    /**
     * Uvoz (FR-016-24): isti postopek za nove kontakte iz datoteke; tip ključa se razreši enkrat za vso datoteko (ključi
     * v urejenem vrstnem redu {@code key_norm}, da sočasna uvoza ne zaideta v smrtni objem), prvi zahtevani tip
     * novega ključa velja za vse vrstice, drugačen zahtevani tip je {@code INVALID_VALUE} na {@code attributes[i].type}.
     * Rezultati so poravnani z {@code inputs}.
     */
    List<Resolution> resolveAll(
            UUID group, List<ContactInput> inputs, List<List<AttributeExtra>> extras, boolean write) {
        Map<String, AttributeType> wanted = new java.util.TreeMap<>();
        for (int c = 0; c < inputs.size(); c++) {
            List<Attribute> attributes = inputs.get(c).attributes();
            for (int i = 0; i < attributes.size(); i++) {
                AttributeExtra extra = i < extras.get(c).size() ? extras.get(c).get(i) : null;
                AttributeType requested = extra != null ? extra.type() : null;
                if (requested == null && attributes.get(i).parts() != null) {
                    requested = AttributeType.ADDRESS;
                }
                String norm = ContactInputParser.normalize(attributes.get(i).key());
                wanted.putIfAbsent(norm, null);
                if (requested != null && wanted.get(norm) == null) {
                    wanted.put(norm, requested);
                }
            }
        }
        Map<String, AttributeType> cache = new HashMap<>();
        wanted.forEach((norm, type) -> cache.put(norm, effective(group, norm, type, write)));
        List<Resolution> result = new ArrayList<>(inputs.size());
        for (int c = 0; c < inputs.size(); c++) {
            ContactInput input = inputs.get(c);
            result.add(resolve(group, input.attributes(), extras.get(c), List.of(), input.country(), write, cache));
        }
        return List.copyOf(result);
    }

    private Resolution resolve(
            UUID group,
            List<Attribute> input,
            List<AttributeExtra> extras,
            List<Attribute> stored,
            String country,
            boolean write,
            Map<String, AttributeType> cache) {
        List<Attribute> result = new ArrayList<>(input.size());
        List<FieldError> errors = new ArrayList<>();
        for (int i = 0; i < input.size(); i++) {
            Attribute attribute = input.get(i);
            AttributeExtra extra = i < extras.size() ? extras.get(i) : null;
            AttributeType requested = extra != null ? extra.type() : null;
            String norm = ContactInputParser.normalize(attribute.key());
            // Deli brez navedenega tipa pomenijo naslov (nov ali prost ključ dobi tip ADDRESS).
            AttributeType wanted = requested == null && attribute.parts() != null ? AttributeType.ADDRESS : requested;
            AttributeType effective = cache.computeIfAbsent(norm, n -> effective(group, n, wanted, write));
            String prefix = "attributes[" + i + "]";
            if (requested != null && requested != effective) {
                errors.add(new FieldError(prefix + ".type", "INVALID_VALUE"));
            }
            if (attribute.parts() != null) {
                // Razčlenjen naslov (016, FR-016-12): samo za ključ tipa ADDRESS; shranjeni deli ostanejo dobesedni.
                result.add(parts(attribute, effective, stored, norm, prefix, errors));
                continue;
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

    private static Attribute parts(
            Attribute attribute,
            AttributeType effective,
            List<Attribute> stored,
            String norm,
            String prefix,
            List<FieldError> errors) {
        if (effective != AttributeType.ADDRESS) {
            errors.add(new FieldError(prefix + ".parts", "INVALID_VALUE"));
            return new Attribute(attribute.key(), effective, null, attribute.parts());
        }
        for (Attribute old : stored) {
            if (ContactInputParser.normalize(old.key()).equals(norm)
                    && attribute.parts().equals(old.parts())) {
                return new Attribute(attribute.key(), effective, null, old.parts());
            }
        }
        TypedValues.AddressResult normalized = TypedValues.normalizeAddress(attribute.parts());
        if (!normalized.valid()) {
            normalized.errors().forEach(e -> errors.add(new FieldError(prefix + ".parts." + e.field(), e.code())));
            return new Attribute(attribute.key(), effective, null, attribute.parts());
        }
        return new Attribute(attribute.key(), effective, null, normalized.address());
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
