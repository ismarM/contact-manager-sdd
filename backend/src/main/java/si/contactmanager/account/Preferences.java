package si.contactmanager.account;

import si.contactmanager.account.DisplayFormat.AddressFormat;
import si.contactmanager.account.DisplayFormat.Choice;
import si.contactmanager.account.DisplayFormat.DateFormat;
import si.contactmanager.account.DisplayFormat.PhoneFormat;

/**
 * Izbira jezika in teme ({@code null} = ni izbire), FR-001-15, FR-001-17, FR-001-19, ter neobvezne prikazne sheme
 * (016, FR-016-16, FR-016-17: manjka = nespremenjeno, {@code null} = privzeto).
 */
public record Preferences(
        Language language,
        Theme theme,
        Choice<PhoneFormat> phoneFormat,
        Choice<DateFormat> dateFormat,
        Choice<AddressFormat> addressFormat) {

    public static final Preferences NONE = new Preferences(null, null);

    public Preferences(Language language, Theme theme) {
        this(language, theme, Choice.absent(), Choice.absent(), Choice.absent());
    }
}
