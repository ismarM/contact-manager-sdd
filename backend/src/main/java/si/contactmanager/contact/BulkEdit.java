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
        String email = before.email();
        String phone = before.phone();
        List<Attribute> attributes = new ArrayList<>(before.attributes());
        for (AttributeSet set : edit.attributes()) {
            switch (set.field()) {
                case ADDRESS -> address = emptyToNull(set.value());
                case EMAIL -> email = emptyToNull(set.value());
                case PHONE -> phone = emptyToNull(set.value());
                case CUSTOM -> setCustom(attributes, set);
            }
        }
        return new ContactState(
                before.firstName(),
                before.lastName(),
                address,
                email,
                phone,
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
                && Objects.equals(before.email(), after.email())
                && Objects.equals(before.phone(), after.phone())
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

    private static String emptyToNull(String value) {
        return value == null || value.isEmpty() ? null : value;
    }

    /** Obstoječ ključ (normaliziran): nova vrednost in zapis ključa na istem položaju; prazna vrednost odstrani. */
    private static void setCustom(List<Attribute> attributes, AttributeSet set) {
        String normalized = ContactInputParser.normalize(set.key());
        for (int i = 0; i < attributes.size(); i++) {
            if (ContactInputParser.normalize(attributes.get(i).key()).equals(normalized)) {
                if (set.value().isEmpty()) {
                    attributes.remove(i);
                } else if (!attributes.get(i).value().equals(set.value())) {
                    // Enaka vrednost ni sprememba (FR-009-12): zapis ključa ostane, kot je.
                    attributes.set(i, new Attribute(set.key(), set.value()));
                }
                return;
            }
        }
        if (!set.value().isEmpty()) {
            attributes.add(new Attribute(set.key(), set.value()));
        }
    }
}
