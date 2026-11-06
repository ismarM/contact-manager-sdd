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

    /** Barva za ime v API-ju (samo male črke); neznano ime → prazno. */
    public static Optional<GroupColor> fromCode(String code) {
        for (GroupColor color : values()) {
            if (color.code.equals(code)) {
                return Optional.of(color);
            }
        }
        return Optional.empty();
    }
}
