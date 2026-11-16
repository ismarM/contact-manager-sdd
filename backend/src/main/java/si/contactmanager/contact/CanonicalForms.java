package si.contactmanager.contact;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;
import si.contactmanager.contact.BulkEditInput.AttributeSet;

/**
 * Kanonični zapis ključev in značk skupine (FR-013-10, research R-05): ključ ali značka, ki ustreza obstoječemu zapisu
 * skupine brez razlike velikosti črk, se zamenja s pogostejšo različico (pri enakem številu z različico najstarejšega
 * kontakta). Zapis, ki ga kontakt že ima, se ne spremeni. Podatki, ki so že shranjeni, se nikoli ne spreminjajo.
 */
@Component
class CanonicalForms {

    private final ContactRepository contacts;

    CanonicalForms(ContactRepository contacts) {
        this.contacts = contacts;
    }

    /**
     * Atributi s kanoničnimi ključi; {@code stored}: dobesedni ključi, ki jih kontakt (pri združevanju: kateri koli
     * vključeni kontakt) že hrani in se ne spreminjajo.
     */
    List<Attribute> attributes(UUID group, List<Attribute> input, Collection<String> stored) {
        Set<String> exact = Set.copyOf(stored);
        List<String> norms = input.stream()
                .filter(a -> !exact.contains(a.key()))
                .map(a -> ContactInputParser.normalize(a.key()))
                .distinct()
                .toList();
        if (norms.isEmpty()) {
            return input;
        }
        Map<String, String> canonical = contacts.canonicalKeys(group, norms);
        List<Attribute> result = new ArrayList<>(input.size());
        for (Attribute attribute : input) {
            String key = exact.contains(attribute.key())
                    ? attribute.key()
                    : canonical.getOrDefault(ContactInputParser.normalize(attribute.key()), attribute.key());
            result.add(new Attribute(key, attribute.type(), attribute.value(), attribute.parts()));
        }
        return List.copyOf(result);
    }

    /** Značke s kanoničnim zapisom; {@code stored}: dobesedne značke, ki jih kontakt že hrani. */
    List<String> tags(UUID group, List<String> input, Collection<String> stored) {
        Set<String> exact = Set.copyOf(stored);
        List<String> norms = input.stream()
                .filter(t -> !exact.contains(t))
                .map(ContactInputParser::normalize)
                .distinct()
                .toList();
        if (norms.isEmpty()) {
            return input;
        }
        Map<String, String> canonical = contacts.canonicalTags(group, norms);
        List<String> result = new ArrayList<>(input.size());
        for (String tag : input) {
            result.add(exact.contains(tag) ? tag : canonical.getOrDefault(ContactInputParser.normalize(tag), tag));
        }
        return List.copyOf(result);
    }

    /**
     * Uvoz (FR-014-07): kanonični zapis za vse nove kontakte z dvema poizvedbama na kos (namesto dveh na kontakt);
     * pravilo je enako kot pri {@link #input} za nov kontakt.
     */
    List<ContactInput> inputs(UUID group, List<ContactInput> inputs) {
        Map<String, String> keys = new java.util.HashMap<>();
        Map<String, String> tags = new java.util.HashMap<>();
        List<String> keyNorms = inputs.stream()
                .flatMap(i -> i.attributes().stream())
                .map(a -> ContactInputParser.normalize(a.key()))
                .distinct()
                .toList();
        List<String> tagNorms = inputs.stream()
                .flatMap(i -> i.tags().stream())
                .map(ContactInputParser::normalize)
                .distinct()
                .toList();
        for (int from = 0; from < keyNorms.size(); from += NORM_CHUNK) {
            keys.putAll(contacts.canonicalKeys(
                    group, keyNorms.subList(from, Math.min(keyNorms.size(), from + NORM_CHUNK))));
        }
        for (int from = 0; from < tagNorms.size(); from += NORM_CHUNK) {
            tags.putAll(contacts.canonicalTags(
                    group, tagNorms.subList(from, Math.min(tagNorms.size(), from + NORM_CHUNK))));
        }
        List<ContactInput> result = new ArrayList<>(inputs.size());
        for (ContactInput input : inputs) {
            result.add(new ContactInput(
                    input.firstName(),
                    input.lastName(),
                    input.address(),
                    input.addressParts(),
                    input.email(),
                    input.phone(),
                    input.company(),
                    input.country(),
                    input.attributes().stream()
                            .map(a -> new Attribute(
                                    keys.getOrDefault(ContactInputParser.normalize(a.key()), a.key()),
                                    a.type(),
                                    a.value(),
                                    a.parts()))
                            .toList(),
                    input.tags().stream()
                            .map(t -> tags.getOrDefault(ContactInputParser.normalize(t), t))
                            .toList()));
        }
        return result;
    }

    /** Največ normaliziranih zapisov v eni poizvedbi (meja parametrov PostgreSQL). */
    private static final int NORM_CHUNK = 5000;

    /** Vnos z vsebino kontakta: atributi in značke s kanoničnim zapisom (ustvarjanje, urejanje, združevanje). */
    ContactInput input(UUID group, ContactInput input, Collection<String> storedKeys, Collection<String> storedTags) {
        return new ContactInput(
                input.firstName(),
                input.lastName(),
                input.address(),
                input.addressParts(),
                input.email(),
                input.phone(),
                input.company(),
                input.country(),
                attributes(group, input.attributes(), storedKeys),
                tags(group, input.tags(), storedTags));
    }

    /** Množično urejanje: ključi nastavitev in dodane značke s kanoničnim zapisom (odstranitev znack je po normalizirani obliki). */
    BulkEditInput bulk(UUID group, BulkEditInput edit) {
        List<AttributeSet> sets = new ArrayList<>(edit.attributes().size());
        List<Attribute> custom = new ArrayList<>();
        for (AttributeSet set : edit.attributes()) {
            if (set.field() == BulkEditInput.Field.CUSTOM) {
                custom.add(new Attribute(set.key(), set.value()));
            }
        }
        List<Attribute> canonical = attributes(group, custom, List.of());
        int index = 0;
        for (AttributeSet set : edit.attributes()) {
            if (set.field() == BulkEditInput.Field.CUSTOM) {
                sets.add(new AttributeSet(set.field(), canonical.get(index++).key(), set.value(), set.type()));
            } else {
                sets.add(set);
            }
        }
        return new BulkEditInput(
                edit.contactIds(), tags(group, edit.addTags(), List.of()), edit.removeTags(), List.copyOf(sets));
    }
}
