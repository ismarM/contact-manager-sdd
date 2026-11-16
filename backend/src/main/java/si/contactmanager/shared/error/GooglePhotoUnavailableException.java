package si.contactmanager.shared.error;

/** Slike Google računa ni mogoče prevzeti – {@code 409 GOOGLE_PHOTO_UNAVAILABLE} (018, FR-018-20, research R-06). */
public class GooglePhotoUnavailableException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public GooglePhotoUnavailableException(String reason) {
        super(reason);
    }
}
