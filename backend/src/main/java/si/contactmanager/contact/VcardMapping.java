package si.contactmanager.contact;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Skupna pravila preslikave kontakt ↔ vCard (014 research R-03), ki jih uporabljata {@link VcardWriter} in
 * {@link VcardReader}; enaka pravila ima frontend ({@code features/contacts/qr/vcardRead.ts}, {@code vcardWrite.ts}),
 * skladnost varujejo skupne vizitke v {@code backend/src/test/resources/vcard/}.
 */
final class VcardMapping {

    /** Lastnosti dodatnega atributa: par v isti skupini vCard. */
    static final String KEY = "X-CM-KEY";

    static final String VALUE = "X-CM-VALUE";

    /** Oznaka ključa dodatnega atributa s tipom (016): {@code attrN.X-CM-KEY} ob lastnosti {@code TEL}, {@code EMAIL}, … */
    static final String LABEL = "X-ABLabel";

    /** Parameter {@code ADR}: naslov je po delih (tudi kadar je izpolnjena samo ulica), 016. */
    static final String PARTS = "X-CM-PARTS";

    /** Parameter {@code ADR}: koda države ISO v delih naslova (016); {@code X-CM-CC} je država kontakta. */
    static final String PARTS_COUNTRY = "X-CM-PC";

    /** Parameter {@code ADR} s kodo države ISO za točen krožni prenos. */
    static final String COUNTRY_CODE = "X-CM-CC";

    /** Oznake atributov iz vizitke v jeziku vmesnika (FR-014-13). */
    record Labels(String email, String phone, String address, String birthday, String website, String note) {}

    private static final Labels SL =
            new Labels("E-naslov", "Telefon", "Naslov", "Rojstni dan", "Spletna stran", "Opomba");

    private static final Labels EN = new Labels("Email", "Phone", "Address", "Birthday", "Website", "Note");

    private VcardMapping() {}

    static Labels labels(String language) {
        return "en".equals(language) ? EN : SL;
    }

    /** Ubežni znaki besedilne vrednosti vCard 3.0 ({@code \ , ; } in prelom vrstice). */
    static String escape(String value) {
        StringBuilder out = new StringBuilder(value.length() + 8);
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '\\' -> out.append("\\\\");
                case ',' -> out.append("\\,");
                case ';' -> out.append("\\;");
                case '\n' -> out.append("\\n");
                case '\r' -> {
                    // prelom je že zapisan kot \n
                }
                default -> out.append(c);
            }
        }
        return out.toString();
    }

    /** Obratno od {@link #escape}: {@code \n}/{@code \N} → prelom, {@code \x} → {@code x}. */
    static String unescape(String value) {
        StringBuilder out = new StringBuilder(value.length());
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c == '\\' && i + 1 < value.length()) {
                char next = value.charAt(++i);
                out.append(next == 'n' || next == 'N' ? '\n' : next);
            } else {
                out.append(c);
            }
        }
        return out.toString();
    }

    /** Polno ime iz {@code FN}: zadnja beseda je priimek, ostalo ime (FR-014-13). */
    static String[] splitFullName(String full) {
        String text = full == null ? "" : full.strip().replaceAll("\\s+", " ");
        int space = text.lastIndexOf(' ');
        if (text.isEmpty()) {
            return new String[] {null, null};
        }
        if (space < 0) {
            return new String[] {null, text};
        }
        return new String[] {text.substring(0, space), text.substring(space + 1)};
    }

    /** Značka iz kategorije: presledki → {@code -}; prazna kategorija se izpusti. */
    static String tag(String category) {
        String text = category == null ? "" : category.strip();
        return text.isEmpty() ? null : text.replaceAll("\\s+", "-");
    }

    /** Seznam atributov z dodajanjem pod prostim ključem ({@code Osnova}, {@code Osnova 2}, …). */
    static final class AttributeList {

        private final List<Attribute> attributes = new ArrayList<>();
        private final Set<String> keys = new HashSet<>();

        void add(String key, String value) {
            add(key, AttributeType.OTHER, value, null);
        }

        /** Atribut s tipom: besedilna vrednost ali (samo naslov) deli. */
        void add(String key, AttributeType type, String value, Address parts) {
            boolean empty = parts == null && (value == null || value.isBlank());
            if (key == null || empty || !keys.add(norm(key))) {
                return;
            }
            attributes.add(new Attribute(key, type, parts == null ? value : null, parts));
        }

        /** Prvi prost ključ od {@code base n} naprej ({@code n = 1} pomeni golo osnovo). */
        void addNumbered(String base, int from, AttributeType type, String value) {
            if (value == null || value.isBlank()) {
                return;
            }
            int n = from;
            while (keys.contains(norm(numbered(base, n)))) {
                n++;
            }
            add(numbered(base, n), type, value, null);
        }

        List<Attribute> list() {
            return List.copyOf(attributes);
        }

        private static String numbered(String base, int n) {
            return n <= 1 ? base : base + " " + n;
        }

        private static String norm(String key) {
            return key.toLowerCase(Locale.ROOT);
        }
    }
}
