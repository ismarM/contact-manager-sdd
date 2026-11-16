package si.contactmanager.maps;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import si.contactmanager.contact.Address;
import si.contactmanager.contact.Attribute;
import si.contactmanager.contact.AttributeType;
import si.contactmanager.contact.ContactSnapshots;
import si.contactmanager.contact.ContactState;
import si.contactmanager.contact.CountryNames;
import si.contactmanager.group.GroupAccess;
import si.contactmanager.group.GroupAccess.Membership;
import si.contactmanager.group.Role;
import si.contactmanager.shared.error.NotFoundException;
import si.contactmanager.shared.error.ValidationError.FieldError;
import si.contactmanager.shared.error.ValidationException;

/**
 * Kartografski posrednik (016, plan.md – Public Interfaces; research R-08). Brskalnik nikoli ne kliče tuje storitve;
 * zaledje pošlje samo besedilo naslova. Vrstni red preverjanj §2.2: 401 → 404 → 403 → 400, zato zavrnjen zahtevek
 * nikoli ne sproži klica zunanje storitve.
 */
@RestController
class MapsController {

    static final int Q_MIN = 3;
    static final int Q_MAX = 300;
    private static final Pattern COUNTRY = Pattern.compile("^[A-Z]{2}$");

    /** Odgovor predlogov naslova. */
    record AddressSuggestions(List<AddressSuggestion> items) {}

    private final GroupAccess access;
    private final PhotonClient photon;
    private final NominatimClient nominatim;
    private final TileClient tiles;
    private final ContactSnapshots contacts;

    MapsController(
            GroupAccess access,
            PhotonClient photon,
            NominatimClient nominatim,
            TileClient tiles,
            ContactSnapshots contacts) {
        this.access = access;
        this.photon = photon;
        this.nominatim = nominatim;
        this.tiles = tiles;
        this.contacts = contacts;
    }

    /**
     * Lokacija naslova kontakta (FR-016-21, FR-016-22): bralec ali višje, tudi v arhivirani skupini. Brez {@code key}
     * predefiniran naslov, sicer atribut tipa {@code ADDRESS}. Naslov se prebere iz kontakta šele po preverjanju
     * dostopa; manjkajoč kontakt, naslov ali atribut drugega tipa → 404, nič ni posredovano. Koordinate se ne shranijo.
     */
    @GetMapping("/api/groups/{groupId}/contacts/{contactId}/address-location")
    AddressLocation addressLocation(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String groupId,
            @PathVariable String contactId,
            @RequestParam(required = false) String key,
            @RequestParam(required = false) String language) {
        Membership membership = access.require(jwt, groupId, Role.VIEWER, false);
        ContactState contact = contacts.snapshot(membership.groupId(), contactUuid(contactId));
        if (contact == null) {
            throw new NotFoundException();
        }
        Address parts;
        String text;
        if (key == null || key.isBlank()) {
            parts = contact.addressParts();
            text = contact.address();
        } else {
            String wanted = key.strip().toLowerCase(Locale.ROOT);
            Attribute attribute = contact.attributes().stream()
                    .filter(a -> a.type() == AttributeType.ADDRESS
                            && a.key().strip().toLowerCase(Locale.ROOT).equals(wanted))
                    .findFirst()
                    .orElseThrow(NotFoundException::new);
            parts = attribute.parts();
            text = attribute.value();
        }
        if (parts == null && (text == null || text.isBlank())) {
            throw new NotFoundException();
        }
        String lang = language == null || language.isEmpty() ? "sl" : language;
        if (!lang.equals("sl") && !lang.equals("en")) {
            throw new ValidationException(List.of(new FieldError("language", "INVALID_VALUE")));
        }
        return parts != null ? nominatim.locate(parts, lang) : nominatim.locate(text, lang);
    }

    /**
     * Ploščica podlage zemljevida (FR-016-21, FR-016-23): vsak prijavljen uporabnik (ni vezano na skupino). Neveljavne
     * koordinate → 400; omejitev ali napaka storitve → 503. {@code Cache-Control: private} z ostankom življenjske dobe.
     */
    @GetMapping("/api/map-tiles/{z}/{x}/{y}.png")
    ResponseEntity<byte[]> mapTile(
            @AuthenticationPrincipal Jwt jwt, @PathVariable String z, @PathVariable String x, @PathVariable String y) {
        List<FieldError> errors = new ArrayList<>();
        int zoom = coordinate("z", z, errors);
        int column = coordinate("x", x, errors);
        int row = coordinate("y", y, errors);
        if (errors.isEmpty() && !TileClient.valid(zoom, column, row)) {
            if (zoom < 0 || zoom > TileClient.MAX_ZOOM) {
                errors.add(new FieldError("z", "INVALID_VALUE"));
            } else {
                if (column >= 1 << zoom) {
                    errors.add(new FieldError("x", "INVALID_VALUE"));
                }
                if (row >= 1 << zoom) {
                    errors.add(new FieldError("y", "INVALID_VALUE"));
                }
            }
        }
        if (!errors.isEmpty()) {
            throw new ValidationException(errors);
        }
        TileClient.Tile tile = tiles.tile(jwt.getSubject(), zoom, column, row);
        return ResponseEntity.ok()
                .contentType(MediaType.IMAGE_PNG)
                .cacheControl(CacheControl.maxAge(Duration.ofSeconds(tile.maxAgeSeconds(System.currentTimeMillis())))
                        .cachePrivate())
                .body(tile.body());
    }

    private static int coordinate(String field, String value, List<FieldError> errors) {
        try {
            int parsed = Integer.parseInt(value);
            if (parsed >= 0) {
                return parsed;
            }
        } catch (NumberFormatException e) {
            // spodaj
        }
        errors.add(new FieldError(field, "INVALID_VALUE"));
        return -1;
    }

    private static UUID contactUuid(String value) {
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException e) {
            throw new NotFoundException();
        }
    }

    /**
     * Do 5 predlogov naslova (FR-016-13): urednik ali višje, tudi v arhivirani skupini (kot predlogi 013). Napaka ali
     * omejitev storitve vrne prazen seznam.
     */
    @GetMapping("/api/groups/{groupId}/address-suggestions")
    AddressSuggestions addressSuggestions(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String groupId,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String country,
            @RequestParam(required = false) String language) {
        Membership membership = access.require(jwt, groupId, Role.EDITOR, false);
        List<FieldError> errors = new ArrayList<>();
        String text = q == null ? "" : q.strip();
        int length = text.codePointCount(0, text.length());
        if (text.isEmpty()) {
            errors.add(new FieldError("q", "REQUIRED"));
        } else if (length < Q_MIN) {
            errors.add(new FieldError("q", "TOO_SHORT"));
        } else if (length > Q_MAX) {
            errors.add(new FieldError("q", "TOO_LONG"));
        }
        String preferred = country == null || country.isEmpty() ? null : country;
        if (preferred != null && (!COUNTRY.matcher(preferred).matches() || !CountryNames.isValid(preferred))) {
            errors.add(new FieldError("country", "INVALID_VALUE"));
        }
        String lang = language == null || language.isEmpty() ? "sl" : language;
        if (!lang.equals("sl") && !lang.equals("en")) {
            errors.add(new FieldError("language", "INVALID_VALUE"));
        }
        if (!errors.isEmpty()) {
            throw new ValidationException(errors);
        }
        return new AddressSuggestions(photon.suggest(membership.userId(), text, preferred, lang));
    }
}
