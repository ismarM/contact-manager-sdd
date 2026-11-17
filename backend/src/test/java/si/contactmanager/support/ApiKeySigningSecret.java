package si.contactmanager.support;

import java.security.SecureRandom;
import java.util.Base64;
import org.springframework.test.context.DynamicPropertyRegistry;

/**
 * Podpisna skrivnost API ključev za teste (019, research R-01): naključna ob vsakem zagonu JVM, nikoli v Gitu. Ena
 * vrednost za vse kontekste, da se predpomnjeni konteksti Spring ujemajo.
 */
public final class ApiKeySigningSecret {

    public static final String VALUE = random();

    private ApiKeySigningSecret() {}

    /** Nova naključna skrivnost (base64, 32 bajtov) – npr. za »drug podpisni ključ«. */
    public static String random() {
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        return Base64.getEncoder().encodeToString(bytes);
    }

    /** Za {@code @DynamicPropertySource}: nastavi {@code api-keys.signing-secret}. */
    public static void register(DynamicPropertyRegistry registry) {
        registry.add("api-keys.signing-secret", () -> VALUE);
    }
}
