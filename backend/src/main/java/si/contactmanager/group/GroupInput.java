package si.contactmanager.group;

/** Podatki skupine iz telesa zahtevka po razčlenitvi (naslov obrezan, prazen opis = {@code null}). */
public record GroupInput(String title, String description, GroupColor color) {}
