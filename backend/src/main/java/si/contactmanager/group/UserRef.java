package si.contactmanager.group;

/** Izvajalec zadnje spremembe (ime je lahko {@code null}); v odgovoru {@code null} pomeni izbrisanega uporabnika. */
public record UserRef(String name, String email) {}
