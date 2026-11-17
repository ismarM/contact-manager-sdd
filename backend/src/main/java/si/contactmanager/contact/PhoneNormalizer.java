package si.contactmanager.contact;

import com.google.i18n.phonenumbers.NumberParseException;
import com.google.i18n.phonenumbers.PhoneNumberUtil;
import com.google.i18n.phonenumbers.PhoneNumberUtil.PhoneNumberFormat;
import com.google.i18n.phonenumbers.Phonenumber.PhoneNumber;
import com.google.i18n.phonenumbers.ShortNumberInfo;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Preverjanje in normalizacija telefona (016, research R-02): obrez, odcep pripone, dovoljeni znaki, {@code 00} =
 * {@code +}, razčlenitev glede na državo kontakta (sicer {@code SI}), {@code isValidNumber} → E.164 (+ {@code ;ext=N}).
 * Veljavna kratka številka se shrani kot števke. Črke se nikoli ne pretvarjajo v števke.
 */
final class PhoneNormalizer {

    static final String DEFAULT_REGION = "SI";
    static final int MAX = 30;

    private static final Pattern EXTENSION =
            Pattern.compile("(?i)\\s*(?:int\\.?|interna|ext\\.?|x|#|;ext=)\\s*(\\d{1,9})$");
    private static final Pattern ALLOWED = Pattern.compile("^[0-9+\\-()/. ]+$");
    private static final Pattern NON_DIGITS = Pattern.compile("\\D");
    private static final PhoneNumberUtil UTIL = PhoneNumberUtil.getInstance();
    private static final ShortNumberInfo SHORT = ShortNumberInfo.getInstance();

    private PhoneNormalizer() {}

    /** Kanonična oblika ali prazno, če številka ni veljavna; {@code country}: koda ISO kontakta ali {@code null}. */
    static Optional<String> normalize(String raw, String country) {
        if (raw == null) {
            return Optional.empty();
        }
        String text = raw.strip();
        String extension = null;
        Matcher matcher = EXTENSION.matcher(text);
        if (matcher.find()) {
            extension = matcher.group(1);
            text = text.substring(0, matcher.start()).strip();
        }
        if (text.isEmpty() || !ALLOWED.matcher(text).matches() || text.lastIndexOf('+') > 0) {
            return Optional.empty();
        }
        String region = country != null && UTIL.getSupportedRegions().contains(country) ? country : DEFAULT_REGION;
        String digits = NON_DIGITS.matcher(text).replaceAll("");
        if (extension == null
                && !text.startsWith("+")
                && !text.startsWith("00")
                && digits.length() <= 6
                && isShort(digits, region)) {
            return Optional.of(digits);
        }
        if (text.startsWith("00")) {
            text = "+" + text.substring(2);
        }
        PhoneNumber number;
        try {
            number = UTIL.parse(text, region);
        } catch (NumberParseException e) {
            return Optional.empty();
        }
        if (!UTIL.isValidNumber(number)) {
            return Optional.empty();
        }
        String e164 = UTIL.format(number, PhoneNumberFormat.E164);
        String result = extension == null ? e164 : e164 + ";ext=" + extension;
        return result.length() <= MAX ? Optional.of(result) : Optional.empty();
    }

    private static boolean isShort(String digits, String region) {
        try {
            return SHORT.isValidShortNumberForRegion(UTIL.parse(digits, region), region);
        } catch (NumberParseException e) {
            return false;
        }
    }
}
