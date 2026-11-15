package si.contactmanager.account;

import java.util.Optional;
import org.springframework.stereotype.Component;

/**
 * Prijava CardDAV z e-naslovom računa in geslom za aplikacijo (FR-014-22, -26; research R-09). Med zaklepom se geslo
 * ne preverja; neobstoječ račun porabi enako delo kot obstoječ (ne razkrije obstoja); uspeh ponastavi štetje.
 */
@Component
public class AppPasswordAuthenticator {

    /** Neuspehov v 15 minutah do zaklepa (FR-014-26). */
    static final int FAILURE_LIMIT = 10;

    private static final byte[] DUMMY = AppPasswords.hash("ni-gesla");

    /** Prijavljen uporabnik CardDAV: id računa, e-naslov in jezik vizitk (shranjeni jezik, privzeto {@code sl}). */
    public record DavAccount(long userId, String email, String language) {}

    private final AppPasswordRepository repository;

    AppPasswordAuthenticator(AppPasswordRepository repository) {
        this.repository = repository;
    }

    public Optional<DavAccount> authenticate(String email, String password) {
        byte[] candidate = AppPasswords.hash(password == null ? "" : password);
        Optional<AppPasswordRepository.Account> account =
                email == null ? Optional.empty() : repository.accountByEmail(email.strip());
        if (account.isEmpty()) {
            AppPasswords.matches(candidate, DUMMY);
            return Optional.empty();
        }
        long user = account.get().id();
        if (repository.locked(user)) {
            return Optional.empty();
        }
        AppPasswordRepository.Stored matched = null;
        for (AppPasswordRepository.Stored stored : repository.stored(user)) {
            if (AppPasswords.matches(candidate, stored.hash()) && matched == null) {
                matched = stored;
            }
        }
        if (matched == null) {
            repository.recordFailure(user, FAILURE_LIMIT);
            return Optional.empty();
        }
        repository.recordSuccess(user);
        repository.touch(matched.id());
        String language = "en".equals(account.get().language()) ? "en" : "sl";
        return Optional.of(new DavAccount(user, account.get().email(), language));
    }
}
