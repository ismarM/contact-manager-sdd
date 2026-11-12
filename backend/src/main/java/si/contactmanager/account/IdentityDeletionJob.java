package si.contactmanager.account;

import org.springframework.stereotype.Component;

/** Ponavljanje brisanja identitete in čiščenje nadgrobnikov (R-07). Ogrodje – vedenje pride z implementacijo. */
@Component
public class IdentityDeletionJob {

    /** Eden obhod: čiščenje, prevzem zapadlih vrstic, brisanje pri ponudniku. */
    public void runOnce() {
        throw new UnsupportedOperationException("not implemented: IdentityDeletionJob.runOnce (FR-012-18)");
    }
}
