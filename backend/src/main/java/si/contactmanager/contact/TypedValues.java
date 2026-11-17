package si.contactmanager.contact;

import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.ResolverStyle;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Pattern;
import si.contactmanager.shared.error.ValidationError.FieldError;

/**
 * Preverjanje in normalizacija vrednosti po tipu ključa (016, data-model.md – Pravila po tipu; research R-02 … R-04).
 * Čista logika brez dostopa do baze: napaka je koda polja ({@code REQUIRED}, {@code TOO_LONG}, {@code INVALID_VALUE}).
 * Nespremenjene vrednosti (enake shranjenim, FR-016-09) se ne preverjajo – to odloča kličoči.
 */
public final class TypedValues {

    static final int OTHER_MAX = 500;
    static final int NOTES_MAX = 500;
    static final int EMAIL_MAX = 254;
    static final int URL_MAX = 500;
    static final int ADDRESS_TEXT_MAX = 500;
    static final int STREET_MAX = 200;
    static final int EXTRA_MAX = 200;
    static final int POSTAL_MAX = 20;
    static final int CITY_MAX = 100;
    static final int REGION_MAX = 100;

    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
    private static final Pattern SPACES = Pattern.compile("\\s+");
    private static final DateTimeFormatter DATE =
            DateTimeFormatter.ofPattern("uuuu-MM-dd").withResolverStyle(ResolverStyle.STRICT);

    private TypedValues() {}

    /** Rezultat: {@code value} ob uspehu, sicer {@code error} (koda). */
    public record Result(String value, String error) {

        public boolean valid() {
            return error == null;
        }

        static Result ok(String value) {
            return new Result(value, null);
        }

        static Result fail(String error) {
            return new Result(null, error);
        }
    }

    /** Rezultat naslova po delih: normaliziran naslov ali napake po delih ({@code street}, {@code country} …). */
    public record AddressResult(Address address, List<FieldError> errors) {

        public boolean valid() {
            return errors.isEmpty();
        }
    }

    /**
     * Normalizira besedilno vrednost po tipu. {@code country}: koda ISO države kontakta za telefon ({@code null}:
     * privzeta {@code SI}). Za {@code ADDRESS} velja nerazčlenjen naslov (do 500; krajšo mejo predefiniranega polja
     * preveri razčlenjevalnik kontakta).
     */
    public static Result normalize(AttributeType type, String raw, String country) {
        if (raw == null) {
            return Result.fail("REQUIRED");
        }
        return switch (type) {
            case OTHER -> text(raw.strip(), OTHER_MAX);
            case NOTES -> notes(raw);
            case EMAIL -> email(raw.strip());
            case PHONE -> phone(raw.strip(), country);
            case URL -> url(raw.strip());
            case DATE -> date(raw.strip());
            case ADDRESS -> text(unifyLines(raw), ADDRESS_TEXT_MAX);
        };
    }

    /** Samo preverjanje: ali je vrednost veljavna za tip (npr. pri spremembi tipa ključa). */
    public static boolean isValid(AttributeType type, String raw, String country) {
        return normalize(type, raw, country).valid();
    }

    private static String unifyLines(String raw) {
        return raw.replace("\r\n", "\n").replace('\r', '\n').strip();
    }

    private static Result text(String value, int max) {
        if (value.isEmpty()) {
            return Result.fail("REQUIRED");
        }
        return length(value) > max ? Result.fail("TOO_LONG") : Result.ok(value);
    }

    /** Opombe so dobesedne: brez obreza; vsaj en nepresledni znak, do 500 kodnih točk. */
    private static Result notes(String raw) {
        if (raw.isBlank()) {
            return Result.fail("REQUIRED");
        }
        return length(raw) > NOTES_MAX ? Result.fail("TOO_LONG") : Result.ok(raw);
    }

