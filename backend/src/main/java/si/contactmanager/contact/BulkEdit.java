package si.contactmanager.contact;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import si.contactmanager.contact.BulkEditInput.AttributeSet;
import si.contactmanager.shared.error.ValidationError.FieldError;

/** Čista funkcija množičnega urejanja (research R-04): brez stanja in brez baze. */
public final class BulkEdit {

    private BulkEdit() {}

    /** Končno stanje kontakta: odstrani značke → dodaj značke → nastavi atribute. */
    public static ContactState apply(ContactState before, BulkEditInput edit) {
        return apply(before, edit, java.util.Map.of());
    }

    /**
     * Kot {@link #apply(ContactState, BulkEditInput)}, s tipi ključev (016): {@code types} so učinkoviti tipi
     * normaliziranih ključev; vrednost se normalizira po tipu in državi kontakta po vseh nastavitvah (neveljavna
     * ostane dobesedna – napake vrne {@link #typedErrors}).
     */
    public static ContactState apply(
            ContactState before, BulkEditInput edit, java.util.Map<String, AttributeType> types) {
        Set<String> removed =
                edit.removeTags().stream().map(ContactInputParser::normalize).collect(Collectors.toSet());
        List<String> tags = new ArrayList<>();
        Set<String> present = new java.util.HashSet<>();
        for (String tag : before.tags()) {
            String normalized = ContactInputParser.normalize(tag);
            if (!removed.contains(normalized)) {
                tags.add(tag);
                present.add(normalized);
            }
        }
        for (String tag : edit.addTags()) {
            if (present.add(ContactInputParser.normalize(tag))) {
                tags.add(tag);
            }
        }

        String address = before.address();
        Address addressParts = before.addressParts();
        String email = before.email();
        String phone = before.phone();
        String company = before.company();
        String country = before.country();
        String finalCountry = finalCountry(before, edit);
        List<Attribute> attributes = new ArrayList<>(before.attributes());
        for (AttributeSet set : edit.attributes()) {
            switch (set.field()) {
                case ADDRESS -> {
                    // Natanko ena oblika naslova (016): besedilo ali deli.
                    address = emptyToNull(set.value());
                    addressParts = set.parts() != null ? normalizedParts(set.parts()) : null;
                }
                case EMAIL -> email = emptyToNull(set.value());
                case PHONE -> phone = emptyToNull(set.value());
                case COMPANY -> company = emptyToNull(set.value());
                case COUNTRY -> country = emptyToNull(set.value());
                case CUSTOM -> setCustom(attributes, set, types, finalCountry);
            }
        }
        return new ContactState(
                before.firstName(),
                before.lastName(),
                address,
                addressParts,
                email,
                phone,
                company,
                country,
                List.copyOf(attributes),
                List.copyOf(tags),
                before.version(),
                before.createdAt(),
                before.updatedAt(),
                before.updatedById());
    }

    /** Ali se vsebina (polja, atributi, značke v vrstnem redu) razlikuje; metapodatki se ne primerjajo. */
    public static boolean changed(ContactState before, ContactState after) {
        return !(Objects.equals(before.firstName(), after.firstName())
                && Objects.equals(before.lastName(), after.lastName())
                && Objects.equals(before.address(), after.address())
                && Objects.equals(before.addressParts(), after.addressParts())
                && Objects.equals(before.email(), after.email())
                && Objects.equals(before.phone(), after.phone())
                && Objects.equals(before.company(), after.company())
                && Objects.equals(before.country(), after.country())
                && before.attributes().equals(after.attributes())
                && before.tags().equals(after.tags()));
    }

    /** Napake končnega stanja: {@code tags} in {@code attributes} {@code TOO_MANY}. */
    public static List<FieldError> violations(ContactState after) {
        List<FieldError> errors = new ArrayList<>();
        if (after.tags().size() > ContactInputParser.TAGS_MAX) {
            errors.add(new FieldError("tags", "TOO_MANY"));
        }
        if (after.attributes().size() > ContactInputParser.ATTRIBUTES_MAX) {
            errors.add(new FieldError("attributes", "TOO_MANY"));
        }
        return errors;
    }

