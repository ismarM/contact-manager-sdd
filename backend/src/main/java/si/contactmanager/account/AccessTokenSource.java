package si.contactmanager.account;

import java.io.IOException;

/** Vir OAuth 2.0 dostopnega žetona za Identity Toolkit (v emulatorju {@code owner}); nikoli ID žeton uporabnika. */
interface AccessTokenSource {

    String token() throws IOException;
}
