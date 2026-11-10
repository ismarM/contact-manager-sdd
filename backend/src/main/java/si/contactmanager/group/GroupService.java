package si.contactmanager.group;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import si.contactmanager.group.GroupAccess.Membership;
import si.contactmanager.group.GroupInputParser.Parsed;
import si.contactmanager.group.GroupRepository.Collation;
import si.contactmanager.group.GroupRepository.LockState;
import si.contactmanager.group.GroupRepository.LockedGroup;
import si.contactmanager.shared.error.ForbiddenException;
import si.contactmanager.shared.error.GroupArchivedException;
import si.contactmanager.shared.error.GroupHasOtherMembersException;
import si.contactmanager.shared.error.GroupNotArchivedException;
import si.contactmanager.shared.error.NotFoundException;
import si.contactmanager.shared.error.ValidationException;
import si.contactmanager.shared.error.VersionConflictException;

/** Primeri uporabe skupin (plan.md – REST endpoints); dostop preveri {@link GroupAccess} pred klicem. */
@Service
class GroupService {

    /** Vrstni red razdelkov (FR-002-04). */
    private static final List<Role> SECTION_ORDER = List.of(Role.OWNER, Role.ADMIN, Role.EDITOR, Role.VIEWER);

    private final GroupRepository groups;

    GroupService(GroupRepository groups) {
        this.groups = groups;
    }

    /** Ustvarjalec postane edini član z vlogo OWNER (FR-002-03). */
    @Transactional
    GroupDetail create(GroupInput input, long creator) {
        UUID id = groups.insertGroup(input, creator);
        groups.insertMember(id, creator, Role.OWNER);
        return groups.findDetail(id, creator).orElseThrow();
    }

    GroupDetail read(Membership membership) {
        return groups.findDetail(membership.groupId(), membership.userId()).orElseThrow(NotFoundException::new);
    }

    /**
     * Urejanje z optimističnim zaklepanjem (research R-06; feature-map §2.2 koraka 5 in 6): zaklep vrstice, verzija,
     * šele nato podatki. Nespremenjeni podatki ne spremenijo verzije, izvajalca in časa (Clarifications 2026-11-05).
     */
    @Transactional
    GroupDetail update(Membership membership, Parsed parsed) {
        LockedGroup locked = groups.lock(membership.groupId()).orElseThrow(NotFoundException::new);
        if (locked.archived()) {
            // Skupina je bila medtem arhivirana (research R-03): korak 4 §2.2 pred verzijo.
            throw new GroupArchivedException();
        }
        if (parsed.version() != null && parsed.version() != locked.version()) {
            throw new VersionConflictException(read(membership));
        }
        if (!parsed.valid()) {
            throw new ValidationException(parsed.errors());
        }
        GroupInput input = parsed.input();
        boolean unchanged = input.title().equals(locked.title())
                && Objects.equals(input.description(), locked.description())
                && input.color() == locked.color();
        if (!unchanged) {
            groups.update(membership.groupId(), input, membership.userId());
        }
        return read(membership);
    }

    /**
     * Vloga klicatelja se pod zaklepom skupine prebere znova (007, R-03): sočasni prenos lastništva lahko prejšnjemu
     * lastniku vzame vlogo, med tem ko je zahtevek čakal na zaklep.
     */
    private void requireOwnerUnderLock(Membership membership) {
        Role current = groups.memberState(membership.groupId(), membership.userId())
                .orElseThrow(NotFoundException::new)
                .role();
        if (!current.atLeast(Role.OWNER)) {
            throw new ForbiddenException();
        }
    }

    /** Arhiviranje (FR-003-01): pod zaklepom vrstice, drugi sočasni zahtevek vidi arhivirano skupino (R-03). */
    @Transactional
    GroupDetail archive(Membership membership) {
        LockState state = groups.lockState(membership.groupId()).orElseThrow(NotFoundException::new);
        requireOwnerUnderLock(membership);
        if (state.archived()) {
            throw new GroupArchivedException();
        }
        groups.setArchived(membership.groupId(), true);
        return read(membership);
    }

    /** Odarhiviranje (FR-003-06). */
    @Transactional
    GroupDetail unarchive(Membership membership) {
        LockState state = groups.lockState(membership.groupId()).orElseThrow(NotFoundException::new);
        requireOwnerUnderLock(membership);
        if (!state.archived()) {
            throw new GroupNotArchivedException();
        }
        groups.setArchived(membership.groupId(), false);
        return read(membership);
    }

    /**
     * Izbris (FR-003-09, FR-003-11): v trajno arhivirani skupini katera koli vloga, sicer samo lastnik (403); nato
     * pod zaklepom število članov (409 GROUP_HAS_OTHER_MEMBERS).
     */
    @Transactional
    void delete(Membership membership) {
        LockState state = groups.lockState(membership.groupId()).orElseThrow(NotFoundException::new);
        boolean permanent = state.archived() && !state.hasOwner();
        if (!permanent && !membership.role().atLeast(Role.OWNER)) {
            throw new ForbiddenException();
        }
        if (groups.memberCount(membership.groupId()) > 1) {
            throw new GroupHasOtherMembersException();
        }
        groups.delete(membership.groupId());
    }

    /** Arhivirane skupine uporabnika (FR-003-07). */
    ArchivedGroups listArchived(long user, int page, int size, Collation collation) {
        return new ArchivedGroups(
                groups.countArchived(user), page, size, groups.pageArchived(user, collation, size, page));
    }

    /** Razdelki po vlogi (FR-002-04, FR-002-06): brez {@code role} prva stran vsakega nepraznega razdelka. */
    GroupSections list(long user, Role role, int page, int size, Collation collation) {
        Map<Role, Long> counts = groups.countByRole(user);
        List<GroupSection> sections = new ArrayList<>();
        for (Role sectionRole : SECTION_ORDER) {
            long total = counts.getOrDefault(sectionRole, 0L);
            if (total == 0 || (role != null && role != sectionRole)) {
                continue;
            }
            List<GroupSummary> items = groups.pageByRole(user, sectionRole, collation, size, page);
            sections.add(new GroupSection(sectionRole, total, page, size, items));
        }
        return new GroupSections(sections);
    }
}
