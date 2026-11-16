package si.contactmanager.contact;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Možnost podvajanja ob obnovi kontakta (015, research R-07): obstoječi kontakti skupine, ki imajo enak e-naslov ali
 * isto ime in priimek kot ciljno stanje – po istih pravilih ujemanja kot dvojniki (011, {@link DuplicateKeys}). Samo
 * branje; ne blokira ničesar.
 */
@Component
public class DuplicateLookup {

    /** Največ zadetkov v opozorilu. */
    private static final int LIMIT = 5;

    /** Zadetek: obstoječi kontakt in razlog ujemanja. */
    public record Match(UUID contactId, String displayName, Reason reason) {}

    /** Razlog ujemanja. */
    public enum Reason {
        EMAIL,
        NAME
    }

    private final ContactRepository contacts;

    DuplicateLookup(ContactRepository contacts) {
        this.contacts = contacts;
    }

    /** Kontakti skupine, ki so možni dvojniki stanja {@code state} (razen {@code exceptId}); e-naslov pred imenom. */
    public List<Match> find(UUID group, ContactState state, UUID exceptId) {
        Optional<String> email = DuplicateKeys.key("email", state.firstName(), state.lastName(), state.email(), null);
        Optional<String> name = DuplicateKeys.key("name", state.firstName(), state.lastName(), null, null);
        if (email.isEmpty() && name.isEmpty()) {
            return List.of();
        }
        List<Match> byEmail = new ArrayList<>();
        List<Match> byName = new ArrayList<>();
        for (DuplicateCandidate candidate : contacts.duplicateCandidates(group)) {
            if (candidate.id().equals(exceptId)) {
                continue;
            }
            String display = ContactRepository.displayName(candidate.firstName(), candidate.lastName());
            if (email.isPresent()
                    && email.equals(DuplicateKeys.key(
                            "email", candidate.firstName(), candidate.lastName(), candidate.email(), null))) {
                byEmail.add(new Match(candidate.id(), display, Reason.EMAIL));
            } else if (name.isPresent()
                    && name.equals(
                            DuplicateKeys.key("name", candidate.firstName(), candidate.lastName(), null, null))) {
                byName.add(new Match(candidate.id(), display, Reason.NAME));
            }
        }
        List<Match> all = new ArrayList<>(byEmail);
        all.addAll(byName);
        return all.size() > LIMIT ? List.copyOf(all.subList(0, LIMIT)) : List.copyOf(all);
    }
}
