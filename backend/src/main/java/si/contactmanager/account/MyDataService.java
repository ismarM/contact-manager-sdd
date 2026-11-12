package si.contactmanager.account;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import si.contactmanager.account.MyDataRepository.ProfileWithId;
import si.contactmanager.shared.error.UnauthenticatedException;

/**
 * Izvoz mojih podatkov (012, research R-09): vsa branja v enem posnetku {@code REPEATABLE READ, READ ONLY}, zato je izvoz
 * popoln (stanje pred sočasnim izbrisom računa) ali pa uporabnika ni več ({@code 401}), nikoli delen. Uporabnik se
 * določi samo iz žetona (FR-012-16).
 */
@Service
class MyDataService {

    private final MyDataRepository repository;
    private final AccountDeletionRepository deletion;

    MyDataService(MyDataRepository repository, AccountDeletionRepository deletion) {
        this.repository = repository;
        this.deletion = deletion;
    }

    /** Nearhivirane skupine v lasti, ki preprečujejo izbris računa (FR-012-06); ista poizvedba kot za {@code 409}. */
    @Transactional(readOnly = true)
    DeletionBlockers deletionBlockers(Jwt jwt) {
        long user = repository
                .profile(jwt.getSubject())
                .orElseThrow(UnauthenticatedException::new)
                .id();
        return new DeletionBlockers(deletion.blockingGroups(user));
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    MyData export(Jwt jwt) {
        ProfileWithId profile = repository.profile(jwt.getSubject()).orElseThrow(UnauthenticatedException::new);
        long user = profile.id();
        return ExportAssembler.assemble(
                Instant.now().truncatedTo(ChronoUnit.MILLIS),
                profile.profile(),
                repository.memberships(user),
                repository.receivedInvitations(user),
                repository.sentInvitations(user),
                repository.ownedGroups(user));
    }
}
