package si.contactmanager.account;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.support.ApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;

/**
 * Trk e-naslova med dvema Firebase UID (FR-017-11) in vnos matrike izolacije za uporabniški vir {@code PUT /api/me}:
 * neprijavljen 401, drugi UID z istim e-naslovom (razlika samo v velikosti črk) 409 {@code ACCOUNT_CONFLICT}, profil
 * prvega nespremenjen, nepotrjen e-naslov 403 {@code EMAIL_NOT_VERIFIED} (filter pred kontrolerjem, FR-017-02).
 */
@Tag("FR-017-11")
class AccountConflictIT extends ApiTest {

    @Test
    void secondUidWithSameEmailIgnoringCaseIsRejectedWith409() throws Exception {
        // Emulator pri Googlovi prijavi z istim e-naslovom poveže račune (isti UID); zato je profil prvega UID
        // vstavljen
        // neposredno, drugi UID z istim e-naslovom (druga velikost črk) pa pride prek pravega žetona.
        String email = uniqueEmail();
        String firstUid = "uid-" + UUID.randomUUID();
        jdbc.update("insert into app_user (firebase_uid, name, email) values (?, 'Prva Ana', ?)", firstUid, email);
        int before = profileCount();

        SignedIn second = emulator().signInWithGoogle(email.toUpperCase(), "Druga Ana");
        assertThat(second.uid()).isNotEqualTo(firstUid);
        HttpResponse<String> response = put("/api/me", second.idToken(), null);

        assertThat(response.statusCode()).isEqualTo(409);
        assertThat(json(response.body())).containsEntry("code", "ACCOUNT_CONFLICT");
        assertThat(profileRows(second.uid())).isEmpty();
        assertThat(profileCount()).isEqualTo(before);
        Map<String, Object> row = profileRows(firstUid).getFirst();
        assertThat(row).containsEntry("name", "Prva Ana").containsEntry("email", email);
    }

    @Test
    void unverifiedSecondUidWithSameEmailIs403BeforeConflictCheck() throws Exception {
        String email = uniqueEmail();
        String firstUid = "uid-" + UUID.randomUUID();
        jdbc.update("insert into app_user (firebase_uid, name, email) values (?, 'Prva Ana', ?)", firstUid, email);
        int before = profileCount();

        SignedIn second = emulator().signUpWithPassword(email.toUpperCase(), "geslo-12345678");
        HttpResponse<String> response = put("/api/me", second.idToken(), null);

        assertThat(response.statusCode()).isEqualTo(403);
        assertThat(json(response.body())).containsEntry("code", "EMAIL_NOT_VERIFIED");
        assertThat(profileCount()).isEqualTo(before);
        assertThat(profileRows(firstUid).getFirst()).containsEntry("name", "Prva Ana");
    }

    @Test
    void unauthenticatedRequestIs401() throws Exception {
        assertThat(put("/api/me", null, null).statusCode()).isEqualTo(401);
        assertThat(put("/api/me", "to.ni.zeton", null).statusCode()).isEqualTo(401);
    }
}