    /** Država kontakta po vseh nastavitvah (zadnja nastavitev države zmaga). */
    private static String finalCountry(ContactState before, BulkEditInput edit) {
        String country = before.country();
        for (AttributeSet set : edit.attributes()) {
            if (set.field() == BulkEditInput.Field.COUNTRY) {
                country = emptyToNull(set.value());
            }
        }
        return country;
    }

    /**
     * Napake vrednosti po tipu ključa za en kontakt (016, FR-016-06): {@code attributes[i].value} z kodo
     * {@code INVALID_VALUE} ali {@code TOO_LONG}; indeks je položaj nastavitve v zahtevku.
     */
    public static List<FieldError> typedErrors(
            ContactState before, BulkEditInput edit, java.util.Map<String, AttributeType> types) {
        List<FieldError> errors = new ArrayList<>();
        String country = finalCountry(before, edit);
        for (int i = 0; i < edit.attributes().size(); i++) {
            AttributeSet set = edit.attributes().get(i);
            if (set.parts() != null) {
                for (FieldError error :
                        TypedValues.normalizeAddress(set.parts()).errors()) {
                    errors.add(new FieldError("attributes[" + i + "].parts." + error.field(), error.code()));
                }
                continue;
            }
            if (set.field() != BulkEditInput.Field.CUSTOM || set.value().isEmpty()) {
                continue;
            }
            AttributeType type = types.getOrDefault(ContactInputParser.normalize(set.key()), AttributeType.OTHER);
            TypedValues.Result result = TypedValues.normalize(type, set.value(), country);
            if (!result.valid()) {
                errors.add(new FieldError("attributes[" + i + "].value", result.error()));
            }
        }
        return errors;
    }

    /** Normalizirani deli naslova; neveljavni ostanejo dobesedni (napako vrne {@link #typedErrors}). */
    private static Address normalizedParts(Address parts) {
        TypedValues.AddressResult result = TypedValues.normalizeAddress(parts);
        return result.valid() ? result.address() : parts;
    }

    private static String emptyToNull(String value) {
        return value == null || value.isEmpty() ? null : value;
    }

    /** Obstoječ ključ (normaliziran): nova vrednost in zapis ključa na istem položaju; prazna vrednost odstrani. */
    private static void setCustom(
            List<Attribute> attributes, AttributeSet set, java.util.Map<String, AttributeType> types, String country) {
        String normalized = ContactInputParser.normalize(set.key());
        if (set.parts() != null) {
            Attribute written = new Attribute(set.key(), AttributeType.ADDRESS, null, normalizedParts(set.parts()));
            for (int i = 0; i < attributes.size(); i++) {
                if (ContactInputParser.normalize(attributes.get(i).key()).equals(normalized)) {
                    if (!written.parts().equals(attributes.get(i).parts())) {
                        attributes.set(i, written);
                    }
                    return;
                }
            }
            attributes.add(written);
            return;
        }
        for (int i = 0; i < attributes.size(); i++) {
            if (ContactInputParser.normalize(attributes.get(i).key()).equals(normalized)) {
                if (set.value().isEmpty()) {
                    attributes.remove(i);
                } else {
                    AttributeType type =
                            types.getOrDefault(normalized, attributes.get(i).type());
                    String value = typedValue(type, set.value(), country);
                    if (!value.equals(attributes.get(i).value())) {
                        // Enaka vrednost ni sprememba (FR-009-12): zapis ključa ostane, kot je.
                        attributes.set(i, new Attribute(set.key(), type, value, null));
                    }
                }
                return;
            }
        }
        if (!set.value().isEmpty()) {
            AttributeType type = types.getOrDefault(normalized, AttributeType.OTHER);
            attributes.add(new Attribute(set.key(), type, typedValue(type, set.value(), country), null));
        }
    }

    /** Normalizirana vrednost po tipu; neveljavna ostane dobesedna (napako vrne {@link #typedErrors}). */
    private static String typedValue(AttributeType type, String value, String country) {
        TypedValues.Result result = TypedValues.normalize(type, value, country);
        return result.valid() ? result.value() : value;
    }
}
