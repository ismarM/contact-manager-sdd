package si.contactmanager.contact;

import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import si.contactmanager.contact.ContactInputParser.Parsed;
import si.contactmanager.group.GroupAccess.Membership;
import si.contactmanager.group.Role;
import si.contactmanager.shared.error.ForbiddenException;
import si.contactmanager.shared.error.GroupArchivedException;
import si.contactmanager.shared.error.NotFoundException;
import si.contactmanager.shared.error.ValidationException;
import si.contactmanager.shared.error.VersionConflictException;

/**
 * Primeri uporabe kontaktov (plan.md – REST endpoints). Dostop do skupine preveri {@code GroupAccess} pred klicem;
 * vrstni red preverjanj za obstoječ kontakt je feature-map §2.2 in D-41: 404 kontakta → 403 → 409 GROUP_ARCHIVED → 409
 * VERSION_CONFLICT → 400.
 */
@Service
class ContactService {

    private final ContactRepository contacts;

    ContactService(ContactRepository contacts) {
        this.contacts = contacts;
    }

    ContactPage list(Membership membership, int page, int size) {
        return new ContactPage(
                contacts.count(membership.groupId()), page, size, contacts.page(membership.groupId(), size, page));
    }

    ContactDetail read(Membership membership, UUID id) {
        return contacts.find(membership.groupId(), id).orElseThrow(NotFoundException::new);
    }

    /** Korak 2 (kontakt v tej skupini), nato koraka 3 in 4 za pisanje (D-41). */
    void requireWritable(Membership membership, UUID id) {
        if (!contacts.exists(membership.groupId(), id)) {
            throw new NotFoundException();
        }
        if (!membership.role().atLeast(Role.EDITOR)) {
            throw new ForbiddenException();
        }
        if (membership.archived()) {
            throw new GroupArchivedException();
        }
    }

    /** Ustvarjanje (FR-004-01): pod zaklepom skupine, ki zapre dirko z arhiviranjem (research R-05). */
    @Transactional
    ContactDetail create(Membership membership, ContactInput input) {
        lockWritableGroup(membership);
        UUID id = contacts.insert(membership.groupId(), input, membership.userId());
        return read(membership, id);
    }

    /**
     * Urejanje z optimističnim zaklepanjem (research R-05): zastarela verzija z vrednostmi, enakimi trenutnim, uspe brez
     * spremembe (Clarifications 2026-11-06), sicer konflikt s trenutnim stanjem – tudi ob neveljavnih podatkih.
     */
    @Transactional
    ContactDetail update(Membership membership, UUID id, Parsed parsed) {
        lockWritableGroup(membership);
        long version = contacts.lockVersion(membership.groupId(), id).orElseThrow(NotFoundException::new);
        ContactDetail current = read(membership, id);
        boolean same = parsed.valid() && sameValues(current, parsed.input());
        if (parsed.version() != null && parsed.version() != version) {
            if (same) {
                return current;
            }
            throw new VersionConflictException(current);
        }
        if (!parsed.valid()) {
            throw new ValidationException(parsed.errors());
        }
        if (same) {
            return current;
        }
        contacts.update(membership.groupId(), id, parsed.input(), membership.userId());
        return read(membership, id);
    }

    /** Izbris (FR-004-12): zastarela verzija je vedno konflikt (Assumptions). */
    @Transactional
    void delete(Membership membership, UUID id, long sentVersion) {
        lockWritableGroup(membership);
        long version = contacts.lockVersion(membership.groupId(), id).orElseThrow(NotFoundException::new);
        if (sentVersion != version) {
            throw new VersionConflictException(read(membership, id));
        }
        contacts.delete(membership.groupId(), id);
    }

    TagSuggestions suggestTags(Membership membership, String prefix) {
        return new TagSuggestions(contacts.suggestTags(membership.groupId(), prefix == null ? "" : prefix.strip()));
    }

    private void lockWritableGroup(Membership membership) {
        boolean archived = contacts.lockGroupArchived(membership.groupId()).orElseThrow(NotFoundException::new);
        if (archived) {
            // Skupina je bila medtem arhivirana (research R-05): korak 4 §2.2.
            throw new GroupArchivedException();
        }
    }

    private static boolean sameValues(ContactDetail current, ContactInput input) {
        return Objects.equals(current.firstName(), input.firstName())
                && Objects.equals(current.lastName(), input.lastName())
                && Objects.equals(current.address(), input.address())
                && Objects.equals(current.email(), input.email())
                && Objects.equals(current.phone(), input.phone())
                && current.attributes().equals(input.attributes())
                && current.tags().equals(input.tags());
    }
}
