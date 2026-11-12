package si.contactmanager.shared.security;

import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;

/**
 * Ovije {@link FirebaseJwtDecoder} (012, research R-08): po uspešnem preverjanju podpisa in zahtevkov zavrne žeton
 * identitete, ki je na seznamu izbrisanih (nadgrobnik) → {@code 401 UNAUTHENTICATED} povsod, tudi pri {@code PUT /api/me}
 * (FR-012-15, FR-012-18). Stanje je v bazi; ob izpadu baze zahtevek tako ali tako ne uspe.
 */
public final class DeletedIdentityJwtDecoder implements JwtDecoder {

    private final JwtDecoder delegate;
    private final RevokedIdentities revoked;

    public DeletedIdentityJwtDecoder(JwtDecoder delegate, RevokedIdentities revoked) {
        this.delegate = delegate;
        this.revoked = revoked;
    }

    @Override
    public Jwt decode(String token) throws JwtException {
        Jwt jwt = delegate.decode(token);
        if (revoked.contains(jwt.getSubject())) {
            throw new BadJwtException("identity deleted");
        }
        return jwt;
    }
}
