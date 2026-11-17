package si.contactmanager.account;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.account.support.AccountApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import si.contactmanager.support.Tokens;

/**
 * Izbris računa zahteva svežo prijavo (FR-017-12): žeton s starim ali manjkajočim {@code auth_time} dobi {@code 403
 * REAUTHENTICATION_REQUIRED} pred vsako obdelavo (tudi pred preverjanjem e-naslova), nič se ne izbriše; z žetonom,
 * ki dokazuje sveže prijavo, izbris uspe.
 */
@Tag("FR-017-12")
class AccountDeletionReauthIT extends AccountApiTest {

    @Test
    void staleAuthTimeIsRejectedAndNothingIsDeleted() throws Exception {
        SignedIn pia = registeredUser("Pia Stara Prijava");
        SignedIn ana = registeredUser("Ana Skupina");
        UUID group = activeGroup(ana, "Skupina");
        groups.addMember(group, id(pia), "EDITOR");
        String stale = Tokens.withClaims(pia.idToken(), c -> c.put("auth_time", Tokens.epochSeconds(-301)));

        HttpResponse<String> response = post("/api/me/deletion", stale, deletionBody(email(pia)));

        assertThat(response.statusCode()).isEqualTo(403);
        assertThat(JSON.readTree(response.body()).get("code").asString()).isEqualTo("REAUTHENTICATION_REQUIRED");
        assertThat(account.appUserExists(pia.uid())).isTrue();
        assertThat(members.role(group, id(pia))).contains("EDITOR");
        assertThat(account.tombstone(pia.uid())).isEmpty();
        assertThat(emulator().identityExists(pia.uid())).isTrue();
    }

    @Test
    void missingAuthTimeIsRejectedBeforeEmailValidation() throws Exception {
        SignedIn pia = registeredUser("Pia Brez Casa");
        String noClaim = Tokens.withClaims(pia.idToken(), c -> c.remove("auth_time"));

        HttpResponse<String> response = post("/api/me/deletion", noClaim, "{}");

        assertThat(response.statusCode()).isEqualTo(403);
        assertThat(JSON.readTree(response.body()).get("code").asString()).isEqualTo("REAUTHENTICATION_REQUIRED");
        assertThat(account.appUserExists(pia.uid())).isTrue();
    }

    @Test
    void freshAuthTimeAllowsDeletion() throws Exception {
        SignedIn pia = registeredUser("Pia Sveza Prijava");
        String fresh = Tokens.withClaims(pia.idToken(), c -> c.put("auth_time", Tokens.epochSeconds(-30)));

        HttpResponse<String> response = post("/api/me/deletion", fresh, deletionBody(email(pia)));

        assertThat(response.statusCode()).isEqualTo(204);
        assertThat(account.appUserExists(pia.uid())).isFalse();
    }
}
