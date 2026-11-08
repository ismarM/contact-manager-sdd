package si.contactmanager.audit;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import si.contactmanager.audit.ChangeField.Field;
import si.contactmanager.contact.Attribute;
import si.contactmanager.contact.ContactState;

/**
 * Izpeljava spremenjenih polj iz stanj prej/potem (research R-03). Vrstni red: ime, priimek, naslov, e-naslov, telefon,
 * dodatni atributi (ključi iz stanja prej, nato novi; ključ se primerja točno) in značke. Metapodatki niso polja.
 */
final class ChangeDiff {

    private ChangeDiff() {}

    static List<ChangeField> fields(ContactState before, ContactState after) {
        List<ChangeField> fields = new ArrayList<>();
        scalar(fields, Field.FIRST_NAME, value(before, Field.FIRST_NAME), value(after, Field.FIRST_NAME));
        scalar(fields, Field.LAST_NAME, value(before, Field.LAST_NAME), value(after, Field.LAST_NAME));
        scalar(fields, Field.ADDRESS, value(before, Field.ADDRESS), value(after, Field.ADDRESS));
        scalar(fields, Field.EMAIL, value(before, Field.EMAIL), value(after, Field.EMAIL));
        scalar(fields, Field.PHONE, value(before, Field.PHONE), value(after, Field.PHONE));
        attributes(
                fields,
                before == null ? List.of() : before.attributes(),
                after == null ? List.of() : after.attributes());
        tags(fields, before, after);
        return fields;
    }

    private static String value(ContactState state, Field field) {
        if (state == null) {
            return null;
        }
        return switch (field) {
            case FIRST_NAME -> state.firstName();
            case LAST_NAME -> state.lastName();
            case ADDRESS -> state.address();
            case EMAIL -> state.email();
            case PHONE -> state.phone();
            default -> null;
        };
    }

    private static void scalar(List<ChangeField> fields, Field field, String before, String after) {
        if (!Objects.equals(before, after)) {
            fields.add(new ChangeField(field, null, before, after));
        }
    }

    private static void attributes(List<ChangeField> fields, List<Attribute> before, List<Attribute> after) {
        Map<String, String> was = new LinkedHashMap<>();
        before.forEach(a -> was.put(a.key(), a.value()));
        Map<String, String> is = new LinkedHashMap<>();
        after.forEach(a -> is.put(a.key(), a.value()));
        Set<String> keys = new LinkedHashSet<>(was.keySet());
        keys.addAll(is.keySet());
        for (String key : keys) {
            String b = was.get(key);
            String a = is.get(key);
            if (!Objects.equals(b, a)) {
                fields.add(new ChangeField(Field.ATTRIBUTE, key, b, a));
            }
        }
    }

    private static void tags(List<ChangeField> fields, ContactState before, ContactState after) {
        List<String> was = before == null ? null : before.tags();
        List<String> is = after == null ? null : after.tags();
        if (before == null || after == null) {
            List<String> present = before == null ? is : was;
            if (present != null && !present.isEmpty()) {
                fields.add(new ChangeField(Field.TAGS, null, was, is));
            }
            return;
        }
        if (!was.equals(is)) {
            fields.add(new ChangeField(Field.TAGS, null, was, is));
        }
    }
}
