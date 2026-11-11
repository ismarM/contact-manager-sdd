package si.contactmanager.contact;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import si.contactmanager.contact.ContactQuery.Condition;
import si.contactmanager.contact.ContactQuery.Direction;
import si.contactmanager.contact.ContactQuery.Field;
import si.contactmanager.contact.ContactQuery.Kind;
import si.contactmanager.shared.error.ValidationError.FieldError;

/**
 * Razčleni parametre iskanja (specs/008-iskanje/research.md R-06, R-07) v {@link ContactQuery} ali seznam napak po
 * poljih; zbere vse napake naenkrat. Sprejme navaden {@code Map}, zato ni vezan na spletni sloj in ga lahko ponovno
 * uporabita 009 in 010. Obstoj dodatnega ključa v skupini preverja servis, ne razčlenjevalnik.
 */
public final class ContactQueryParser {

    static final int MAX_QUERY = 200;
    static final int MAX_CONDITIONS = 10;
    static final int MAX_CONDITION_VALUE = 500;
    static final int MAX_TAGS = 30;
    static final int MAX_TAG = 50;
    static final int DEFAULT_SIZE = 25;
    private static final List<Integer> SIZES = List.of(25, 50, 100);
    private static final Pattern WHITESPACE = Pattern.compile("(?U)\\s+");
    private static final Pattern DIGITS = Pattern.compile("[0-9]{1,10}");

    /** Rezultat: poizvedba, kadar ni napak, sicer vse napake naenkrat. */
    public record Parsed(ContactQuery query, List<FieldError> errors) {

        public boolean valid() {
            return errors.isEmpty();
        }
    }

    public Parsed parse(Map<String, List<String>> parameters) {
        List<FieldError> errors = new ArrayList<>();
        List<String> words = parseWords(first(parameters, "q"), errors);
        List<Condition> conditions = parseConditions(parameters.getOrDefault("f", List.of()), errors);
        List<String> tags = parseTags(parameters.getOrDefault("tag", List.of()), errors);
        Field sort = parseSort(first(parameters, "sort"), errors);
        Direction direction = parseDirection(first(parameters, "dir"), errors);
        Integer size = parseSize(first(parameters, "size"), errors);
        Integer page = parsePage(first(parameters, "page"), size, errors);
        if (!errors.isEmpty()) {
            return new Parsed(null, List.copyOf(errors));
        }
        return new Parsed(new ContactQuery(words, conditions, tags, sort, direction, page, size), List.of());
    }

    private static String first(Map<String, List<String>> parameters, String name) {
        List<String> values = parameters.get(name);
        return values == null || values.isEmpty() ? null : values.getFirst();
    }

    private static boolean hasNul(String value) {
        return value.indexOf('\u0000') >= 0;
    }

    private static int length(String value) {
        return value.codePointCount(0, value.length());
    }

    private static boolean invisible(String word) {
        return word.codePoints().allMatch(cp -> {
            int type = Character.getType(cp);
            return type == Character.CONTROL || type == Character.FORMAT;
        });
    }

    private static List<String> parseWords(String raw, List<FieldError> errors) {
        if (raw == null) {
            return List.of();
        }
        if (hasNul(raw)) {
            errors.add(new FieldError("q", "MALFORMED"));
            return List.of();
        }
        String text = raw.strip();
        if (length(text) > MAX_QUERY) {
            errors.add(new FieldError("q", "TOO_LONG"));
            return List.of();
        }
        List<String> words = new ArrayList<>();
        if (!text.isEmpty()) {
            for (String word : WHITESPACE.split(text)) {
                if (!word.isEmpty() && !invisible(word)) {
                    words.add(word);
                }
            }
        }
        return words;
    }

    /** Polje iz zapisa v naslovu; {@code null} ob napaki (koda v {@code error}). */
    private static Field parseField(String token, String[] error) {
        switch (token) {
            case "firstName":
                return new Field(Kind.FIRST_NAME, null);
            case "lastName":
                return new Field(Kind.LAST_NAME, null);
            case "address":
                return new Field(Kind.ADDRESS, null);
            case "email":
                return new Field(Kind.EMAIL, null);
            case "phone":
                return new Field(Kind.PHONE, null);
            default:
                break;
        }
        if (!token.startsWith("x.") || token.length() == 2) {
            error[0] = "UNKNOWN_FIELD";
            return null;
        }
        String key = decodeKey(token.substring(2));
        if (key == null) {
            error[0] = "MALFORMED";
            return null;
        }
        return new Field(Kind.ATTRIBUTE, ContactInputParser.normalize(key));
    }

