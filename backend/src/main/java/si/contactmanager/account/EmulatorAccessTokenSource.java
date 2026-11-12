package si.contactmanager.account;

/** Auth Emulator sprejme lastniški žeton {@code owner}; poverilnic ni (012, research R-06). */
final class EmulatorAccessTokenSource implements AccessTokenSource {

    @Override
    public String token() {
        return "owner";
    }
}
