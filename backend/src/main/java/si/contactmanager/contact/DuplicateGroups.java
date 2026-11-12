package si.contactmanager.contact;

import java.text.Collator;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * Grupiranje, razvrščanje in izrez strani skupin dvojnikov (FR-011-07, research R-04). Čista funkcija nad seznamom
 * kontaktov: kontakt je v največ eni skupini, skupina ima vsaj dva kontakta, vrstni red je deterministični.
 */
final class DuplicateGroups {

    private DuplicateGroups() {}

    /** Skupine kategorije {@code category} iz kontaktov skupine; {@code page} je 0-osno, {@code size} 25, 50 ali 100. */
    static DuplicatePage build(String category, List<DuplicateCandidate> candidates, int page, int size) {
        // Vrstni red kontaktov: created_at, nato id (kot v bazi: bajti UUID, zato niz, ne UUID.compareTo).
        List<DuplicateCandidate> ordered = new ArrayList<>(candidates);
        ordered.sort(OLDEST_FIRST);

        Map<String, List<DuplicateCandidate>> byKey = new LinkedHashMap<>();
        for (DuplicateCandidate candidate : ordered) {
            Optional<String> key = DuplicateKeys.key(
                    category, candidate.firstName(), candidate.lastName(), candidate.email(), candidate.phone());
            key.ifPresent(
                    k -> byKey.computeIfAbsent(k, ignored -> new ArrayList<>()).add(candidate));
        }

        Collator collator = Collator.getInstance(Locale.forLanguageTag("sl"));
        collator.setStrength(Collator.SECONDARY);
        List<Group> groups = new ArrayList<>();
        for (List<DuplicateCandidate> members : byKey.values()) {
            if (members.size() >= 2) {
                groups.add(new Group(reasonValue(category, members.get(0)), members));
            }
        }
        groups.sort(Comparator.<Group, String>comparing(g -> g.value, collator)
                .thenComparing(g -> g.members.get(0), OLDEST_FIRST));

        int from = (int) Math.min((long) page * size, groups.size());
        int to = Math.min(groups.size(), from + size);
        List<DuplicateGroup> pageGroups =
                groups.subList(from, to).stream().map(g -> toGroup(category, g)).toList();
        return new DuplicatePage(category, groups.size(), page, size, pageGroups);
    }

    private static final Comparator<DuplicateCandidate> OLDEST_FIRST =
            Comparator.comparing(DuplicateCandidate::createdAt).thenComparing(c -> c.id().toString());

    private record Group(String value, List<DuplicateCandidate> members) {}

    /** Vrednost prvega kontakta, nenormalizirana (FR-011-07). */
    private static String reasonValue(String category, DuplicateCandidate first) {
        return switch (category) {
            case "name" -> displayName(first);
            case "email" -> first.email();
            default -> first.phone();
        };
    }

    private static String displayName(DuplicateCandidate candidate) {
        String name = ContactRepository.displayName(candidate.firstName(), candidate.lastName());
        return name == null ? "" : name;
    }

    private static DuplicateGroup toGroup(String category, Group group) {
        List<DuplicateContact> contacts = group.members.stream()
                .map(c -> new DuplicateContact(c.id(), displayName(c)))
                .toList();
        return new DuplicateGroup(new DuplicateGroup.Reason(category, group.value), contacts.size(), contacts);
    }
}
