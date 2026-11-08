package si.contactmanager.invitation;

import java.util.List;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import si.contactmanager.group.GroupAccess.Membership;
import si.contactmanager.group.Role;
import si.contactmanager.invitation.InvitationInputParser.Parsed;
import si.contactmanager.invitation.InvitationRepository.Claimed;
import si.contactmanager.invitation.InvitationRepository.Inserted;
import si.contactmanager.invitation.InvitationRepository.OutgoingRow;
import si.contactmanager.shared.error.AlreadyMemberException;
import si.contactmanager.shared.error.CannotInviteSelfException;
import si.contactmanager.shared.error.ForbiddenException;
import si.contactmanager.shared.error.GroupArchivedException;
import si.contactmanager.shared.error.InvitationAlreadyPendingException;
import si.contactmanager.shared.error.InviteeNotRegisteredException;
import si.contactmanager.shared.error.NotFoundException;
import si.contactmanager.shared.error.ValidationException;

/**
 * Primeri uporabe povabil (plan.md – REST endpoints). Pošiljanje in sprejem se serializirata z zaklepom vrstice skupine
 * (research R-04); povabila se nikoli ne zapisujejo v revizijsko sled (R-10). Dostop do skupine preveri
 * {@code GroupAccess} pred klicem.
 */
@Service
class InvitationService {

    /** Izid sprejema: {@code accepted} je {@code null}, če je uporabnik že član (povabilo je izbrisano). */
    record AcceptOutcome(AcceptedInvitation accepted) {}

    private final InvitationRepository invitations;

    InvitationService(InvitationRepository invitations) {
        this.invitations = invitations;
    }

    /** Pošiljanje: vrstni red 403 → 409 GROUP_ARCHIVED → 400 → 409 poslovna pravila (data-model.md). */
    @Transactional
    OutgoingInvitation send(Membership membership, Parsed parsed) {
        if (parsed.role() != null && Role.valueOf(parsed.role()).compareTo(membership.role()) >= 0) {
            throw new ForbiddenException();
        }
        boolean archived = invitations.lockGroup(membership.groupId()).orElseThrow(NotFoundException::new);
        if (archived) {
            throw new GroupArchivedException();
        }
        if (!parsed.valid()) {
            throw new ValidationException(parsed.errors());
        }
        if (invitations.callerEmail(membership.userId()).equalsIgnoreCase(parsed.email())) {
            throw new CannotInviteSelfException();
        }
        long invitee = invitations.findUserByEmail(parsed.email()).orElseThrow(InviteeNotRegisteredException::new);
        if (invitee == membership.userId()) {
            throw new CannotInviteSelfException();
        }
        if (invitations.isMember(membership.groupId(), invitee)) {
            throw new AlreadyMemberException();
        }
        if (invitations.hasPending(membership.groupId(), invitee)) {
            throw new InvitationAlreadyPendingException();
        }
        Inserted inserted;
        try {
            inserted = invitations.insert(membership.groupId(), invitee, membership.userId(), parsed.role());
        } catch (DuplicateKeyException e) {
            throw new InvitationAlreadyPendingException();
        }
        return new OutgoingInvitation(
                inserted.id(),
                invitations.userRef(invitee).email(),
                parsed.role(),
                invitations.userRef(membership.userId()),
                inserted.createdAt(),
                canWithdraw(membership.role(), parsed.role()));
    }

    @Transactional(readOnly = true)
    OutgoingInvitations listOutgoing(Membership membership, int page, int size) {
        List<OutgoingInvitation> items = invitations.pageOutgoing(membership.groupId(), page, size).stream()
                .map((OutgoingRow row) -> new OutgoingInvitation(
                        row.id(),
                        row.inviteeEmail(),
                        row.role(),
                        row.invitedBy(),
                        row.createdAt(),
                        canWithdraw(membership.role(), row.role())))
                .toList();
        return new OutgoingInvitations(invitations.countOutgoing(membership.groupId()), page, size, items);
    }

    /** Umik: {@code 404}, če povabila v skupini ni; ADMIN ne umakne povabila z vlogo ADMIN (research R-11). */
    @Transactional
    void withdraw(Membership membership, UUID invitationId) {
        String role = invitations.roleOf(invitationId, membership.groupId()).orElseThrow(NotFoundException::new);
        if (!canWithdraw(membership.role(), role)) {
            throw new ForbiddenException();
        }
        if (!invitations.withdraw(invitationId, membership.groupId())) {
            throw new NotFoundException();
        }
    }

    @Transactional(readOnly = true)
    ReceivedInvitations listReceived(long userId, int page, int size) {
        return new ReceivedInvitations(
                invitations.countReceived(userId), page, size, invitations.pageReceived(userId, page, size));
    }

    @Transactional(readOnly = true)
    InvitationCount countReceived(long userId) {
        return new InvitationCount(invitations.countReceived(userId));
    }

    /** Sprejem v eni transakciji pod zaklepom skupine (research R-04 – R-06); arhiviranost se ne preverja. */
    @Transactional
    AcceptOutcome accept(long userId, UUID invitationId) {
        UUID group = invitations.findGroupOf(invitationId, userId).orElseThrow(NotFoundException::new);
        invitations.lockGroup(group).orElseThrow(NotFoundException::new);
        Claimed claimed = invitations.claim(invitationId, userId).orElseThrow(NotFoundException::new);
        if (invitations.addMember(group, userId, claimed.role()) == 0) {
            return new AcceptOutcome(null);
        }
        InvitationRepository.GroupHeading heading = invitations.heading(group).orElseThrow(NotFoundException::new);
        return new AcceptOutcome(new AcceptedInvitation(group, heading.title(), claimed.role(), heading.archived()));
    }

    @Transactional
    void decline(long userId, UUID invitationId) {
        if (!invitations.decline(invitationId, userId)) {
            throw new NotFoundException();
        }
    }

    /** Lastnik umakne vsako povabilo, admin samo povabila z vlogo pod ADMIN. */
    private static boolean canWithdraw(Role caller, String offered) {
        return caller == Role.OWNER || (caller == Role.ADMIN && !offered.equals("ADMIN"));
    }
}
