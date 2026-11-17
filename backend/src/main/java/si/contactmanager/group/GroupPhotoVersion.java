package si.contactmanager.group;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import si.contactmanager.group.GroupAccess.Membership;
import si.contactmanager.shared.error.GroupArchivedException;
import si.contactmanager.shared.error.NotFoundException;
import si.contactmanager.shared.error.VersionConflictException;

/**
 * Optimistično zaklepanje skupine ob spremembi slike skupine (018, FR-018-06): poslana verzija se preveri pred
 * obdelavo slike, ob zamenjavi pa pod zaklepom vrstice, ki zapre dirko z urejanjem in arhiviranjem.
 */
@Component
public class GroupPhotoVersion {

    private final GroupRepository groups;

    GroupPhotoVersion(GroupRepository groups) {
        this.groups = groups;
    }

    /** Hitro preverjanje brez zaklepa (pred dragim dekodiranjem): zastarela verzija = {@code VERSION_CONFLICT}. */
    public void check(Membership membership, long version) {
        GroupDetail current =
                groups.findDetail(membership.groupId(), membership.userId()).orElseThrow(NotFoundException::new);
        if (current.version() != version) {
            throw new VersionConflictException(current);
        }
    }

    /**
     * Zaklene skupino, še enkrat preveri arhiviranost in verzijo; kliče se v isti transakciji kot sprememba slike.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void lockAndCheck(Membership membership, long version) {
        GroupRepository.LockedGroup locked = groups.lock(membership.groupId()).orElseThrow(NotFoundException::new);
        if (locked.archived()) {
            throw new GroupArchivedException();
        }
        if (locked.version() != version) {
            throw new VersionConflictException(
                    groups.findDetail(membership.groupId(), membership.userId()).orElseThrow(NotFoundException::new));
        }
    }

    /** Poveča verzijo zaklenjene skupine (izvajalec in čas kot pri urejanju); vrne novo verzijo. */
    @Transactional(propagation = Propagation.MANDATORY)
    public long bump(Membership membership, long version) {
        groups.bumpVersion(membership.groupId(), membership.userId());
        return version + 1;
    }
}
