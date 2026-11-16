package si.contactmanager.image;

import java.net.Inet4Address;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.UnknownHostException;
import java.util.List;
import java.util.Locale;
import java.util.function.Function;
import java.util.regex.Pattern;

/**
 * Zaščita pred SSRF pri prevzemu slike Google računa (research R-06, FR-018-23): naslov mora biti {@code https} na
 * vratih 443 brez uporabniških podatkov, gostitelj mora ustrezati seznamu dovoljenih, vsi razrešeni naslovi pa morajo
 * biti javni (brez zank, lokalnih, zasebnih, link-local, CGNAT, večpredvajanja, {@code 0.0.0.0} in IPv6 ekvivalentov).
 */
final class UrlGuard {

    /** Razlog zavrnitve (samo za dnevnik, brez naslova). */
    static final class Rejected extends Exception {
        private static final long serialVersionUID = 1L;

        Rejected(String reason) {
            super(reason);
        }
    }

    private final List<Pattern> allowedHosts;
    private final Function<String, List<InetAddress>> resolver;
    private final String scheme;
    private final int port;

    /** Proizvodna zaščita: {@code https}, vrata 443, razreševanje z DNS. */
    UrlGuard(List<String> allowedHosts) {
        this(allowedHosts, UrlGuard::resolveWithDns, "https", 443);
    }

    /** Za teste z lokalnim strežnikom: shema, vrata in razreševanje so nastavljivi. */
    UrlGuard(List<String> allowedHosts, Function<String, List<InetAddress>> resolver, String scheme, int port) {
        this.allowedHosts = allowedHosts.stream().map(Pattern::compile).toList();
        this.resolver = resolver;
        this.scheme = scheme;
        this.port = port;
    }

    /** Preveri naslov in vrne ga razčlenjenega; sicer {@link Rejected}. */
    URI check(String url) throws Rejected {
        if (url == null || url.isBlank() || url.length() > 2048) {
            throw new Rejected("naslov manjka ali je predolg");
        }
        URI uri;
        try {
            uri = new URI(url.trim());
        } catch (URISyntaxException e) {
            throw new Rejected("neveljaven naslov");
        }
        if (!scheme.equalsIgnoreCase(uri.getScheme())) {
            throw new Rejected("shema ni dovoljena");
        }
        if (uri.getRawUserInfo() != null
                || uri.getRawAuthority() == null
                || uri.getRawAuthority().contains("@")) {
            throw new Rejected("uporabniški podatki v naslovu");
        }
        int actualPort = uri.getPort() == -1 ? ("https".equals(scheme) ? 443 : 80) : uri.getPort();
        if (actualPort != port) {
            throw new Rejected("vrata niso dovoljena");
        }
        String host = uri.getHost();
        if (host == null || host.isBlank()) {
            throw new Rejected("gostitelj manjka");
        }
        String normalized = host.toLowerCase(Locale.ROOT);
        if (allowedHosts.stream()
                .noneMatch(pattern -> pattern.matcher(normalized).matches())) {
            throw new Rejected("gostitelj ni na seznamu dovoljenih");
        }
        List<InetAddress> addresses = resolver.apply(normalized);
        if (addresses.isEmpty()) {
            throw new Rejected("gostitelja ni mogoče razrešiti");
        }
        for (InetAddress address : addresses) {
            if (isForbidden(address)) {
                throw new Rejected("naslov ni javen");
            }
        }
        return uri;
    }

    /** Ali je naslov zank, lokalni, zasebni, link-local, CGNAT, večpredvajanje ali nedoločen (tudi IPv4 v IPv6). */
    static boolean isForbidden(InetAddress address) {
        if (address.isAnyLocalAddress()
                || address.isLoopbackAddress()
                || address.isLinkLocalAddress()
                || address.isSiteLocalAddress()
                || address.isMulticastAddress()) {
            return true;
        }
        byte[] bytes = address.getAddress();
        if (address instanceof Inet4Address) {
            return forbiddenV4(bytes);
        }
        if (address instanceof Inet6Address) {
            // Unique local fc00::/7.
            if ((bytes[0] & 0xFE) == 0xFC) {
                return true;
            }
            // IPv4-preslikan ::ffff:a.b.c.d in IPv4-združljiv ::a.b.c.d: preveri vdelani IPv4.
            boolean prefixZero = true;
            for (int i = 0; i < 10; i++) {
                prefixZero &= bytes[i] == 0;
            }
            if (prefixZero
                    && ((bytes[10] == (byte) 0xFF && bytes[11] == (byte) 0xFF) || (bytes[10] == 0 && bytes[11] == 0))) {
                return forbiddenV4(new byte[] {bytes[12], bytes[13], bytes[14], bytes[15]});
            }
            // 64:ff9b::/96 (NAT64) in 2002::/16 (6to4) z vdelanim zasebnim IPv4.
            if (bytes[0] == 0x00 && bytes[1] == 0x64 && (bytes[2] & 0xFF) == 0xFF && (bytes[3] & 0xFF) == 0x9B) {
                return forbiddenV4(new byte[] {bytes[12], bytes[13], bytes[14], bytes[15]});
            }
            if (bytes[0] == 0x20 && bytes[1] == 0x02) {
                return forbiddenV4(new byte[] {bytes[2], bytes[3], bytes[4], bytes[5]});
            }
        }
        return false;
    }

    private static boolean forbiddenV4(byte[] b) {
        int first = b[0] & 0xFF;
        int second = b[1] & 0xFF;
        return first == 0
                || first == 10
                || first == 127
                || (first == 100 && second >= 64 && second <= 127)
                || (first == 169 && second == 254)
                || (first == 172 && second >= 16 && second <= 31)
                || (first == 192 && second == 168)
                || (first == 192 && second == 0 && (b[2] & 0xFF) == 0)
                || (first == 198 && (second == 18 || second == 19))
                || first >= 224;
    }

    private static List<InetAddress> resolveWithDns(String host) {
        try {
            return List.of(InetAddress.getAllByName(host));
        } catch (UnknownHostException e) {
            return List.of();
        }
    }
}
