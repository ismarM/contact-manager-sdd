package si.contactmanager.account;

import java.net.http.HttpClient;
import si.contactmanager.shared.security.FirebaseProperties;

/** REST {@code accounts:delete} (research R-06). Ogrodje – vedenje pride z implementacijo. */
final class FirebaseIdentityProvider implements IdentityProvider {

    FirebaseIdentityProvider(
            HttpClient http,
            AccessTokenSource tokens,
            IdentityDeletionProperties properties,
            FirebaseProperties firebase) {}

    @Override
    public Outcome delete(String uid) {
        throw new UnsupportedOperationException("not implemented: FirebaseIdentityProvider.delete (FR-012-17)");
    }
}