    private static Result email(String value) {
        if (value.isEmpty()) {
            return Result.fail("REQUIRED");
        }
        if (length(value) > EMAIL_MAX) {
            return Result.fail("TOO_LONG");
        }
        if (!EMAIL.matcher(value).matches()) {
            return Result.fail("INVALID_VALUE");
        }
        int at = value.lastIndexOf('@');
        return Result.ok(value.substring(0, at + 1) + value.substring(at + 1).toLowerCase(Locale.ROOT));
    }

    private static Result phone(String value, String country) {
        if (value.isEmpty()) {
            return Result.fail("REQUIRED");
        }
        Optional<String> normalized = PhoneNormalizer.normalize(value, country);
        if (normalized.isPresent()) {
            return Result.ok(normalized.get());
        }
        return Result.fail(length(value) > PhoneNormalizer.MAX ? "TOO_LONG" : "INVALID_VALUE");
    }

    private static Result url(String value) {
        if (value.isEmpty()) {
            return Result.fail("REQUIRED");
        }
        if (length(value) > URL_MAX) {
            return Result.fail("TOO_LONG");
        }
        Optional<String> normalized = UrlNormalizer.normalize(value);
        if (normalized.isPresent() && length(normalized.get()) > URL_MAX) {
            return Result.fail("TOO_LONG");
        }
        return normalized.map(Result::ok).orElseGet(() -> Result.fail("INVALID_VALUE"));
    }

    private static Result date(String value) {
        if (value.isEmpty()) {
            return Result.fail("REQUIRED");
        }
        try {
            LocalDate date = LocalDate.parse(value, DATE);
            if (date.getYear() < 1 || date.getYear() > 9999) {
                return Result.fail("INVALID_VALUE");
            }
            return Result.ok(date.toString());
        } catch (DateTimeException e) {
            return Result.fail("INVALID_VALUE");
        }
    }

    /**
     * Normalizira naslov po delih (R-04): obrez in strnitev presledkov v vsakem delu, poštna številka z velikimi
     * črkami, država kot koda ISO; prazni deli odpadejo; obvezen je {@code street} ali {@code city}; meje
     * 200/200/20/100/100.
     */
    public static AddressResult normalizeAddress(Address address) {
        List<FieldError> errors = new ArrayList<>();
        if (address == null) {
            errors.add(new FieldError("street", "REQUIRED"));
            return new AddressResult(null, List.copyOf(errors));
        }
        String street = part(address.street(), "street", STREET_MAX, errors);
        String extra = part(address.extra(), "extra", EXTRA_MAX, errors);
        String postal = part(address.postalCode(), "postalCode", POSTAL_MAX, errors);
        String city = part(address.city(), "city", CITY_MAX, errors);
        String region = part(address.region(), "region", REGION_MAX, errors);
        String country = address.country() == null ? "" : address.country().strip();
        if (country.isEmpty()) {
            country = null;
        } else {
            country = country.toUpperCase(Locale.ROOT);
            if (!CountryNames.isValid(country)) {
                errors.add(new FieldError("country", "INVALID_VALUE"));
            }
        }
        boolean placeFailed = errors.stream()
                .anyMatch(e -> e.field().equals("street") || e.field().equals("city"));
        if (street == null && city == null && !placeFailed) {
            errors.add(new FieldError("street", "REQUIRED"));
        }
        if (!errors.isEmpty()) {
            return new AddressResult(null, List.copyOf(errors));
        }
        String postalCode = postal == null ? null : postal.toUpperCase(Locale.ROOT);
        return new AddressResult(new Address(street, extra, postalCode, city, region, country), List.of());
    }

    /** Del naslova: obrezan, presledki strnjeni, prazen = {@code null}; predolg del je napaka. */
    private static String part(String raw, String field, int max, List<FieldError> errors) {
        if (raw == null) {
            return null;
        }
        String value = SPACES.matcher(raw.strip()).replaceAll(" ");
        if (value.isEmpty()) {
            return null;
        }
        if (length(value) > max) {
            errors.add(new FieldError(field, "TOO_LONG"));
        }
        return value;
    }

    static int length(String value) {
        return value.codePointCount(0, value.length());
    }
}
