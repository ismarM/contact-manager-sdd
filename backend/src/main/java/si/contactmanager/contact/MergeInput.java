package si.contactmanager.contact;

import java.util.List;
import java.util.UUID;

/** Telo {@code POST …/duplicates/merge} po razčlenitvi (data-model.md – MergeRequest). */
public record MergeInput(List<Target> contacts, ContactInput result) {

    /** Vključeni kontakt in verzija, ki jo je uporabnik videl ob odprtju primerjave. */
    public record Target(UUID id, long version) {}
}
