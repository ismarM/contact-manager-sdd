package si.contactmanager.contact;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import si.contactmanager.shared.error.ValidationError.FieldError;

/**
 * Rezervirana imena ključev, ki so od 013 dodana poleg imen starejših predefiniranih polj (FR-013-08, research R-06):
 * nov ali spremenjen ključ s tem imenom je zavrnjen, obstoječi atributi z njim pa ostanejo. Starejših enajst imen
 * preverja {@link ContactInputParser#RESERVED_KEYS}.
 */
final class AttributeKeys {

    /** Imena novih predefiniranih polj v obeh jezikih (normalizirana: male črke, en presledek). */
    static final Set<String> NEW_RESERVED = Set.of("država", "country", "podjetje", "company");

    /** Vseh petnajst rezerviranih imen (predlogi jih ne ponujajo, FR-013-09). */
    static final Set<String> ALL_RESERVED;

    static {
        Set<String> all = new HashSet<>(ContactInputParser.RESERVED_KEYS);
        all.addAll(NEW_RESERVED);
        ALL_RESERVED = Set.copyOf(all);
    }

    private AttributeKeys() {}

    /** Normalizirana oblika za primerjavo s seznamom rezerviranih imen: male črke, strnjeni presledki. */
    static String reservedForm(String key) {
        return ContactInputParser.SPACES
                .matcher(ContactInputParser.normalize(key).strip())
                .replaceAll(" ");
    }

    /** Normalizirani ključi iz seznama atributov (za {@code held} pri {@link #reservedErrors}). */
    static Set<String> normalizedKeys(Collection<Attribute> attributes) {
        Set<String> keys = new HashSet<>();
        for (Attribute attribute : attributes) {
            keys.add(ContactInputParser.normalize(attribute.key()));
        }
        return keys;
    }

    /**
     * Napake {@code RESERVED_KEY} za atribute z novim rezerviranim imenom, ki ga kontakt še nima ({@code held}: njegovi
     * normalizirani ključi; pri združevanju ključi vseh vključenih kontaktov). Polje napake je
     * {@code attributes[i].key} kot v {@link ContactInputParser}.
     */
    static List<FieldError> reservedErrors(List<Attribute> attributes, Set<String> held) {
        List<FieldError> errors = new ArrayList<>();
        for (int i = 0; i < attributes.size(); i++) {
            String key = attributes.get(i).key();
            if (NEW_RESERVED.contains(reservedForm(key)) && !held.contains(ContactInputParser.normalize(key))) {
                errors.add(new FieldError("attributes[" + i + "].key", "RESERVED_KEY"));
            }
        }
        return errors;
    }
}
