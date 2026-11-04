package si.contactmanager.support;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Consumer;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * Ponarejeni in spremenjeni žetoni za varnostne teste (FR-001-07). Izhodišče je pravi žeton emulatorja, ki mu test
 * spremeni zahtevke ali glavo; noben žeton ne prihaja od prave storitve.
 */
public final class Tokens {

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder B64D = Base64.getUrlDecoder();
    private static final SecureRandom RANDOM = new SecureRandom();

    private Tokens() {}

    /** Zahtevki (payload) žetona. */
    public static Map<String, Object> claims(String token) {
        String payload = new String(B64D.decode(token.split("\\.")[1]), StandardCharsets.UTF_8);
        return new LinkedHashMap<>(JSON.readValue(payload, new TypeReference<Map<String, Object>>() {}));
    }

    /** Nepodpisan žeton ({@code alg: none}) z danimi zahtevki – oblika žetonov emulatorja. */
    public static String unsigned(Map<String, Object> claims) {
        return encode(Map.of("alg", "none", "typ", "JWT")) + "." + encode(claims) + ".";
    }

    /** Kopija žetona emulatorja s spremenjenimi zahtevki (ostane nepodpisana). */
    public static String withClaims(String token, Consumer<Map<String, Object>> change) {
        Map<String, Object> claims = claims(token);
        change.accept(claims);
        return unsigned(claims);
    }

    /** Žeton z glavo {@code RS256} in naključnim (ponarejenim) podpisom; zahtevki so od pravega žetona. */
    public static String withForgedSignature(String token) {
        byte[] signature = new byte[256];
        RANDOM.nextBytes(signature);
        return encode(Map.of("alg", "RS256", "kid", "forged", "typ", "JWT")) + "." + encode(claims(token)) + "."
                + B64.encodeToString(signature);
    }

    /** Čas v sekundah od epohe za zahtevke {@code exp}/{@code iat}. */
    public static long epochSeconds(long offsetSeconds) {
        return System.currentTimeMillis() / 1000 + offsetSeconds;
    }

    private static String encode(Map<String, Object> json) {
        return B64.encodeToString(JSON.writeValueAsString(json).getBytes(StandardCharsets.UTF_8));
    }
}
