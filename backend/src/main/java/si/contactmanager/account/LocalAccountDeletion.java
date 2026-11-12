package si.contactmanager.account;

import java.util.HashSet;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import si.contactmanager.account.AccountDeletionRepository.UserRow;
import si.contactmanager.shared.error.OwnsActiveGroupsException;
import si.contactmanager.shared.error.UnauthenticatedException;
import si.contactmanager.shared.error.ValidationError.FieldError;
import si.contactmanager.shared.error.ValidationException;

/**
 * Lokalni izbris računa v ENI kratki transakciji (FR-012-13; research R-04, R-05): zaklep vseh skupin po naraščajočem
 * {@code id}, odločitev na ponovno prebranem stanju pod zaklepi, izbris skupin z edinim članom, izbris uporabnika (kaskade
 * V3–V8) in nadgrobnik z zakupom. V transakciji ni zunanjih klicev.
 */
@Component
class LocalAccountDeletion {

    private static final int LOCK_ATTEMPTS = 3;

    private final AccountDeletionRepository repository;
    private final DeletedIdentities deleted;
    private final IdentityDeletionProperties properties;

    LocalAccountDeletion(
            AccountDeletionRepository repository, DeletedIdentities deleted, IdentityDeletionProperties properties) {
        this.repository = repository;
        this.deleted = deleted;
        this.properties = properties;
    }

    /** Vrne Firebase UID izbrisanega uporabnika. */
    @Transactional
    String execute(long user, String email) {
        lockAllGroups(user);
        UserRow row = repository.findById(user).orElseThrow(UnauthenticatedException::new);
        if (!DeleteAccountInputParser.matches(email, row.email())) {
            throw new ValidationException(List.of(new FieldError("email", "MISMATCH")));
        }
        List<BlockingGroup> blocking = repository.blockingGroups(user);
        if (!blocking.isEmpty()) {
            throw new OwnsActiveGroupsException(blocking);
        }
        repository.deleteGroups(repository.groupsToDelete(user));
        if (repository.deleteUser(user) == 0) {
            throw new UnauthenticatedException();
        }
        deleted.insert(row.uid(), properties.lease());
        return row.uid();
    }

    /** Zaklene skupine; če se je množica skupin med zaklepanjem spremenila (sočasen sprejem povabila), ponovi. */
    private void lockAllGroups(long user) {
        for (int attempt = 0; attempt < LOCK_ATTEMPTS; attempt++) {
            List<UUID> locked = repository.lockGroups(user);
            if (new HashSet<>(locked).equals(new HashSet<>(repository.memberGroupIds(user)))) {
                return;
            }
        }
        throw new IllegalStateException("group membership kept changing while locking");
    }
}
