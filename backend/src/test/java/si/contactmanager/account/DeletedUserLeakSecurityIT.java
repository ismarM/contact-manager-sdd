package si.contactmanager.account;

import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import si.contactmanager.account.support.AccountApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;

/**
 * SC-004: po izbrisu računa ime in e-naslov nista več nikjer v podatkih sistema (razen v podatkih kontaktov), v
 * nadgrobniku je samo UID, dnevnik zaledja ne vsebuje osebnih podatkov, žetonov ali poverilnic (FR-012-12).
 */
@Tag("FR-012-12")
@Import(SwitchableAccessTokens.class)
class DeletedUserLeakSecurityIT extends AccountApiTest {

    @Autowired
    private IdentityDeletionJob job;

    private final ListAppender<ILoggingEvent> logs = new ListAppender<>();
    private Logger root;

    @BeforeEach
    void captureLogs() {
        root = (Logger) LoggerFactory.getLogger(Logger.ROOT_LOGGER_NAME);
        logs.start();
        root.addAppender(logs);
    }

    @BeforeEach
    void noForeignOpenTombstones() {
        jdbc.update("delete from deleted_identity where provider_deleted_at is null");
    }

    @AfterEach
    void releaseLogs() {
        root.detachAppender(logs);
        SwitchableAccessTokens.reset();
    }

    private String allLogText() {
        StringBuilder text = new StringBuilder();
        for (ILoggingEvent event : List.copyOf(logs.list)) {
            text.append(event.getFormattedMessage()).append('\n');
            if (event.getThrowableProxy() != null) {
                text.append(event.getThrowableProxy().getMessage()).append('\n');
            }
            text.append(event.getMDCPropertyMap()).append('\n');
        }
        return text.toString();
    }

    @Test
    void nameAndEmailOfTheDeletedUserAreNowhereExceptInContactDataAndLogsStayClean() throws Exception {
        String unique = UUID.randomUUID().toString().substring(0, 8);
        String name = "IzbrisanoIme" + unique;
        SignedIn x = emulator().signInWithGoogle("izbrisan-" + unique + "@primer.si", name);
        assertThat(put("/api/me", x.idToken(), null).statusCode()).isEqualTo(201);
        String email = email(x);
        SignedIn ana = registeredUser("Ana Ostane");
        SignedIn cene = registeredUser("Cene Ostane");
        UUID shared = activeGroup(ana, "Skupna");
        groups.addMember(shared, id(x), "ADMIN");
        UUID archivedSole = archivedGroup(x, "Arhivirana");
        UUID archivedWithOthers = archivedGroup(x, "Arhivirana z drugimi");
        groups.addMember(archivedWithOthers, id(cene), "VIEWER");
        invitations.invite(shared, id(cene), id(x), "VIEWER");
        invitations.invite(activeGroup(ana, "Druga"), id(x), id(ana), "EDITOR");
        assertThat(createContact(shared, x, "Kontakt")).isEqualTo(201);
        groups.setUpdatedBy(shared, id(x));
        String uid = x.uid();
        String idToken = x.idToken();

        int status = deleteAccount(x).statusCode();
        job.runOnce();
        export(ana);

        assertThat(status).isIn(204, 202);
        assertThat(account.findText(name)).as("ime v tabelah razen kontaktov").isEmpty();
        assertThat(account.findText(email))
                .as("e-naslov v tabelah razen kontaktov")
                .isEmpty();
        assertThat(jdbc.queryForList("select * from deleted_identity where firebase_uid = ?", uid))
                .hasSize(1);
        assertThat(jdbc.queryForList("select * from deleted_identity where firebase_uid = ?", uid)
                        .getFirst()
                        .values()
                        .toString())
                .doesNotContain(name)
                .doesNotContain(email);
        String log = allLogText();
        assertThat(log)
                .doesNotContain(name)
                .doesNotContain(email)
                .doesNotContain(uid)
                .doesNotContain(idToken);
        assertThat(log).doesNotContain("Bearer").doesNotContain("ya29.").doesNotContain("private_key");
        assertThat(groups.exists(archivedSole))
                .as("skupina z edinim članom je izbrisana")
                .isFalse();
        assertThat(groups.exists(archivedWithOthers)).isTrue();
    }

    @Test
    void rejectedCredentialsPathDoesNotLeakPersonalDataOrTokensInTheLog() throws Exception {
        String unique = UUID.randomUUID().toString().substring(0, 8);
        String name = "PoverilniceIme" + unique;
        SignedIn x = emulator().signInWithGoogle("poverilnice-" + unique + "@primer.si", name);
        assertThat(put("/api/me", x.idToken(), null).statusCode()).isEqualTo(201);
        String email = email(x);
        String uid = x.uid();
        String idToken = x.idToken();
        SwitchableAccessTokens.useInvalidCredentials();

        int status = deleteAccount(x).statusCode();
        account.makeDue(uid);
        job.runOnce();
        account.makeDue(uid);
        job.runOnce();

        assertThat(status).isEqualTo(202);
        assertThat(account.tombstone(uid).getFirst().get("attempts")).isEqualTo(3);
        assertThat(account.tombstone(uid).getFirst().get("last_error")).isEqualTo("HTTP_401");
        String log = allLogText();
        assertThat(log)
                .doesNotContain(name)
                .doesNotContain(email)
                .doesNotContain(uid)
                .doesNotContain(idToken)
                .doesNotContain("nonsense")
                .doesNotContain("Bearer")
                .doesNotContain("ya29.");
        assertThat(account.findText(name)).isEmpty();
        assertThat(account.findText(email)).isEmpty();
    }

    @Test
    void outageAndRetryPathsDoNotLeakEitherInTheLog() throws Exception {
        String unique = UUID.randomUUID().toString().substring(0, 8);
        String name = "IzpadIme" + unique;
        SignedIn x = emulator().signInWithGoogle("izpad-" + unique + "@primer.si", name);
        assertThat(put("/api/me", x.idToken(), null).statusCode()).isEqualTo(201);
        String email = email(x);
        String uid = x.uid();
        int[] status = new int[1];

        emulator().paused(() -> status[0] = deleteAccount(x).statusCode());
        account.makeDue(uid);
        emulator().paused(job::runOnce);
        account.makeDue(uid);
        job.runOnce();

        assertThat(status[0]).isEqualTo(202);
        assertThat(account.tombstone(uid).getFirst().get("provider_deleted_at")).isNotNull();
        String log = allLogText();
        assertThat(log)
                .doesNotContain(name)
                .doesNotContain(email)
                .doesNotContain(uid)
                .doesNotContain("Bearer");
    }
}
