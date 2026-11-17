package si.contactmanager.image;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/** Zaščita pred SSRF pri prevzemu slike Google računa (FR-018-23, research R-06): tabele naslovov brez omrežja. */
@Tag("FR-018-23")
class UrlGuardTest {

    private static final List<String> HOSTS = List.of("^lh[0-9]+\\.googleusercontent\\.com$");
    private static final String GOOD = "https://lh3.googleusercontent.com/a/ACg8ocJ=s96-c";

    private static InetAddress ip(String literal) {
        try {
            return InetAddress.getByName(literal);
        } catch (UnknownHostException e) {
            throw new IllegalStateException(e);
        }
    }

    private static Function<String, List<InetAddress>> resolvingTo(String... literals) {
        List<InetAddress> addresses =
                java.util.Arrays.stream(literals).map(UrlGuardTest::ip).toList();
        return host -> addresses;
    }

    private static UrlGuard guard(String... literals) {
        return new UrlGuard(HOSTS, resolvingTo(literals), "https", 443);
    }

    // --- naslov ---

    @Test
    void goodGoogleAddressWithPublicResolutionIsAccepted() throws Exception {
        assertThat(guard("142.250.74.33").check(GOOD).getHost()).isEqualTo("lh3.googleusercontent.com");
        assertThat(guard("2a00:1450:4001:82b::2001").check("https://lh6.googleusercontent.com/x=s96-c"))
                .isNotNull();
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "http://lh3.googleusercontent.com/a=s96-c",
                "ftp://lh3.googleusercontent.com/a",
                "//lh3.googleusercontent.com/a",
                "file:///etc/passwd",
                "https://169.254.169.254/latest/meta-data/",
                "https://localhost/a",
                "https://127.1/a",
                "https://127.0.0.1/a",
                "https://[::1]/a",
                "https://10.0.0.1/a",
                "https://0.0.0.0/a",
                "https://2130706433/a",
                "https://lh3.googleusercontent.com.evil.com/a",
                "https://evil.com#lh3.googleusercontent.com",
                "https://evil.com/lh3.googleusercontent.com",
                "https://evil.com?lh3.googleusercontent.com",
                "https://lh3.googleusercontent.com@evil.com/a",
                "https://user@lh3.googleusercontent.com/a",
                "https://user:pass@lh3.googleusercontent.com/a",
                "https://lh3.googleusercontent.com:8443/a",
                "https://lh3.googleusercontent.com:80/a",
                "https://googleusercontent.com/a",
                "https://xlh3.googleusercontent.com/a",
                "https://lh.googleusercontent.com/a",
                "https://lh3.googleusercontent.com.:443/a",
                "https:///a",
                "not a url",
                "",
                "   "
            })
    void unsafeAddressesAreRejectedBeforeAnyNetworkAccess(String url) {
        // razreševalec bi vrnil javen naslov: zavrnitev mora priti iz oblike naslova
        assertThatThrownBy(() -> guard("142.250.74.33").check(url)).isInstanceOf(UrlGuard.Rejected.class);
    }

    @Test
    void missingAndOverlongAddressesAreRejected() {
        assertThatThrownBy(() -> guard("142.250.74.33").check(null)).isInstanceOf(UrlGuard.Rejected.class);
        assertThatThrownBy(() -> guard("142.250.74.33").check("https://lh3.googleusercontent.com/" + "a".repeat(2100)))
                .isInstanceOf(UrlGuard.Rejected.class);
    }

    @Test
    void hostIsMatchedCaseInsensitively() {
        assertThatCode(() -> guard("142.250.74.33").check("https://LH3.GoogleUserContent.com/a"))
                .doesNotThrowAnyException();
    }

    // --- razrešitev (DNS rebinding) ---

    @ParameterizedTest
    @ValueSource(
            strings = {"127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0"
            })
    void allowedHostResolvingToAnInternalAddressIsRejected(String resolved) {
        assertThatThrownBy(() -> guard(resolved).check(GOOD)).isInstanceOf(UrlGuard.Rejected.class);
    }

    @Test
    void oneForbiddenAddressAmongManyRejectsTheHost() {
        assertThatThrownBy(() -> guard("142.250.74.33", "10.0.0.1").check(GOOD)).isInstanceOf(UrlGuard.Rejected.class);
    }

    @Test
    void unresolvableHostIsRejected() {
        UrlGuard unresolved = new UrlGuard(HOSTS, host -> List.of(), "https", 443);

        assertThatThrownBy(() -> unresolved.check(GOOD)).isInstanceOf(UrlGuard.Rejected.class);
    }

    @Test
    void rejectionReasonNeverContainsTheAddress() {
        String url = "https://169.254.169.254/secret-token";

        assertThatThrownBy(() -> guard("142.250.74.33").check(url))
                .isInstanceOf(UrlGuard.Rejected.class)
                .message()
                .doesNotContain("169.254")
                .doesNotContain("secret-token");
    }

    // --- naslovi IP ---

    private static final Map<String, Boolean> ADDRESSES = Map.ofEntries(
            Map.entry("127.0.0.1", true),
            Map.entry("127.255.255.254", true),
            Map.entry("10.0.0.1", true),
            Map.entry("10.255.255.255", true),
            Map.entry("172.16.0.1", true),
            Map.entry("172.31.255.255", true),
            Map.entry("172.32.0.1", false),
            Map.entry("172.15.255.255", false),
            Map.entry("192.168.0.1", true),
            Map.entry("169.254.169.254", true),
            Map.entry("169.254.0.1", true),
            Map.entry("100.64.0.1", true),
            Map.entry("100.127.255.255", true),
            Map.entry("100.63.255.255", false),
            Map.entry("100.128.0.1", false),
            Map.entry("0.0.0.0", true),
            Map.entry("0.1.2.3", true),
            Map.entry("224.0.0.1", true),
            Map.entry("239.255.255.250", true),
            Map.entry("255.255.255.255", true),
            Map.entry("198.18.0.1", true),
            Map.entry("192.0.0.1", true),
            Map.entry("::1", true),
            Map.entry("::", true),
            Map.entry("fe80::1", true),
            Map.entry("fc00::1", true),
            Map.entry("fd12:3456:789a::1", true),
            Map.entry("ff02::1", true),
            Map.entry("::ffff:127.0.0.1", true),
            Map.entry("::ffff:10.0.0.1", true),
            Map.entry("::ffff:169.254.169.254", true),
            Map.entry("::ffff:7f00:1", true),
            Map.entry("64:ff9b::a00:1", true),
            Map.entry("2002:a00:1::", true),
            Map.entry("8.8.8.8", false),
            Map.entry("142.250.74.33", false),
            Map.entry("::ffff:8.8.8.8", false),
            Map.entry("2a00:1450:4001:82b::2001", false),
            Map.entry("2001:4860:4860::8888", false));

    @Test
    void addressTableIsClassifiedCorrectly() {
        ADDRESSES.forEach((literal, forbidden) ->
                assertThat(UrlGuard.isForbidden(ip(literal))).as(literal).isEqualTo(forbidden));
    }
}
