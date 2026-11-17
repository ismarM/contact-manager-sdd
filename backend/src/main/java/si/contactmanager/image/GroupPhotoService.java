package si.contactmanager.image;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import si.contactmanager.group.GroupAccess.Membership;
import si.contactmanager.group.GroupPhotoVersion;

/**
 * Sprememba slike skupine (FR-018-05, FR-018-06): zamenjava slike in povečanje verzije skupine v eni transakciji pod
 * zaklepom skupine.
 */
@Service
class GroupPhotoService {

    private final ImageService images;
    private final ImageStore store;
    private final GroupPhotoVersion versions;

    GroupPhotoService(ImageService images, ImageStore store, GroupPhotoVersion versions) {
        this.images = images;
        this.store = store;
        this.versions = versions;
    }

    @Transactional
    PhotoResult put(Membership membership, long version, ProcessedImage image) {
        versions.lockAndCheck(membership, version);
        long revision = images.store(Owner.group(membership.groupId()), image);
        return new PhotoResult(revision, versions.bump(membership, version));
    }

    /** Idempotentno: skupina brez slike obdrži verzijo (le preverjena je). */
    @Transactional
    PhotoResult remove(Membership membership, long version) {
        versions.lockAndCheck(membership, version);
        boolean existed = store.delete(Owner.group(membership.groupId()));
        return new PhotoResult(null, existed ? versions.bump(membership, version) : version);
    }
}
