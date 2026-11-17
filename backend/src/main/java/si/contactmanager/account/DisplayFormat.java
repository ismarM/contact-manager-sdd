package si.contactmanager.account;

import java.util.Arrays;
import java.util.Optional;

/**
 * Prikazne sheme uporabnika (016, FR-016-16): spremenijo samo prikaz v brskalniku; strežnik hrani in vrača eno
 * kanonično obliko (FR-016-18). {@code null} v profilu = privzeta shema.
 */
public final class DisplayFormat {

    private DisplayFormat() {}

    /** Telefon: mednarodno (privzeto), nacionalno ali E.164. */
    public enum PhoneFormat {
        INTERNATIONAL,
        NATIONAL,
        E164
    }

    /** Datum: po jeziku vmesnika (privzeto), ISO 8601 ali dolga oblika. */
    public enum DateFormat {
        LOCALE,
        ISO,
        LONG
    }

    /** Naslov: po pravilih države (privzeto) ali enovrstično. */
    public enum AddressFormat {
        COUNTRY,
        SINGLE_LINE
    }

    /** Vrednost po imenu (natančno ujemanje); neznana vrednost ali {@code null} = prazno. */
    static <E extends Enum<E>> Optional<E> parse(Class<E> type, String name) {
        return name == null
                ? Optional.empty()
                : Arrays.stream(type.getEnumConstants())
                        .filter(value -> value.name().equals(name))
                        .findFirst();
    }

    /** Vrednost v bazi; neznana se prebere kot privzeta ({@code null}). */
    static <E extends Enum<E>> E read(Class<E> type, String name) {
        return parse(type, name).orElse(null);
    }

    /** Neobvezno polje zahteve: manjka (nespremenjeno) ali prisotno z vrednostjo ali {@code null} (= privzeto). */
    public record Choice<T>(boolean present, T value) {

        public static <T> Choice<T> absent() {
            return new Choice<>(false, null);
        }

        public static <T> Choice<T> of(T value) {
            return new Choice<>(true, value);
        }

        String name() {
            return value instanceof Enum<?> e ? e.name() : null;
        }
    }
}
