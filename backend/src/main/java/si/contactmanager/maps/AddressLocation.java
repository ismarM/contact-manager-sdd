package si.contactmanager.maps;

/** Lokacija naslova prek posrednika OSM (016, FR-016-21); ni shranjena. Koordinate so {@code null} pri {@code NOT_FOUND}. */
public record AddressLocation(Status status, Double latitude, Double longitude) {

    /** Natančnost zadetka: hišna številka ({@code EXACT}), kraj ali ulica ({@code APPROXIMATE}) ali ni zadetka. */
    public enum Status {
        EXACT,
        APPROXIMATE,
        NOT_FOUND
    }
}
