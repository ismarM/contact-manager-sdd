package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

/** Normalizacija spletnega naslova (016, FR-016-02, research R-03): shema, gostitelj z malimi črkami, Unicode. */
@Tag("FR-016-02")
class UrlNormalizerTest {

    @ParameterizedTest
    @CsvSource(
            delimiter = '|',
            value = {
                "primer.si|https://primer.si",
                "www.Primer.SI/Pot/Do?x=1#Sidro|https://www.primer.si/Pot/Do?x=1#Sidro",
                "HTTP://Primer.si|http://primer.si",
                "https://primer.si:8443/a|https://primer.si:8443/a",
                "primer.si:8080/a|https://primer.si:8080/a",
                "//primer.si/a|https://primer.si/a",
                "  https://primer.si  |https://primer.si",
                "https://šumniki.si/pot|https://šumniki.si/pot",
                "https://ŠUMNIKI.si|https://šumniki.si",
            })
    void normalizesSchemeAndHost(String raw, String expected) {
        assertThat(UrlNormalizer.normalize(raw)).contains(expected);
    }

    @Test
    void punycodeHostIsStoredReadableInUnicode() {
        String ascii = java.net.IDN.toASCII("šumniki.si");

        assertThat(UrlNormalizer.normalize("https://" + ascii + "/pot")).contains("https://šumniki.si/pot");
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "",
                "javascript:alert(1)",
                "JavaScript:alert(1)",
                "ftp://primer.si",
                "mailto:ana@primer.si",
                "data:text/html,x",
                "file:///etc/passwd",
                "https://",
                "https://brezpike",
                "localhost",
                "https://primer .si",
                "https://primer.si:abc",
                "https://uporabnik:geslo@primer.si",
                ".si",
                "https://.si",
                "https://primer.",
                "https://pri_mer.si",
            })
    void rejectsOtherSchemesAndInvalidHosts(String raw) {
        assertThat(UrlNormalizer.normalize(raw)).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {"primer.si", "HTTP://Primer.si/a", "https://šumniki.si/x"})
    void isIdempotentOnItsOwnOutput(String raw) {
        String once = UrlNormalizer.normalize(raw).orElseThrow();
        assertThat(UrlNormalizer.normalize(once)).contains(once);
    }
}
