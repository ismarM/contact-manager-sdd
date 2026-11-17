package si.contactmanager.image;

/** Datoteka ni sprejemljiva slika: {@code code} je {@code INVALID_IMAGE}, {@code IMAGE_TOO_LARGE} ali {@code FILE_TOO_LARGE}. */
public class ImageRejectedException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    private final String code;

    public ImageRejectedException(String code) {
        super(code);
        this.code = code;
    }

    public String code() {
        return code;
    }
}
