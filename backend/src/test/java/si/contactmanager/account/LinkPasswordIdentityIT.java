package si.contactmanager.account;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.group.support.GroupFixtures;
import si.contactmanager.support.ApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;

/**
 * Dodajanje gesla Google računu (FR-017-09 … 11): {@code accounts:signUp} z {@code idToken} ohrani isti Firebase UID,
 * prijava z geslom da isti {@code localId}, {@code PUT /api/me} vrne isti profil in članstva, v bazi ostane ena vrstica
 * {@code app_user}. Opomba: emulator zaščite pred naštevanjem e-naslovov (EEP) ne posnema; vedenje s pravim projektom
 * preveri razvojnik ročno (T024, quickstart).
 */
@Tag("FR-017-10")
@Tag("FR-017-11")
class LinkPasswordIdentityIT extends ApiTest {

    private static final String GESLO = "geslo-12345678";

    @Test
    void linkingPasswordKeepsUidProfileAndMemberships() throws Exception {
        SignedIn google = registeredUser("Ana Google");
        String email = (String) profileRows(google.uid()).getFirst().get("email");
        GroupFixtures groups = new GroupFixtures(jdbc);
        long userId = groups.userId(google.uid());
        UUID group = groups.createGroup(userId, "Moja skupina");
        int profiles = profileCount();

        String localId = emulator().linkPassword(google.idToken(), email, GESLO);
        SignedIn withPassword = emulator().signInWithPassword(email, GESLO);

        assertThat(localId).isEqualTo(google.uid());
        assertThat(withPassword.uid()).isEqualTo(google.uid());
        HttpResponse<String> sync = put("/api/me", withPassword.idToken(), null);
        assertThat(sync.statusCode()).isEqualTo(200);
        Map<String, Object> profile = json(sync.body());
        assertThat(profile).containsEntry("email", email).containsEntry("name", "Ana Google");
        assertThat(profileCount()).isEqualTo(profiles);
        assertThat(profileRows(google.uid())).hasSize(1);
        assertThat(groups.userId(google.uid())).isEqualTo(userId);
        assertThat(get("/api/groups/" + group, withPassword.idToken()).statusCode())
                .isEqualTo(200);
        // Stari Google žeton ostane veljaven in ima isto identiteto.
        assertThat(put("/api/me", google.idToken(), null).statusCode()).isEqualTo(200);
    }

    @Test
    void passwordSignUpWithExistingEmailDoesNotCreateSecondProfile() throws Exception {
        SignedIn google = registeredUser("Ana Obstaja");
        String email = (String) profileRows(google.uid()).getFirst().get("email");
        int profiles = profileCount();

        // Emulator brez EEP: registracija z e-naslovom Google računa je zavrnjena ali ustvari nepotrjen račun, ki ga
        // filter (FR-017-02) ustavi pred profilom; v obeh primerih drugega profila ni.
        try {
            SignedIn second = emulator().signUpWithPassword(email, GESLO);
            HttpResponse<String> response = put("/api/me", second.idToken(), null);
            assertThat(response.statusCode()).isIn(403, 409);
        } catch (IllegalStateException rejected) {
            assertThat(rejected.getMessage()).contains("EMAIL_EXISTS");
        }

        assertThat(profileCount()).isEqualTo(profiles);
        assertThat(profileRows(google.uid())).hasSize(1);
    }
}
