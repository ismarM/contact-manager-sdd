package si.contactmanager.account;

import si.contactmanager.account.DisplayFormat.AddressFormat;
import si.contactmanager.account.DisplayFormat.DateFormat;
import si.contactmanager.account.DisplayFormat.PhoneFormat;

/**
 * Profil prijavljenega uporabnika (contracts/openapi.yaml – Profile); brez identifikatorjev (FR-001-08). Oblike
 * zapisa ({@code null} = privzeto) so samo nastavitev prikaza (FR-016-16). {@code photoRevision} je revizija
 * profilne slike ({@code null} = brez slike, 018).
 */
public record Profile(
        String name,
        String email,
        Language language,
        Theme theme,
        PhoneFormat phoneFormat,
        DateFormat dateFormat,
        AddressFormat addressFormat,
        Long photoRevision) {}
