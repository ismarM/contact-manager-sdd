package si.contactmanager.member;

import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import si.contactmanager.group.GroupAccess.Membership;
import si.contactmanager.group.GroupDetail;
import si.contactmanager.group.GroupReader;
import si.contactmanager.group.Role;
import si.contactmanager.member.MemberInputParser.ParsedRole;
import si.contactmanager.member.MemberInputParser.ParsedTransfer;
import si.contactmanager.member.MemberRepository.Row;
import si.contactmanager.shared.error.ForbiddenException;
import si.contactmanager.shared.error.GroupArchivedException;
import si.contactmanager.shared.error.LastMemberCannotLeaveException;
import si.contactmanager.shared.error.NotFoundException;
import si.contactmanager.shared.error.OwnerCannotLeaveException;
import si.contactmanager.shared.error.TargetNotMemberException;
import si.contactmanager.shared.error.ValidationError.FieldError;
import si.contactmanager.shared.error.ValidationException;
import si.contactmanager.shared.error.VersionConflictException;

/**
 * Člani skupine (007). Vse pisalne operacije: najprej zaklep vrstice skupine, nato ponovno branje članstev pod
 * zaklepom (research R-01…R-03), šele nato pravila, arhiviranost, verzija in podatki (feature-map §2.2). Nobena pot
 * ne piše v revizijsko sled (FR-007-12).
 */
@Service
class MemberService {

    private final MemberRepository members;
    private final GroupReader groups;

    MemberService(MemberRepository members, GroupReader groups) {
        this.members = members;
        this.groups = groups;
    }

    @Transactional(readOnly = true)
    Members list(Membership caller, int page, int size, String collation) {
        List<Member> items = members.page(caller.groupId(), caller.userId(), collation, size, page).stream()
                .map(view -> view.toMember(caller.role(), caller.archived()))
                .toList();
        return new Members(members.count(caller.groupId()), page, size, caller.permanentlyArchived(), items);
    }

    @Transactional
    Member changeRole(Membership access, UUID memberId, ParsedRole parsed) {
        boolean archived = lock(access);
        Row caller = caller(access, Role.ADMIN);
        Row target = members.findById(access.groupId(), memberId).orElseThrow(NotFoundException::new);
        Role newRole = parsed.role() == null ? null : Role.valueOf(parsed.role());
        if (target.userId() == caller.userId()
                || target.role().compareTo(caller.role()) >= 0
                || (newRole != null && !MemberRules.mayChange(caller.role(), target.role(), newRole))) {
            throw new ForbiddenException();
        }
        if (archived) {
            throw new GroupArchivedException();
        }
        if (parsed.version() != null && parsed.version() != target.version()) {
            throw new VersionConflictException(view(access, memberId, caller.role()));
        }
        if (!parsed.errors().isEmpty()) {
            throw new ValidationException(parsed.errors());
        }
        if (newRole == target.role()) {
            throw new ValidationException(List.of(new FieldError("role", "UNCHANGED")));
        }
        if (members.updateRole(access.groupId(), memberId, newRole, parsed.version(), caller.userId()) == 0) {
            throw new VersionConflictException(view(access, memberId, caller.role()));
        }
        return view(access, memberId, caller.role());
    }

    @Transactional
    void remove(Membership access, UUID memberId) {
        boolean archived = lock(access);
        Row caller = caller(access, Role.ADMIN);
        Row target = members.findById(access.groupId(), memberId).orElseThrow(NotFoundException::new);
        if (target.userId() == caller.userId() || target.role().compareTo(caller.role()) >= 0) {
            throw new ForbiddenException();
        }
        if (archived) {
            throw new GroupArchivedException();
        }
        if (members.delete(access.groupId(), memberId) == 0) {
            throw new NotFoundException();
        }
    }

    /** Zapustitev: dovoljena tudi v arhivirani skupini (FR-007-06); zadnji član trajno arhivirane ne more (R-02). */
    @Transactional
    void leave(Membership access) {
        boolean archived = lock(access);
        Row caller = caller(access, Role.VIEWER);
        if (caller.role() == Role.OWNER) {
            throw new OwnerCannotLeaveException();
        }
        if (archived && !members.hasOwner(access.groupId()) && members.count(access.groupId()) <= 1) {
            throw new LastMemberCannotLeaveException();
        }
        members.deleteByUser(access.groupId(), access.userId());
    }

    /** Atomaren prenos (R-03): najprej prejšnji lastnik → ADMIN, nato cilj → OWNER; ves čas pod zaklepom skupine. */
    @Transactional
    GroupDetail transferOwnership(Membership access, ParsedTransfer parsed) {
        boolean archived = lock(access);
        Row caller = caller(access, Role.OWNER);
        if (archived) {
            throw new GroupArchivedException();
        }
        if (!parsed.errors().isEmpty()) {
            throw new ValidationException(parsed.errors());
        }
        if (parsed.memberId().equals(caller.id())) {
            throw new ValidationException(List.of(new FieldError("memberId", "INVALID_VALUE")));
        }
        Row target = members.findById(access.groupId(), parsed.memberId()).orElseThrow(TargetNotMemberException::new);
        members.demoteOwner(access.groupId(), caller.id(), caller.userId());
        members.promote(access.groupId(), target.id(), caller.userId());
        return groups.read(access);
    }

    private boolean lock(Membership access) {
        return members.lockGroup(access.groupId()).orElseThrow(NotFoundException::new);
    }

    /** Klicateljevo članstvo pod zaklepom: ni več člana → 404, vloga pod najnižjo → 403. */
    private Row caller(Membership access, Role lowest) {
        Row caller = members.findByUser(access.groupId(), access.userId()).orElseThrow(NotFoundException::new);
        if (!caller.role().atLeast(lowest)) {
            throw new ForbiddenException();
        }
        return caller;
    }

    private Member view(Membership access, UUID memberId, Role callerRole) {
        return members.view(access.groupId(), memberId, access.userId())
                .orElseThrow(NotFoundException::new)
                .toMember(callerRole, false);
    }
}
