package si.contactmanager.shared.error;

/** Telo {@code 409 VERSION_CONFLICT}: koda in trenutno stanje vira (contracts – VersionConflict). */
public record VersionConflict(String code, Object current) {

    public static final String VERSION_CONFLICT = "VERSION_CONFLICT";

    public static VersionConflict of(Object current) {
        return new VersionConflict(VERSION_CONFLICT, current);
    }
}
