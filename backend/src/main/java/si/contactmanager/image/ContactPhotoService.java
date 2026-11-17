package si.contactmanager.image;

import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import si.contactmanager.audit.PhotoChange;
import si.contactmanager.contact.ContactPhotoSupport;
import si.contactmanager.contact.ContactState;
import si.contactmanager.group.GroupAccess.Membership;

/**
 * Sprememba slike kontakta (FR-018-09, FR-018-10): zamenjava slike, povečanje verzije kontakta in vnos v sledi v isti
 * transakciji; če katerikoli korak odpove, se ne zgodi nič.
 */
@Service
class ContactPhotoService {

    private final ImageService images;
    private final ImageStore store;
    private final ContactPhotoSupport contacts;

    ContactPhotoService(ImageService images, ImageStore store, ContactPhotoSupport contacts) {
        this.images = images;
        this.store = store;
        this.contacts = contacts;
    }

    @Transactional
    PhotoResult put(Membership membership, UUID contact, long version, ProcessedImage image) {
        ContactState before = contacts.begin(membership, contact, version);
        Owner owner = Owner.contact(membership.groupId(), contact);
        boolean existed = store.revision(owner).isPresent();
        long revision = images.store(owner, image);
        long newVersion =
                contacts.finish(membership, contact, before, existed ? PhotoChange.REPLACED : PhotoChange.ADDED);
        return new PhotoResult(revision, newVersion);
    }

    /** Idempotentno: kontakt brez slike obdrži verzijo, vnosa v sledi ni. */
    @Transactional
    PhotoResult remove(Membership membership, UUID contact, long version) {
        ContactState before = contacts.begin(membership, contact, version);
        if (!store.delete(Owner.contact(membership.groupId(), contact))) {
            return new PhotoResult(null, before.version());
        }
        return new PhotoResult(null, contacts.finish(membership, contact, before, PhotoChange.REMOVED));
    }
}
