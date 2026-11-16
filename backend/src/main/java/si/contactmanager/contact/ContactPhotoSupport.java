package si.contactmanager.contact;

import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import si.contactmanager.audit.AuditLog;
import si.contactmanager.audit.ContactChange;
import si.contactmanager.audit.PhotoChange;
import si.contactmanager.group.GroupAccess.Membership;
import si.contactmanager.group.Role;
import si.contactmanager.shared.error.ForbiddenException;
import si.contactmanager.shared.error.GroupArchivedException;
import si.contactmanager.shared.error.NotFoundException;
import si.contactmanager.shared.error.VersionConflictException;

/**
 * Podpora spremembi slike kontakta (018, FR-018-09, FR-018-10): preverjanja v vrstnem redu feature-map §2.2 in D-41,
 * zaklep kontakta, povečanje verzije in vnos {@code UPDATE} v sledi z dejstvom spremembe slike. Slika sama je v
 * paketu {@code image}; vse se izvede v eni transakciji klicatelja.
 */
@Component
public class ContactPhotoSupport {

    private final ContactRepository contacts;
    private final ContactSnapshots snapshots;
    private final AuditLog audit;

    ContactPhotoSupport(ContactRepository contacts, ContactSnapshots snapshots, AuditLog audit) {
        this.contacts = contacts;
        this.snapshots = snapshots;
        this.audit = audit;
    }

    /** Korak 2: kontakt mora biti v tej skupini ({@code 404} tudi za izbrisan kontakt). */
    public void requireExists(Membership membership, UUID contact) {
        if (!contacts.exists(membership.groupId(), contact)) {
            throw new NotFoundException();
        }
    }

    /** Koraki 2–4 za pisanje: 404 kontakta → 403 → 409 {@code GROUP_ARCHIVED}. */
    public void requireWritable(Membership membership, UUID contact) {
        requireExists(membership, contact);
        if (!membership.role().atLeast(Role.EDITOR)) {
            throw new ForbiddenException();
        }
        if (membership.archived()) {
            throw new GroupArchivedException();
        }
    }

    /** Hitro preverjanje verzije brez zaklepa (pred dragim dekodiranjem slike). */
    public void checkVersion(Membership membership, UUID contact, long version) {
        ContactDetail current = contacts.find(membership.groupId(), contact).orElseThrow(NotFoundException::new);
        if (current.version() != version) {
            throw new VersionConflictException(current);
        }
    }

    /**
     * Zaklene skupino in kontakt ter ponovno preveri arhiviranost in verzijo; vrne stanje kontakta pred spremembo.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public ContactState begin(Membership membership, UUID contact, long version) {
        boolean archived = contacts.lockGroupArchived(membership.groupId()).orElseThrow(NotFoundException::new);
        if (archived) {
            throw new GroupArchivedException();
        }
        long current = contacts.lockVersion(membership.groupId(), contact).orElseThrow(NotFoundException::new);
        if (current != version) {
            throw new VersionConflictException(
                    contacts.find(membership.groupId(), contact).orElseThrow(NotFoundException::new));
        }
        return snapshots.snapshot(membership.groupId(), contact);
    }

    /** Poveča verzijo, zabeleži vnos {@code UPDATE} z {@code photoChange}; vrne novo verzijo kontakta. */
    @Transactional(propagation = Propagation.MANDATORY)
    public long finish(Membership membership, UUID contact, ContactState before, PhotoChange change) {
        contacts.touch(membership.groupId(), contact, membership.userId());
        ContactState after = snapshots.snapshot(membership.groupId(), contact);
        String name = ContactRepository.displayName(after.firstName(), after.lastName());
        audit.recordPhoto(
                membership.groupId(), membership.userId(), new ContactChange(contact, name, before, after), change);
        return after.version();
    }

    /** Verzija kontakta (za odgovor, ko se ni spremenila). */
    public long version(Membership membership, UUID contact) {
        return contacts.find(membership.groupId(), contact)
                .orElseThrow(NotFoundException::new)
                .version();
    }
}
