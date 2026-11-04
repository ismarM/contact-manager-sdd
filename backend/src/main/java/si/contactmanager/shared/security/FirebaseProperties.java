package si.contactmanager.shared.security;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Nastavitve Firebase (research R-01): {@code FIREBASE_PROJECT_ID} → {@code firebase.project-id},
 * {@code FIREBASE_AUTH_EMULATOR_HOST} → {@code firebase.auth-emulator-host} (način emulatorja, ko ni prazen).
 */
@ConfigurationProperties("firebase")
public record FirebaseProperties(String projectId, String authEmulatorHost) {

    public boolean emulator() {
        return authEmulatorHost != null && !authEmulatorHost.isBlank();
    }
}