    /** V ključu sta samo {@code %25} in {@code %3A} veljavni zaporedji; vsak drug {@code %} je neveljaven. */
    private static String decodeKey(String encoded) {
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < encoded.length(); i++) {
            char c = encoded.charAt(i);
            if (c != '%') {
                out.append(c);
                continue;
            }
            if (encoded.startsWith("25", i + 1)) {
                out.append('%');
            } else if (encoded.startsWith("3A", i + 1) || encoded.startsWith("3a", i + 1)) {
                out.append(':');
            } else {
                return null;
            }
            i += 2;
        }
        return out.toString();
    }

    private static List<Condition> parseConditions(List<String> raw, List<FieldError> errors) {
        List<Condition> conditions = new ArrayList<>();
        for (int i = 0; i < raw.size(); i++) {
            String name = "f[" + i + "]";
            String entry = raw.get(i);
            if (hasNul(entry)) {
                errors.add(new FieldError(name, "MALFORMED"));
                continue;
            }
            int colon = entry.indexOf(':');
            if (colon < 0) {
                errors.add(new FieldError(name, "MALFORMED"));
                continue;
            }
            String[] error = new String[1];
            Field field = parseField(entry.substring(0, colon), error);
            if (field == null) {
                errors.add(new FieldError(name, error[0]));
                continue;
            }
            String value = entry.substring(colon + 1).strip();
            if (value.isEmpty()) {
                errors.add(new FieldError(name, "REQUIRED"));
            } else if (length(value) > MAX_CONDITION_VALUE) {
                errors.add(new FieldError(name, "TOO_LONG"));
            } else {
                conditions.add(new Condition(field, value));
            }
        }
        if (raw.size() > MAX_CONDITIONS) {
            errors.add(new FieldError("f", "TOO_MANY"));
        }
        return conditions;
    }

    private static List<String> parseTags(List<String> raw, List<FieldError> errors) {
        Set<String> tags = new LinkedHashSet<>();
        for (int i = 0; i < raw.size(); i++) {
            String name = "tag[" + i + "]";
            String entry = raw.get(i);
            if (hasNul(entry)) {
                errors.add(new FieldError(name, "MALFORMED"));
                continue;
            }
            String tag = entry.strip();
            if (tag.isEmpty()) {
                errors.add(new FieldError(name, "REQUIRED"));
            } else if (length(tag) > MAX_TAG) {
                errors.add(new FieldError(name, "TOO_LONG"));
            } else {
                tags.add(ContactInputParser.normalize(tag));
            }
        }
        if (tags.size() > MAX_TAGS) {
            errors.add(new FieldError("tag", "TOO_MANY"));
        }
        return List.copyOf(tags);
    }

    private static Field parseSort(String raw, List<FieldError> errors) {
        if (raw == null) {
            return new Field(Kind.LAST_NAME, null);
        }
        if (hasNul(raw)) {
            errors.add(new FieldError("sort", "MALFORMED"));
            return null;
        }
        String[] error = new String[1];
        Field field = parseField(raw, error);
        if (field == null) {
            errors.add(new FieldError("sort", error[0]));
        }
        return field;
    }

    private static Direction parseDirection(String raw, List<FieldError> errors) {
        if (raw == null || raw.equals("asc")) {
            return Direction.ASC;
        }
        if (raw.equals("desc")) {
            return Direction.DESC;
        }
        errors.add(new FieldError("dir", "INVALID_VALUE"));
        return null;
    }

    private static Integer parseSize(String raw, List<FieldError> errors) {
        if (raw == null) {
            return DEFAULT_SIZE;
        }
        if (DIGITS.matcher(raw).matches()) {
            long value = Long.parseLong(raw);
            if (SIZES.contains((int) Math.min(value, Integer.MAX_VALUE))) {
                return (int) value;
            }
        }
        errors.add(new FieldError("size", "INVALID_VALUE"));
        return null;
    }

    private static Integer parsePage(String raw, Integer size, List<FieldError> errors) {
        if (raw == null) {
            return 0;
        }
        if (DIGITS.matcher(raw).matches()) {
            long value = Long.parseLong(raw);
            long perPage = size == null ? DEFAULT_SIZE : size;
            if (value * perPage <= Integer.MAX_VALUE) {
                return (int) value;
            }
        }
        errors.add(new FieldError("page", "INVALID_VALUE"));
        return null;
    }
}
