package si.contactmanager.account;

/** Brisanje identitete pri ponudniku prijave (012, research R-06). */
interface IdentityProvider {

    /** {@code DELETED}, {@code NOT_FOUND} → uspeh (204); {@code RETRY}, {@code MISCONFIGURED} → ponavljanje (202). */
    enum Outcome {
        DELETED,
        NOT_FOUND,
        RETRY,
        MISCONFIGURED
    }

    Outcome delete(String uid);
}
