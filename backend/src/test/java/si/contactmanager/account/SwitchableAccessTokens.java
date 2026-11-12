package si.contactmanager.account;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/**
 * Vir OAuth dostopnega žetona za teste (012, R-06, R-13): privzeto {@code owner} (pravilen v emulatorju); test lahko
 * preklopi na neveljavne poverilnice ({@code "nonsense"}), ki jih emulator resnično zavrne z {@code 401}, in nazaj.
 * Ni ponaredek odjemalca Firebase: zahtevek odide pravemu emulatorju.
 */
@TestConfiguration
class SwitchableAccessTokens {

    private static volatile String token = "owner";

    static void useInvalidCredentials() {
        token = "nonsense";
    }

    static void reset() {
        token = "owner";
    }

    @Bean
    @Primary
    AccessTokenSource switchableAccessTokens() {
        return () -> token;
    }
}
