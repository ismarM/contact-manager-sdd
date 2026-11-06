package si.contactmanager.group;

/** Vloga člana skupine (feature-map §2.1): {@code VIEWER < EDITOR < ADMIN < OWNER}. */
public enum Role {
    VIEWER,
    EDITOR,
    ADMIN,
    OWNER;

    /** Ali je ta vloga enaka ali višja od {@code lowest}. */
    public boolean atLeast(Role lowest) {
        return compareTo(lowest) >= 0;
    }
}
