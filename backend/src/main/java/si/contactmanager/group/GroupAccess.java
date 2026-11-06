package si.contactmanager.group;

import java.util.UUID;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;
import si.contactmanager.account.UserDirectory;
import si.contactmanager.shared.error.ForbiddenException;
import si.contactmanager.shared.error.GroupArchivedException;
import si.contactmanager.shared.error.NotFoundException;

/**
 * Skupno preverjanje dostopa do skupine (feature-map §2.2, koraki 2–4; D-27) za vse funkcionalnosti 002–011. Korak 1
 * (401) opravi Spring Security; korake 5–7 (verzija, podatki, poslovna pravila) endpoint za tem.
 */
@Component
public class GroupAccess {

    /** Dostop prijavljenega uporabnika do skupine. */
    public record Membership(UUID groupId, long userId, Role role, boolean archived, boolean permanentlyArchived) {}

    private final UserDirectory users;
    private final GroupRepository groups;

    GroupAccess(UserDirectory users, GroupRepository groups) {
        this.users = users;
        this.groups = groups;
    }

    /**
     * Članstvo z vlogo vsaj {@code lowest}. Neveljaven zapis {@code groupId}, neobstoječa skupina ali nečlan →
     * {@link NotFoundException} (404, obstoj se ne razkrije); vloga pod {@code lowest} → {@link ForbiddenException}
     * (403); {@code write} v arhivirani skupini → {@link GroupArchivedException} (409).
     */
    public Membership require(Jwt jwt, String groupId, Role lowest, boolean write) {
        UUID id = parse(groupId);
        long user = users.find(jwt).orElseThrow(NotFoundException::new);
        GroupRepository.MemberState state = groups.memberState(id, user).orElseThrow(NotFoundException::new);
        if (!state.role().atLeast(lowest)) {
            throw new ForbiddenException();
        }
        if (write && state.archived()) {
            throw new GroupArchivedException();
        }
        return new Membership(id, user, state.role(), state.archived(), state.permanentlyArchived());
    }

    private static UUID parse(String groupId) {
        try {
            return UUID.fromString(groupId);
        } catch (IllegalArgumentException e) {
            throw new NotFoundException();
        }
    }
}
