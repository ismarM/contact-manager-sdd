package si.contactmanager.account;

import java.sql.ResultSet;
import java.sql.SQLException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * Profil v tabeli {@code app_user} (data-model.md). Vsaka operacija je en stavek {@code INSERT … ON CONFLICT}, zato
 * sočasne prijave istega uporabnika ustvarijo natanko en profil (FR-001-03).
 */
@Repository
class ProfileRepository {

    /** Uporabnik iz žetona: Firebase UID ({@code sub}), ime (lahko {@code null}) in e-naslov. */
    record Identity(String uid, String name, String email) {}

    record Result(Profile profile, boolean created) {}

    private static final String INSERT = "INSERT INTO app_user (firebase_uid, name, email, language, theme)"
            + " VALUES (:uid, :name, :email, :language, :theme)"
            + " ON CONFLICT (firebase_uid) DO UPDATE SET ";

    private static final String RETURNING =
            ", updated_at = now()" + " RETURNING name, email, language, theme, (xmax = 0) AS created";

    /** Ime in e-naslov iz žetona, izbira naprave samo v prazna polja profila (FR-001-19 b). */
    private static final String SYNC = INSERT
            + "name = excluded.name, email = excluded.email,"
            + " language = COALESCE(app_user.language, excluded.language),"
            + " theme = COALESCE(app_user.theme, excluded.theme)"
            + RETURNING;

    private static final String SAVE_PREFERENCES =
            INSERT + "language = excluded.language, theme = excluded.theme" + RETURNING;

    private final JdbcClient jdbc;

    ProfileRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Sinhronizacija ob prijavi (FR-001-02, FR-001-03, FR-001-19). */
    Result sync(Identity identity, Preferences device) {
        return execute(SYNC, identity, device);
    }

    /** Sprememba izbire (FR-001-15, FR-001-17, FR-001-19); profil se po potrebi ustvari iz žetona. */
    Result savePreferences(Identity identity, Preferences preferences) {
        return execute(SAVE_PREFERENCES, identity, preferences);
    }

    /**
     * Sočasni prvi prijavi istega uporabnika: drugi vstavek lahko trči ob unikatni indeks e-naslova, še preden vidi
     * vrstico prvega ({@code ON CONFLICT} velja samo za {@code firebase_uid}); ponovni poskus vidi potrjeno vrstico in
     * jo posodobi (FR-001-02, 007 ga je razkril pod obremenitvijo).
     */
    private Result execute(String sql, Identity identity, Preferences preferences) {
        try {
            return executeOnce(sql, identity, preferences);
        } catch (DuplicateKeyException e) {
            return executeOnce(sql, identity, preferences);
        }
    }

    private Result executeOnce(String sql, Identity identity, Preferences preferences) {
        return jdbc.sql(sql)
                .param("uid", identity.uid())
                .param("name", identity.name())
                .param("email", identity.email())
                .param(
                        "language",
                        preferences.language() == null
                                ? null
                                : preferences.language().code())
                .param(
                        "theme",
                        preferences.theme() == null ? null : preferences.theme().code())
                .query(ProfileRepository::result)
                .single();
    }

    private static Result result(ResultSet row, int rowNumber) throws SQLException {
        Profile profile = new Profile(
                row.getString("name"),
                row.getString("email"),
                Language.fromCode(row.getString("language")).orElse(null),
                Theme.fromCode(row.getString("theme")).orElse(null));
        return new Result(profile, row.getBoolean("created"));
    }
}
