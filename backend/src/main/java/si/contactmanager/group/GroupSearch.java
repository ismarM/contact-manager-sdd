package si.contactmanager.group;

import java.text.Normalizer;
import java.util.Locale;

/**
 * Iskanje skupin po nazivu brez razlike velikosti črk in šumnikov (FR-017-14). Normalizacija je ista v bazi
 * ({@code translate(lower(naziv), …)}, brez migracije in razširitve) in v Javi ({@link Normalizer}): preslikava znakov
 * z diakritiko je izpeljana iz iste tabele, zato se naziv in iskani niz vedno normalizirata enako. Poizvedba uporablja
 * {@code strpos}, zato posebni znaki ({@code %}, {@code _}, {@code \}) ne potrebujejo ubežanja.
 */
final class GroupSearch {

    static final int MAX_LENGTH = 100;

    private static final String FROM;
    private static final String TO;

    static {
        StringBuilder from = new StringBuilder();
        StringBuilder to = new StringBuilder();
        for (char c = 0xC0; c <= 0x24F; c++) {
            if (Character.toLowerCase(c) != c || !Character.isLetter(c)) {
                continue;
            }
            String base = base(c);
            if (base.length() == 1 && base.charAt(0) != c) {
                from.append(c);
                to.append(base);
            }
        }
        FROM = from.toString();
        TO = to.toString();
    }

    private GroupSearch() {}

    /** Znak brez diakritike; črke, ki se ne razgradijo (đ, ł, ø …), so preslikane ročno. */
    private static String base(char c) {
        return switch (c) {
            case 'đ' -> "d";
            case 'ł' -> "l";
            case 'ø' -> "o";
            case 'ħ' -> "h";
            case 'ŧ' -> "t";
            case 'ı' -> "i";
            default ->
                Normalizer.normalize(String.valueOf(c), Normalizer.Form.NFD).replaceAll("\\p{M}+", "");
        };
    }

    /** Iskani niz: obrezan, male črke, brez diakritike (enako kot izraz v bazi). */
    static String normalize(String text) {
        String lower = text.toLowerCase(Locale.ROOT);
        StringBuilder out = new StringBuilder(lower.length());
        for (int i = 0; i < lower.length(); i++) {
            char c = lower.charAt(i);
            int index = FROM.indexOf(c);
            out.append(index >= 0 ? TO.charAt(index) : c);
        }
        return Normalizer.normalize(out, Normalizer.Form.NFD).replaceAll("\\p{M}+", "");
    }

    /** SQL izraz normaliziranega naziva; konstante so iz zaprte tabele, brez uporabniškega vnosa. */
    static String titleExpression(String column) {
        return "translate(lower(" + column + "), '" + FROM + "', '" + TO + "')";
    }

    /** Pogoj {@code strpos} za parameter {@code :q}; prazen niz, kadar iskanja ni. */
    static String condition(String normalized) {
        return normalized == null ? "" : " AND strpos(" + titleExpression("g.title") + ", :q) > 0";
    }
}
