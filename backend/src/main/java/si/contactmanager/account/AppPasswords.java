package si.contactmanager.account;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Locale;

/**
 * Gesla za aplikacijo (FR-014-21; research R-09): 28 naključnih znakov iz abecede base32 brez dvoumnih črk
 * ({@code i l o u}) – 140 bitov –, prikazanih v skupinah po 4 z {@code -}. Hrani se samo SHA-256 normaliziranega gesla
 * (brez {@code -} in presledkov, male črke); visoka entropija naredi počasno zgoščevanje nepotrebno.
 */
final class AppPasswords {

    static final String ALPHABET = "abcdefghjkmnpqrstvwxyz0123456789";

    static final int LENGTH = 28;

    private static final SecureRandom RANDOM = new SecureRandom();

    private AppPasswords() {}

    /** Novo geslo v prikazni obliki ({@code xxxx-xxxx-…}). */
    static String generate() {
        StringBuilder password = new StringBuilder(LENGTH + LENGTH / 4);
        for (int i = 0; i < LENGTH; i++) {
            if (i > 0 && i % 4 == 0) {
                password.append('-');
            }
            password.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
        }
        return password.toString();
    }

    /** Oblika za primerjavo: brez {@code -} in presledkov, male črke. */
    static String normalize(String password) {
        return password.replaceAll("[\\s-]", "").toLowerCase(Locale.ROOT);
    }

    static byte[] hash(String password) {
        try {
            return MessageDigest.getInstance("SHA-256")
                    .digest(normalize(password).getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 ni na voljo", e);
        }
    }

    /** Primerjava v konstantnem času. */
    static boolean matches(byte[] candidate, byte[] stored) {
        return MessageDigest.isEqual(candidate, stored);
    }
}
