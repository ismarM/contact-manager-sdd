package si.contactmanager.account;

import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;

/** Orkestracija izbrisa računa brez transakcije (R-07). Ogrodje – vedenje pride z implementacijo. */
@Service
class AccountDeletionService {

    enum DeletionResult {
        DELETED,
        PENDING
    }

    DeletionResult delete(Jwt jwt, String body) {
        throw new UnsupportedOperationException("not implemented: AccountDeletionService.delete (FR-012-17)");
    }
}
