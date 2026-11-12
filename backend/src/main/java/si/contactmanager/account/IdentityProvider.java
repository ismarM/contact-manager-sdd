package si.contactmanager.account;

/** Brisanje identitete pri ponudniku prijave (012, research R-06). */
interface IdentityProvider {

    /** {@code DELETED}, {@code NOT_FOUND} → uspeh (204); {@code RETRY}, {@code MISCONFIGURED} → ponavljanje (202). */
    enum Outcome {
        DELETED,
        NOT_FOUND,
        RETRY,
        MISCONFIGURED;

        boolean success() {
            return this == DELETED || this == NOT_FOUND;
        }
    }

    /** Izid s kratko kodo napake za {@code deleted_identity.last_error} (brez UID-a, e-naslova ali žetonov). */
    record Result(Outcome outcome, String error) {

        static Result of(Outcome outcome) {
            return new Result(outcome, null);
        }
    }

    Result deleteWithDetail(String uid);

    default Outcome delete(String uid) {
        return deleteWithDetail(uid).outcome();
    }
}
