package si.contactmanager.contact;

import java.text.Normalizer;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Normalizirani ključ ujemanja po kategoriji (FR-011-03 … FR-011-06, research R-03): samo pravila iz specifikacije –
 * brez podobnosti, fonetike ali pretvorbe nacionalne oblike telefona.
 */
final class DuplicateKeys {

    private static final Pattern COMBINING_MARKS = Pattern.compile("\\p{M}+");
    private static final Pattern WHITESPACE_RUNS = Pattern.compile("[\\p{Z}\\s]+");
    private static final Pattern EDGE_WHITESPACE = Pattern.compile("^[\\p{Z}\\s]+|[\\p{Z}\\s]+$");
    private static final Pattern NON_DIGITS = Pattern.compile("[^0-9]");

    /** Ločilo med imenom in priimkom v ključu; ne more nastopiti v normaliziranem besedilu. */
    private static final char SEPARATOR = '\u0000';

    private DuplicateKeys() {}

    /** Ključ kategorije {@code name}, {@code email} ali {@code phone}; prazno = kontakt je izpuščen iz iskanja. */
    static Optional<String> key(String category, String first, String last, String email, String phone) {
        return switch (category) {
            case "name" -> name(first, last);
            case "email" -> email(email);
            case "phone" -> phone(phone);
            default -> throw new IllegalArgumentException("neznana kategorija: " + category);
        };
    }

    /** Vsaka komponenta posebej: NFD, brez kombinirnih znakov, male črke, strnjeni presledki, obrez. */
    private static Optional<String> name(String first, String last) {
        String f = component(first);
        String l = component(last);
        if (f.isEmpty() && l.isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(f + SEPARATOR + l);
    }

    private static String component(String value) {
        if (value == null) {
            return "";
        }
        String decomposed = Normalizer.normalize(value, Normalizer.Form.NFD);
        String bare = COMBINING_MARKS.matcher(decomposed).replaceAll("").toLowerCase(Locale.ROOT);
        return trim(WHITESPACE_RUNS.matcher(bare).replaceAll(" "));
    }

    /** Obrez, nato male črke; diakritik in notranjih presledkov se ne dotika. */
    private static Optional<String> email(String email) {
        if (email == null) {
            return Optional.empty();
        }
        String key = trim(email).toLowerCase(Locale.ROOT);
        return key.isEmpty() ? Optional.empty() : Optional.of(key);
    }

    /** Samo števke; vodilni {@code 00} se odstrani enkrat; brez števk = izpuščen. */
    private static Optional<String> phone(String phone) {
        if (phone == null) {
            return Optional.empty();
        }
        String digits = NON_DIGITS.matcher(phone).replaceAll("");
        if (digits.startsWith("00")) {
            digits = digits.substring(2);
        }
        return digits.isEmpty() ? Optional.empty() : Optional.of(digits);
    }

    private static String trim(String text) {
        return EDGE_WHITESPACE.matcher(text).replaceAll("");
    }
}
