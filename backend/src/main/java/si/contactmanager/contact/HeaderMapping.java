package si.contactmanager.contact;

import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Predlagana preslikava glav Excela na polja kontakta (FR-014-02): glave izvoza 010/013 v sl in en (brez razlike
 * velikosti črk) in rezervirana imena (FR-013-08, Edge Cases) na predefinirana polja; predefinirano polje dobi samo prvi
 * stolpec (naslednji z isto glavo ostanejo neuvoženi); ostale glave so dodatni atribut s ključem, enakim glavi.
 */
final class HeaderMapping {

    enum Target {
        FIRST_NAME,
        LAST_NAME,
        ADDRESS,
        EMAIL,
        PHONE,
        COUNTRY,
        COMPANY,
        TAGS,
        ATTRIBUTE,
        SKIP
    }

    record Suggestion(int column, Target target, String key) {}

    private static final Map<String, Target> KNOWN = new HashMap<>();

    static {
        List<Target> leading = List.of(
                Target.FIRST_NAME,
                Target.LAST_NAME,
                Target.ADDRESS,
                Target.EMAIL,
                Target.PHONE,
                Target.COUNTRY,
                Target.COMPANY);
        for (String language : List.of("sl", "en")) {
            ExportLabels.Headers headers = ExportLabels.headers(language);
            for (int i = 0; i < leading.size(); i++) {
                KNOWN.put(AttributeKeys.reservedForm(headers.leading().get(i)), leading.get(i));
            }
            KNOWN.put(AttributeKeys.reservedForm(headers.tags()), Target.TAGS);
        }
        KNOWN.put("e-mail", Target.EMAIL);
        KNOWN.put("e-pošta", Target.EMAIL);
    }

    private HeaderMapping() {}

    static List<Suggestion> suggest(List<String> headers) {
        Set<Target> used = EnumSet.noneOf(Target.class);
        List<Suggestion> suggestions = new ArrayList<>(headers.size());
        for (int i = 0; i < headers.size(); i++) {
            String header = headers.get(i);
            Target known = KNOWN.get(AttributeKeys.reservedForm(header));
            if (known != null) {
                suggestions.add(
                        used.add(known) ? new Suggestion(i, known, null) : new Suggestion(i, Target.SKIP, null));
            } else {
                suggestions.add(new Suggestion(i, Target.ATTRIBUTE, header));
            }
        }
        return List.copyOf(suggestions);
    }
}
