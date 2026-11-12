package si.contactmanager.account;

import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import si.contactmanager.account.AccountDeletionRepository.UserRow;
import si.contactmanager.account.DeleteAccountInputParser.ParsedDeletion;
import si.contactmanager.account.IdentityProvider.Result;
import si.contactmanager.shared.error.UnauthenticatedException;
import si.contactmanager.shared.error.ValidationError.FieldError;
import si.contactmanager.shared.error.ValidationException;

/**
 * Orkestracija izbrisa računa BREZ transakcije (research R-01, R-07): predpreverjanje e-naslova brez zaklepov, kratka
 * lokalna transakcija ({@link LocalAccountDeletion}), nato zunaj transakcije takojšen klic Firebase; izid se zapiše v
 * lastni kratki transakciji. {@code 204}, če je identiteta izbrisana (ali je ni več), sicer {@code 202} in ponavljanje
 * v opravilu. PostgreSQL in Firebase ne tvorita skupne transakcije.
 */
@Service
class AccountDeletionService {

    enum DeletionResult {
        DELETED,
        PENDING
    }

    private static final Logger LOG = LoggerFactory.getLogger(AccountDeletionService.class);

    private final AccountDeletionRepository repository;
    private final LocalAccountDeletion local;
    private final DeletedIdentities deleted;
    private final IdentityProvider identities;

    AccountDeletionService(
            AccountDeletionRepository repository,
            LocalAccountDeletion local,
            DeletedIdentities deleted,
            IdentityProvider identities) {
        this.repository = repository;
        this.local = local;
        this.deleted = deleted;
        this.identities = identities;
    }

    DeletionResult delete(Jwt jwt, String body) {
        UserRow user = repository.findByUid(jwt.getSubject()).orElseThrow(UnauthenticatedException::new);
        ParsedDeletion parsed = DeleteAccountInputParser.parse(body);
        if (!parsed.errors().isEmpty()) {
            throw new ValidationException(parsed.errors());
        }
        if (!DeleteAccountInputParser.matches(parsed.email(), user.email())) {
            throw new ValidationException(List.of(new FieldError("email", "MISMATCH")));
        }
        String uid = executeLocally(user.id(), parsed.email());
        Result result = identities.deleteWithDetail(uid);
        if (result.outcome().success()) {
            deleted.markDeleted(uid);
            return DeletionResult.DELETED;
        }
        deleted.markFailed(uid, result.error(), IdentityRetryBackoff.delay(0));
        return DeletionResult.PENDING;
    }

    /** Lokalna transakcija; ob mrtvem objemu (SQLSTATE 40P01) en ponovni poskus celotne transakcije. */
    private String executeLocally(long user, String email) {
        try {
            return local.execute(user, email);
        } catch (PessimisticLockingFailureException e) {
            LOG.warn("Mrtvi objem pri izbrisu računa, ponovni poskus");
            return local.execute(user, email);
        }
    }
}
