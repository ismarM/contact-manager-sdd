package si.contactmanager.account;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpClient;
import java.time.Duration;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.account.IdentityProvider.Outcome;
import si.contactmanager.shared.security.FirebaseProperties;
import si.contactmanager.support.FirebaseEmulatorContainer;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;

/**
 * Pristna izmenjava z Firebase Auth Emulatorjem (research R-06): dejanski izbris, idempotentnost, izpad in zavrnjena
 * avtorizacija. **Ne dokazuje** produkcijske konfiguracije (OAuth 2.0 dostop): to pokrivata unit test z lažnim
 * transportom in ročna vrata pred združitvijo (tasks T074).
 */
@Tag("FR-012-14")
@Tag("FR-012-17")
class FirebaseIdentityProviderIT {

    private static final IdentityDeletionProperties PROPERTIES = new IdentityDeletionProperties(
            false,
            Duration.ofSeconds(30),
            Duration.ofSeconds(30),
            Duration.ofSeconds(5),
            Duration.ofSeconds(2),
            Duration.ofHours(2));

    private final FirebaseEmulatorContainer emulator = FirebaseEmulatorContainer.shared();

    @AfterEach
    void emulatorRunning() {
        emulator.unpause();
    }

    private FirebaseIdentityProvider provider(AccessTokenSource tokens) {
        HttpClient http =
                HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
        FirebaseProperties firebase = new FirebaseProperties(
                FirebaseEmulatorContainer.PROJECT_ID,
                emulator.getHost() + ":" + emulator.getMappedPort(FirebaseEmulatorContainer.PORT));
        return new FirebaseIdentityProvider(http, tokens, PROPERTIES, firebase);
    }

    private SignedIn newIdentity() throws Exception {
        return emulator.signInWithGoogle("u-" + java.util.UUID.randomUUID() + "@primer.si", "Izmenjava");
    }

    @Test
    void deleteRemovesTheIdentityAndASecondCallIsNotFound() throws Exception {
        SignedIn identity = newIdentity();
        assertThat(emulator.identityExists(identity.uid())).isTrue();

        assertThat(provider(() -> "owner").delete(identity.uid())).isEqualTo(Outcome.DELETED);

        assertThat(emulator.identityExists(identity.uid()))
                .as("preverjeno z accounts:lookup")
                .isFalse();
        assertThat(provider(() -> "owner").delete(identity.uid())).isEqualTo(Outcome.NOT_FOUND);
    }

    @Test
    void frozenEmulatorMeansRetryWithinTheTimeoutBudget() throws Exception {
        SignedIn identity = newIdentity();
        long started = System.nanoTime();
        Outcome[] outcome = new Outcome[1];

        emulator.paused(() -> outcome[0] = provider(() -> "owner").delete(identity.uid()));

        assertThat(outcome[0]).isEqualTo(Outcome.RETRY);
        assertThat((System.nanoTime() - started) / 1_000_000).isLessThanOrEqualTo(9000);
        assertThat(emulator.identityExists(identity.uid()))
                .as("po odmrznitvi identiteta še obstaja")
                .isTrue();
    }

    @Test
    void rejectedAuthorizationMeansMisconfiguredAndTheIdentityIsKept() throws Exception {
        SignedIn identity = newIdentity();

        Outcome outcome = provider(() -> "nonsense").delete(identity.uid());

        assertThat(outcome).isEqualTo(Outcome.MISCONFIGURED);
        assertThat(emulator.identityExists(identity.uid())).isTrue();
    }

    @Test
    void usersOwnIdTokenIsNotAnAdministrativeCredential() throws Exception {
        SignedIn identity = newIdentity();

        Outcome outcome = provider(identity::idToken).delete(identity.uid());

        assertThat(outcome).as("ID žeton uporabnika ni pooblastilo za brisanje").isNotIn(Outcome.DELETED);
        assertThat(emulator.identityExists(identity.uid())).isTrue();
    }
}
