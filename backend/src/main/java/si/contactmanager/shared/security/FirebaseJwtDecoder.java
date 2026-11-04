package si.contactmanager.shared.security;

import com.nimbusds.jose.jwk.source.JWKSource;
import com.nimbusds.jose.proc.SecurityContext;
import java.time.Clock;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.JwtDecoder;

/**
 * Preverjanje ID žetonov Firebase (FR-001-07, research R-01): produkcijski način (podpis RS256 po JWK Googla) in način
 * emulatorja (samo nepodpisani žetoni). Implementacija v T028.
 */
public final class FirebaseJwtDecoder {

    private FirebaseJwtDecoder() {}

    public static JwtDecoder production(String projectId, JWKSource<SecurityContext> keys, Clock clock) {
        return token -> {
            throw new BadJwtException("not implemented");
        };
    }

    public static JwtDecoder emulator(String projectId, Clock clock) {
        return token -> {
            throw new BadJwtException("not implemented");
        };
    }
}
