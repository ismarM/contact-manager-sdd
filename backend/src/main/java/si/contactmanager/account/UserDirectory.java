package si.contactmanager.account;

import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;

/**
 * Notranji id prijavljenega uporabnika ({@code app_user.id}) iz žetona (002, research R-03). Uporabnik je vedno
 * {@code sub} iz žetona (FR-001-07); id se nikoli ne pojavi v API-ju.
 */
@Component
public class UserDirectory {

    private final JdbcClient jdbc;

    UserDirectory(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Id profila; prazno, če se uporabnik še ni prijavil v aplikacijo ({@code PUT /api/me}). */
    public Optional<Long> find(Jwt jwt) {
        return jdbc.sql("SELECT id FROM app_user WHERE firebase_uid = :uid")
                .param("uid", jwt.getSubject())
                .query(Long.class)
                .optional();
    }

    /** Id profila; profil se po potrebi ustvari iz žetona (ime, e-naslov), obstoječi se ne spremeni. */
    public long ensure(Jwt jwt) {
        return jdbc.sql("INSERT INTO app_user (firebase_uid, name, email) VALUES (:uid, :name, :email)"
                        + " ON CONFLICT (firebase_uid) DO UPDATE SET firebase_uid = excluded.firebase_uid"
                        + " RETURNING id")
                .param("uid", jwt.getSubject())
                .param("name", jwt.getClaimAsString("name"))
                .param("email", jwt.getClaimAsString("email"))
                .query(Long.class)
                .single();
    }
}
