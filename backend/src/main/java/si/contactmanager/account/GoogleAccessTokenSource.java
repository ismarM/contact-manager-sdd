package si.contactmanager.account;

import com.google.auth.oauth2.GoogleCredentials;
import java.io.IOException;
import java.util.List;

/**
 * OAuth 2.0 dostopni žeton storitvenega računa za Identity Toolkit v produkciji (D-73, D-74): privzete poverilnice
 * aplikacije ({@code GOOGLE_APPLICATION_CREDENTIALS} ali metapodatkovni strežnik), obseg {@code cloud-platform}. Knjižnica
 * žeton osvežuje. Nikoli ID žeton uporabnika; poverilnice so samo v okolju, ne v kodi ali konfiguraciji.
 */
final class GoogleAccessTokenSource implements AccessTokenSource {

    private static final List<String> SCOPES = List.of("https://www.googleapis.com/auth/cloud-platform");

    private volatile GoogleCredentials credentials;

    @Override
    public String token() throws IOException {
        GoogleCredentials current = credentials;
        if (current == null) {
            synchronized (this) {
                if (credentials == null) {
                    credentials = GoogleCredentials.getApplicationDefault().createScoped(SCOPES);
                }
                current = credentials;
            }
        }
        current.refreshIfExpired();
        return current.getAccessToken().getTokenValue();
    }
}
