package si.contactmanager.image;

import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import si.contactmanager.shared.error.NotFoundException;
import si.contactmanager.shared.error.ValidationError.FieldError;
import si.contactmanager.shared.error.ValidationException;

/** Skupna logika slik za vse tri vrste lastnikov (obdelava, omejitev nalaganj, shramba, streženje). */
@Service
public class ImageService {

    private final ImageStore store;
    private final ImageProcessor processor;
    private final UploadRateLimiter limiter;
    private final ImageProperties properties;

    ImageService(ImageStore store, ImageProcessor processor, UploadRateLimiter limiter, ImageProperties properties) {
        this.store = store;
        this.processor = processor;
        this.limiter = limiter;
        this.properties = properties;
    }

    long maxBytes() {
        return properties.maxBytes();
    }

    /** Šteje poskus nalaganja uporabnika; {@code 429 RATE_LIMITED}, če je okno polno. */
    void throttle(long userId) {
        limiter.check("user:" + userId);
    }

    /** Obdela in shrani sliko lastnika; vrne novo revizijo. Neveljavna datoteka = {@code 400} (polje {@code file}). */
    long put(Owner owner, byte[] bytes) {
        return store.put(owner, prepare(bytes));
    }

    /** Samo obdelava (brez shranjevanja): neveljavna datoteka = {@code 400} (polje {@code file}). */
    ProcessedImage prepare(byte[] bytes) {
        try {
            return processor.process(bytes);
        } catch (ImageRejectedException e) {
            throw new ValidationException(List.of(new FieldError("file", e.code())));
        }
    }

    /** Obdelava tuje slike (Google): vsaka zavrnitev je {@code GOOGLE_PHOTO_UNAVAILABLE}, ne {@code 400}. */
    ProcessedImage prepareForeign(byte[] bytes) {
        try {
            return processor.process(bytes);
        } catch (ImageRejectedException e) {
            throw new si.contactmanager.shared.error.GooglePhotoUnavailableException("slika ni veljavna");
        }
    }

    long store(Owner owner, ProcessedImage image) {
        return store.put(owner, image);
    }

    /** Odgovor s sliko lastnika ({@code 304} ob ujemanju {@code If-None-Match}); {@code 404}, če slike ni. */
    ResponseEntity<byte[]> serve(Owner owner, int size, String ifNoneMatch) {
        long revision = store.revision(owner).orElseThrow(NotFoundException::new);
        if (ImageResponses.matches(ifNoneMatch, ImageResponses.etag(revision, size))) {
            return ImageResponses.notModified(ImageResponses.etag(revision, size));
        }
        StoredImage image = store.get(owner, size).orElseThrow(NotFoundException::new);
        return ImageResponses.image(image);
    }

    boolean remove(Owner owner) {
        return store.delete(owner);
    }
}
