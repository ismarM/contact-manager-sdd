package si.contactmanager.image;

import java.util.UUID;
import org.junit.jupiter.api.Tag;
import si.contactmanager.image.support.InMemoryImageStore;

/**
 * Prenosljivost shrambe (FR-018-19): pomnilniška implementacija vmesnika {@link ImageStore} prestane isti nabor
 * pogodbenih testov ({@link ImageStoreContract}) kot PostgreSQL ({@code ImageStoreIT}); zamenjava ponudnika (npr. S3)
 * ne spremeni vedenja API-ja.
 */
@Tag("FR-018-19")
class ImageStorePortabilityTest implements ImageStoreContract {

    private final InMemoryImageStore store = new InMemoryImageStore();
    private long users = 1;

    @Override
    public ImageStore store() {
        return store;
    }

    @Override
    public Owner newUser() {
        return Owner.user(users++);
    }

    @Override
    public UUID newGroup() {
        return UUID.randomUUID();
    }

    @Override
    public Owner newContact(UUID group) {
        return Owner.contact(group, UUID.randomUUID());
    }

    @Override
    public void removeContact(Owner contact) {
        store.detach(contact);
    }

    @Override
    public void restoreContact(Owner contact) {
        store.attach(contact);
    }
}
