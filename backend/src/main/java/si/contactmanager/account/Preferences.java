package si.contactmanager.account;

/** Izbira jezika in teme ({@code null} = ni izbire), FR-001-15, FR-001-17, FR-001-19. */
public record Preferences(Language language, Theme theme) {

    public static final Preferences NONE = new Preferences(null, null);
}
