package si.contactmanager.account;

import java.sql.ResultSet;
import java.sql.SQLException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import si.contactmanager.account.DisplayFormat.AddressFormat;
import si.contactmanager.account.DisplayFormat.DateFormat;
import si.contactmanager.account.DisplayFormat.PhoneFormat;

/**
 * Profil v tabeli {@code app_user} (data-model.md). Vsaka operacija je en stavek {@code INSERT … ON CONFLICT}, zato
 * sočasne prijave istega uporabnika ustvarijo natanko en profil (FR-001-03).
 */
@Repository
class ProfileRepository {

    /** Uporabnik iz žetona: Firebase UID ({@code sub}), ime (lahko {@code null}) in e-naslov. */
    record Identity(String uid, String name, String email) {}

    record Result(Profile profile, boolean created) {}

    private static final String INSERT = "INSERT INTO app_user"
            + " (firebase_uid, name, email, language, theme, phone_format, date_format, address_format)"
            + " VALUES (:uid, :name, :email, :language, :theme, :phone, :date, :address)"
            + " ON CONFLICT (firebase_uid) DO UPDATE SET ";

    private static final String RETURNING = ", updated_at = now()"
            + " RETURNING name, email, language, theme, phone_format, date_format, address_format,"
            + " (xmax = 0) AS created,"
            + " (SELECT i.revision FROM image i WHERE i.kind = 'USER' AND i.user_id = app_user.id)"
            + " AS photo_revision";

    /** Ime in e-naslov iz žetona, izbira naprave samo v prazna polja profila (FR-001-19 b). */
    private static final String SYNC = INSERT
            + "name = excluded.name, email = excluded.email,"
            + " language = COALESCE(app_user.language, excluded.language),"
            + " theme = COALESCE(app_user.theme, excluded.theme),"
            + " phone_format = COALESCE(app_user.phone_format, excluded.phone_format),"
            + " date_format = COALESCE(app_user.date_format, excluded.date_format),"
            + " address_format = COALESCE(app_user.address_format, excluded.address_format)"
            + RETURNING;

    /** Oblike zapisa: manjka = nespremenjeno (FR-016-17), {@code null} = privzeto. */
    private static final String SAVE_PREFERENCES = INSERT
            + "language = excluded.language, theme = excluded.theme,"
            + " phone_format = CASE WHEN :phoneSet THEN excluded.phone_format ELSE app_user.phone_format END,"
            + " date_format = CASE WHEN :dateSet THEN excluded.date_format ELSE app_user.date_format END,"
            + " address_format = CASE WHEN :addressSet THEN excluded.address_format ELSE app_user.address_format END"
            + RETURNING;

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
                .param("phone", preferences.phoneFormat().name())
                .param("date", preferences.dateFormat().name())
                .param("address", preferences.addressFormat().name())
                .param("phoneSet", preferences.phoneFormat().present())
                .param("dateSet", preferences.dateFormat().present())
                .param("addressSet", preferences.addressFormat().present())
                .query(ProfileRepository::result)
                .single();
    }

    private static Result result(ResultSet row, int rowNumber) throws SQLException {
        Profile profile = new Profile(
                row.getString("name"),
                row.getString("email"),
                Language.fromCode(row.getString("language")).orElse(null),
                Theme.fromCode(row.getString("theme")).orElse(null),
                DisplayFormat.read(PhoneFormat.class, row.getString("phone_format")),
                DisplayFormat.read(DateFormat.class, row.getString("date_format")),
                DisplayFormat.read(AddressFormat.class, row.getString("address_format")),
                row.getObject("photo_revision", Long.class));
        return new Result(profile, row.getBoolean("created"));
    }
}
