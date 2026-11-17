package si.contactmanager.contact;

import java.net.IDN;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;
import java.util.Optional;

/**
 * Preverjanje in normalizacija spletnega naslova (016, research R-03): brez sheme {@code https://}, samo
 * {@code http}/{@code https}, gostitelj s piko, ki ga {@link IDN#toASCII} sprejme; shema in gostitelj z malimi črkami,
 * gostitelj shranjen v Unicode; pot, poizvedba in sidro nespremenjeni.
 */
final class UrlNormalizer {

    private UrlNormalizer() {}

    /** Kanonična oblika ali prazno, če naslov ni veljaven. */
    static Optional<String> normalize(String raw) {
        if (raw == null) {
            return Optional.empty();
        }
        String text = raw.strip();
        if (text.isEmpty() || text.chars().anyMatch(c -> Character.isWhitespace(c) || Character.isISOControl(c))) {
            return Optional.empty();
        }
        String scheme = "https";
        String rest = text;
        int colon = text.indexOf(':');
        int slash = text.indexOf('/');
        if (text.regionMatches(true, 0, "//", 0, 2)) {
            rest = text.substring(2);
        } else if (colon > 0 && (slash < 0 || colon < slash) && !isPort(text, colon)) {
            // Shema je vse pred prvim ":" (npr. javascript:, mailto:, ftp:); veljata samo http in https.
            scheme = text.substring(0, colon).toLowerCase(Locale.ROOT);
            if (!scheme.equals("http") && !scheme.equals("https")) {
                return Optional.empty();
            }
            if (!text.startsWith("//", colon + 1)) {
                return Optional.empty();
            }
            rest = text.substring(colon + 3);
        }
        int end = indexOfAny(rest, "/?#");
        String authority = end < 0 ? rest : rest.substring(0, end);
        String tail = end < 0 ? "" : rest.substring(end);
        if (authority.contains("@")) {
            return Optional.empty();
        }
        String host = authority;
        String port = "";
        int portColon = authority.lastIndexOf(':');
        if (portColon >= 0) {
            host = authority.substring(0, portColon);
            port = authority.substring(portColon);
            if (!port.substring(1).matches("\\d{1,5}")) {
                return Optional.empty();
            }
        }
        if (host.isEmpty() || !host.contains(".") || host.startsWith(".") || host.endsWith(".")) {
            return Optional.empty();
        }
        String ascii;
        try {
            ascii = IDN.toASCII(host, IDN.USE_STD3_ASCII_RULES);
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
        String unicodeHost = IDN.toUnicode(ascii.toLowerCase(Locale.ROOT)).toLowerCase(Locale.ROOT);
        String result = scheme + "://" + unicodeHost + port + tail;
        try {
            URI uri = new URI(
                    scheme,
                    null,
                    ascii.toLowerCase(Locale.ROOT),
                    port.isEmpty() ? -1 : Integer.parseInt(port.substring(1)),
                    null,
                    null,
                    null);
            if (uri.getHost() == null) {
                return Optional.empty();
            }
        } catch (URISyntaxException e) {
            return Optional.empty();
        }
        return Optional.of(result);
    }

    /** {@code host:8080/…} brez sheme: del za dvopičjem so samo števke do prve poševnice. */
    private static boolean isPort(String text, int colon) {
        int i = colon + 1;
        int digits = 0;
        while (i < text.length() && Character.isDigit(text.charAt(i))) {
            i++;
            digits++;
        }
        return digits > 0 && (i == text.length() || "/?#".indexOf(text.charAt(i)) >= 0);
    }

    private static int indexOfAny(String text, String chars) {
        for (int i = 0; i < text.length(); i++) {
            if (chars.indexOf(text.charAt(i)) >= 0) {
                return i;
            }
        }
        return -1;
    }
}
