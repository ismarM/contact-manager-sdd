package si.contactmanager.contact;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Države po ISO 3166-1 alpha-2 (docs/specs/013-pametni-atributi, FR-013-03, -13, -19; research R-01, R-03, R-07): seznam
 * uradnih kod, imena v slovenščini in angleščini, iskanje po imenu in kodi ter prepoznavanje države iz besedila.
 * Javna enota, ki jo ponovno uporabi uvoz (014). Prepoznavanje nikoli ne ugiba: samo natančno ujemanje je
 * {@link Resolution.Found}; delno ujemanje je {@link Resolution.Ambiguous}, brez ujemanja {@link Resolution.Unknown}.
 */
public final class CountryNames {

    /** Največ kandidatov pri dvoumnem izidu. */
    public static final int MAX_CANDIDATES = 10;

    /** Najmanj znakov besedila za delno ujemanje (krajše besedilo ne ujame ničesar razen natančnega). */
    private static final int MIN_PARTIAL = 3;

    private static final Pattern COMBINING_MARKS = Pattern.compile("\\p{M}+");
    private static final Pattern SPACES = Pattern.compile("[\\p{Z}\\s]+");

    private static final Locale SL = Locale.forLanguageTag("sl");
    private static final Locale EN = Locale.forLanguageTag("en");

    /** Uveljavljene alternativne oblike (normalizirane) → koda; zaprt seznam. */
    private static final Map<String, String> ALIASES = Map.ofEntries(
            Map.entry("uk", "GB"),
            Map.entry("u.k.", "GB"),
            Map.entry("great britain", "GB"),
            Map.entry("england", "GB"),
            Map.entry("velika britanija", "GB"),
            Map.entry("usa", "US"),
            Map.entry("u.s.a.", "US"),
            Map.entry("united states of america", "US"),
            Map.entry("zda", "US"),
            Map.entry("czech republic", "CZ"),
            Map.entry("ceska republika", "CZ"),
            Map.entry("macedonia", "MK"),
            Map.entry("severna makedonija", "MK"),
            Map.entry("makedonija", "MK"),
            Map.entry("holland", "NL"),
            Map.entry("nizozemska", "NL"),
            Map.entry("bosna in hercegovina", "BA"),
            Map.entry("bih", "BA"),
            Map.entry("uae", "AE"));

    private static final List<String> CODES = List.copyOf(Arrays.stream(Locale.getISOCountries())
            .filter(code -> code.length() == 2)
            .sorted()
            .toList());
    private static final Set<String> CODE_SET = Set.copyOf(CODES);

    /** Normalizirano ime (sl, en) → kode, ki ga imajo; ujemanje je natančno. */
    private static final Map<String, Set<String>> EXACT = new HashMap<>();

    /** Koda → normalizirana imena (sl, en), za delno ujemanje. */
    private static final Map<String, List<String>> NAMES = new LinkedHashMap<>();

    static {
        for (String code : CODES) {
            Locale country = new Locale.Builder().setRegion(code).build();
            List<String> names = new ArrayList<>();
            for (Locale language : List.of(SL, EN)) {
                String name = normalize(country.getDisplayCountry(language));
                if (!name.isEmpty() && !name.equals(normalize(code)) && !names.contains(name)) {
                    names.add(name);
                }
            }
            NAMES.put(code, List.copyOf(names));
            names.forEach(name ->
                    EXACT.computeIfAbsent(name, k -> new LinkedHashSet<>()).add(code));
            EXACT.computeIfAbsent(normalize(code), k -> new LinkedHashSet<>()).add(code);
            String alpha3 = alpha3(code);
            if (alpha3 != null) {
                EXACT.computeIfAbsent(normalize(alpha3), k -> new LinkedHashSet<>())
                        .add(code);
            }
        }
        ALIASES.forEach((alias, code) ->
                EXACT.computeIfAbsent(alias, k -> new LinkedHashSet<>()).add(code));
    }

    private CountryNames() {}

    /** Izid prepoznavanja države iz besedila. */
    public sealed interface Resolution {

        /** Natančno ujemanje: ena država. */
        record Found(String code) implements Resolution {}

        /** Več kandidatov ali samo delno ujemanje; uporabnik odloči. */
        record Ambiguous(List<String> candidates) implements Resolution {}

        /** Brez ujemanja. */
        record Unknown() implements Resolution {}
    }

    /** Vse uradne kode alpha-2, razvrščene. */
    public static List<String> codes() {
        return CODES;
    }

    /** Ali je {@code code} uradna koda alpha-2 (velike črke). */
    public static boolean isValid(String code) {
        return code != null && CODE_SET.contains(code);
    }

    /** Ime države v jeziku ({@code sl}, sicer angleško); neznana koda vrne samo kodo. */
    public static String display(String code, String language) {
        if (code == null || !isValid(code)) {
            return code;
        }
        Locale locale = "sl".equals(language) ? SL : EN;
        return new Locale.Builder().setRegion(code).build().getDisplayCountry(locale);
    }

    /**
     * Kode, ki ustrezajo iskanemu besedilu (FR-013-03): koda je enaka besedilu ali ime v slovenščini ali angleščini
     * vsebuje besedilo; brez razlike velikosti črk in strešic. Prazno besedilo ne ujame ničesar.
     */
    public static List<String> matching(String text) {
        String needle = normalize(text);
        if (needle.isEmpty()) {
            return List.of();
        }
        List<String> found = new ArrayList<>();
        boolean byName = needle.codePointCount(0, needle.length()) >= MIN_PARTIAL;
        for (String code : CODES) {
            if (normalize(code).equals(needle) || (byName && contains(code, needle))) {
                found.add(code);
            }
        }
        return found;
    }

    /** Prepoznavanje države (FR-013-19, research R-07). */
    public static Resolution resolve(String text) {
        String needle = normalize(text);
        if (needle.isEmpty()) {
            return new Resolution.Unknown();
        }
        Set<String> exact = EXACT.get(needle);
        if (exact != null) {
            return exact.size() == 1
                    ? new Resolution.Found(exact.iterator().next())
                    : new Resolution.Ambiguous(
                            exact.stream().limit(MAX_CANDIDATES).toList());
        }
        if (needle.codePointCount(0, needle.length()) < MIN_PARTIAL) {
            return new Resolution.Unknown();
        }
        List<String> partial = new ArrayList<>();
        for (String code : CODES) {
            if (contains(code, needle)) {
                partial.add(code);
            }
        }
        return partial.isEmpty()
                ? new Resolution.Unknown()
                : new Resolution.Ambiguous(
                        partial.stream().limit(MAX_CANDIDATES).toList());
    }

    private static boolean contains(String code, String needle) {
        for (String name : NAMES.get(code)) {
            if (name.contains(needle)) {
                return true;
            }
        }
        return false;
    }

    private static String alpha3(String code) {
        try {
            return new Locale.Builder().setRegion(code).build().getISO3Country();
        } catch (java.util.MissingResourceException e) {
            return null;
        }
    }

    /** NFD brez kombinirnih znakov, male črke, strnjeni presledki, obrez. */
    static String normalize(String text) {
        if (text == null) {
            return "";
        }
        String bare = COMBINING_MARKS
                .matcher(Normalizer.normalize(text, Normalizer.Form.NFD))
                .replaceAll("")
                .toLowerCase(Locale.ROOT);
        return SPACES.matcher(bare).replaceAll(" ").strip();
    }
}
