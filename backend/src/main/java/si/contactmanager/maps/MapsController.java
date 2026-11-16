package si.contactmanager.maps;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import si.contactmanager.contact.CountryNames;
import si.contactmanager.group.GroupAccess;
import si.contactmanager.group.GroupAccess.Membership;
import si.contactmanager.group.Role;
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

    MapsController(GroupAccess access, PhotonClient photon) {
        this.access = access;
        this.photon = photon;
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
