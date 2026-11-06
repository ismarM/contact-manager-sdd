package si.contactmanager.group;

import java.util.Optional;

/** Osem poimenovanih barv skupine (design.md 4.2, feature-map §2.6); privzeta je {@code tinta}. */
public enum GroupColor {
    TINTA("tinta"),
    MAH("mah"),
    OPEKA("opeka"),
    OKER("oker"),
    SLIVA("sliva"),
    MORJE("morje"),
    GRAFIT("grafit"),
    RJA("rja");

    public static final GroupColor DEFAULT = TINTA;

    private final String code;

    GroupColor(String code) {
        this.code = code;
    }

    /** Ime v API-ju in bazi (male črke). */
    public String code() {
        return code;
    }

    /** Barva za ime v API-ju; neznano ime → prazno. Ogrodje (T007): implementacija v T029. */
    public static Optional<GroupColor> fromCode(String code) {
        return Optional.empty();
    }
}
