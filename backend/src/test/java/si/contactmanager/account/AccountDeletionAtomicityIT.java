package si.contactmanager.account;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.account.support.AccountApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;

/**
 * Atomarnost lokalnega izbrisa (FR-012-13, analiza M1): vsiljena napaka sredi izbrisa pusti stanje nespremenjeno,
 * ponovni izbris nato uspe. Neodvisno od sočasnosti.
 */
@Tag("FR-012-13")
class AccountDeletionAtomicityIT extends AccountApiTest {

    @Test
    void failureInTheMiddleOfDeletionRollsBackEverything() throws Exception {
        SignedIn x = registeredUser("Iks Atomarno");
        SignedIn a = registeredUser("Ana Atomarno");
        UUID soleOwned = archivedGroup(x, "Arhivirana edini");
        UUID contact = contacts.insert(soleOwned, id(x), "Ostane", "Kontakt");
        audit.insertEntries(soleOwned, id(x), 2);
        UUID withOthers = archivedGroup(x, "Arhivirana z drugimi");
        groups.addMember(withOthers, id(a), "EDITOR");
        UUID active = activeGroup(a, "Aktivna");
        groups.addMember(active, id(x), "EDITOR");
        UUID invited = activeGroup(a, "Vabilo");
        UUID received = invitations.invite(invited, id(x), id(a), "VIEWER");
        UUID sent = invitations.invite(active, id(a), id(x), "VIEWER");
        long xId = id(x);

        jdbc.execute("create or replace function fail_delete_app_user() returns trigger language plpgsql as $$"
                + " begin raise exception 'vsiljena napaka'; end $$");
        jdbc.execute("create trigger fail_delete_app_user before delete on app_user"
                + " for each row execute function fail_delete_app_user()");
        HttpResponse<String> failed;
        try {
            failed = deleteAccount(x);
        } finally {
            jdbc.execute("drop trigger if exists fail_delete_app_user on app_user");
            jdbc.execute("drop function if exists fail_delete_app_user()");
        }

        assertThat(failed.statusCode()).isEqualTo(500);
        assertThat(account.appUserExists(x.uid())).isTrue();
        assertThat(jdbc.queryForObject("select count(*) from group_member where user_id = ?", Integer.class, xId))
                .isEqualTo(3);
        assertThat(groups.exists(soleOwned)).isTrue();
        assertThat(contacts.exists(contact)).isTrue();
        assertThat(audit.count(soleOwned)).isEqualTo(2);
        assertThat(groups.exists(withOthers)).isTrue();
        assertThat(members.ownerCount(withOthers)).isEqualTo(1);
        assertThat(invitations.exists(received)).isTrue();
        assertThat(invitations.exists(sent)).isTrue();
        assertThat(jdbc.queryForObject("select inviter_id from invitation where id = ?", Long.class, sent))
                .isEqualTo(xId);
        assertThat(account.tombstone(x.uid())).as("nadgrobnika ni").isEmpty();
        assertThat(get("/api/groups", x.idToken()).statusCode())
                .as("žeton še velja")
                .isEqualTo(200);

        assertThat(deleteAccount(x).statusCode()).isIn(204, 202);
        assertThat(account.appUserExists(x.uid())).isFalse();
        assertThat(groups.exists(soleOwned)).isFalse();
    }
}
