package si.contactmanager.contact;

import ezvcard.Ezvcard;
import ezvcard.VCard;
import ezvcard.property.Address;
import ezvcard.property.Birthday;
import ezvcard.property.Categories;
import ezvcard.property.Email;
import ezvcard.property.FormattedName;
import ezvcard.property.Note;
import ezvcard.property.Organization;
import ezvcard.property.RawProperty;
import ezvcard.property.StructuredName;
import ezvcard.property.Telephone;
import ezvcard.property.Url;
import ezvcard.property.VCardProperty;
import java.io.IOException;
import java.io.StringReader;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoField;
import java.time.temporal.Temporal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Branje vizitk vCard 2.1, 3.0 in 4.0 v kandidate uvoza (FR-014-13, research R-03): prednostni (sicer prvi) e-naslov,
 * telefon in naslov v predefinirana polja, naslednji v oštevilčene atribute; rojstni dan, spletna stran in opomba v
 * atribute v jeziku vmesnika; fotografije in drugih lastnosti ne uvozi. Tipi (016, FR-016-24): {@code ADR} po delih
 * gre v {@code addressParts}, dodatni {@code EMAIL}, {@code TEL}, {@code ADR}, rojstni dan, spletna stran in opomba v
 * atribute tipov <i>E-naslov</i>, <i>Telefon</i>, <i>Naslov</i>, <i>Datum</i>, <i>Spletni naslov</i> in <i>Opombe</i>;
 * lastnosti v skupini z {@code X-CM-KEY} (izvoz te aplikacije) dobijo ključ iz skupine.
 */
public final class VcardReader {

    /** Največ vizitk v eni datoteki (FR-014-08). */
    public static final int MAX_CARDS = 10_000;

    /** Prebrane vizitke in vrste izpuščenih lastnosti ({@code PHOTO}, {@code OTHER}). */
    public record Result(List<ImportCandidate> candidates, Set<String> omitted) {}

    /** Datoteka ni vCard ali ima preveč vizitk. */
    public static final class Invalid extends Exception {

        private static final long serialVersionUID = 1L;

        private final String code;

        Invalid(String code) {
            super(code);
            this.code = code;
        }

        public String code() {
            return code;
        }
    }

    private static final Set<Class<?>> KNOWN = Set.of(
            StructuredName.class,
            FormattedName.class,
            Organization.class,
            Email.class,
            Telephone.class,
            Address.class,
            Categories.class,
            Birthday.class,
            Url.class,
            Note.class,
            ezvcard.property.Uid.class,
            ezvcard.property.Revision.class,
            ezvcard.property.ProductId.class);

    private VcardReader() {}

    public static Result read(String text, String language) throws Invalid {
        String body = text.startsWith("﻿") ? text.substring(1) : text;
        if (!body.toUpperCase(Locale.ROOT).contains("BEGIN:VCARD")) {
            throw new Invalid("NOT_VCF");
        }
        List<VCard> cards;
        try {
            cards = Ezvcard.parse(new StringReader(body)).all();
        } catch (IOException | RuntimeException e) {
            throw new Invalid("NOT_VCF");
        }
        if (cards.isEmpty()) {
            throw new Invalid("NOT_VCF");
        }
        if (cards.size() > MAX_CARDS) {
            throw new Invalid("TOO_MANY_ROWS");
        }
        Set<String> omitted = new TreeSet<>();
        List<ImportCandidate> candidates = new ArrayList<>(cards.size());
        for (VCard card : cards) {
            candidates.add(candidate(card, VcardMapping.labels(language), omitted));
        }
        return new Result(List.copyOf(candidates), Set.copyOf(omitted));
    }

    static ImportCandidate candidate(VCard card, VcardMapping.Labels labels, Set<String> omitted) {
        for (VCardProperty property : card.getProperties()) {
            if (property instanceof ezvcard.property.Photo) {
                omitted.add("PHOTO");
            } else if (!(property instanceof RawProperty) && !KNOWN.contains(property.getClass())) {
                omitted.add("OTHER");
            }
        }
        String first = null;
        String last = null;
        StructuredName n = card.getStructuredName();
        if (n != null) {
            List<String> given = new ArrayList<>();
            if (n.getGiven() != null) {
                given.add(n.getGiven());
            }
            given.addAll(n.getAdditionalNames());
            first = blankToNull(
                    String.join(" ", given.stream().filter(s -> !s.isBlank()).toList()));
            last = blankToNull(String.join(" ", n.getFamily() == null ? List.of() : List.of(n.getFamily())));
        }
        if (first == null && last == null && card.getFormattedName() != null) {
            String[] split = VcardMapping.splitFullName(card.getFormattedName().getValue());
            first = split[0];
            last = split[1];
        }

        VcardMapping.AttributeList attributes = new VcardMapping.AttributeList();
        Set<VCardProperty> grouped = Collections.newSetFromMap(new IdentityHashMap<>());
        groupedAttributes(card, attributes, grouped);

        List<Email> emails = preferredFirst(without(card.getEmails(), grouped), Email::getPref, VcardReader::typePref);
        List<Telephone> phones =
                preferredFirst(without(card.getTelephoneNumbers(), grouped), Telephone::getPref, VcardReader::typePref);
        List<Address> addresses =
                preferredFirst(without(card.getAddresses(), grouped), Address::getPref, VcardReader::typePref);

        String email = emails.isEmpty() ? null : emails.get(0).getValue();
        String phone = phones.isEmpty() ? null : phoneText(phones.get(0));
        String address = null;
        si.contactmanager.contact.Address addressParts = null;
        String country = null;
        if (!addresses.isEmpty()) {
            addressParts = parts(addresses.get(0));
            address = addressParts == null ? addressText(addresses.get(0)) : null;
            country = countryText(addresses.get(0));
        }
        for (int i = 1; i < emails.size(); i++) {
            attributes.addNumbered(
                    labels.email(), 2, AttributeType.EMAIL, emails.get(i).getValue());
        }
        for (int i = 1; i < phones.size(); i++) {
            attributes.addNumbered(labels.phone(), 2, AttributeType.PHONE, phoneText(phones.get(i)));
        }
        for (int i = 1; i < addresses.size(); i++) {
            List<String> lines = new ArrayList<>();
            String text = addressText(addresses.get(i));
            if (text != null) {
                lines.addAll(List.of(text.split("\n")));
            }
            String extraCountry = addresses.get(i).getCountry();
            if (extraCountry != null && !extraCountry.isBlank()) {
                lines.add(extraCountry.strip());
            }
            attributes.addNumbered(labels.address(), 2, AttributeType.ADDRESS, blankToNull(String.join(", ", lines)));
        }
        List<Birthday> birthdays = without(card.getBirthdays(), grouped);
        if (!birthdays.isEmpty()) {
            attributes.addNumbered(labels.birthday(), 1, AttributeType.DATE, birthday(birthdays.get(0)));
        }
        for (Url url : without(card.getUrls(), grouped)) {
            attributes.addNumbered(labels.website(), 1, AttributeType.URL, url.getValue());
        }
        for (Note note : without(card.getNotes(), grouped)) {
            attributes.addNumbered(labels.note(), 1, AttributeType.NOTES, lf(note.getValue()));
        }

        String company = null;
        Organization organization = card.getOrganization();
        if (organization != null && !organization.getValues().isEmpty()) {
            company = blankToNull(organization.getValues().get(0));
        }
        List<String> tags = new ArrayList<>();
        for (Categories categories : card.getCategoriesList()) {
            for (String value : categories.getValues()) {
                String tag = VcardMapping.tag(value);
                if (tag != null) {
                    tags.add(tag);
                }
            }
        }
        return new ImportCandidate(
                first, last, address, addressParts, email, phone, company, country, attributes.list(), tags);
    }

    private static final Pattern ATTR_GROUP = Pattern.compile("attr(\\d+)");

    /** Lastnosti ene skupine vizitke: oznaka ključa, vrednost para {@code X-CM-VALUE} in tipizirana lastnost. */
    private static final class Group {
        String key;
        String value;
        VCardProperty typed;
    }

    private static <T> List<T> without(List<T> properties, Set<VCardProperty> consumed) {
        return properties.stream()
                .filter(p -> !(p instanceof VCardProperty vp && consumed.contains(vp)))
                .toList();
    }

    /**
     * Dodatni atributi po skupinah ({@code attrN}, po številki): par {@code X-CM-KEY}/{@code X-CM-VALUE} je tipa
     * <i>Drugo</i>, tipizirana lastnost ({@code TEL}, {@code EMAIL}, {@code ADR}, {@code URL}, {@code BDAY},
     * {@code NOTE}) z {@code X-CM-KEY} v isti skupini pa atribut ustreznega tipa; prebrane lastnosti se zapišejo v
     * {@code consumed}, da jih predefinirana polja ne uporabijo znova.
     */
    private static void groupedAttributes(
            VCard card, VcardMapping.AttributeList attributes, Set<VCardProperty> consumed) {
        Map<String, Group> groups = new LinkedHashMap<>();
        for (VCardProperty property : card.getProperties()) {
            if (property.getGroup() == null) {
                continue;
            }
            Group group = groups.computeIfAbsent(property.getGroup().toLowerCase(Locale.ROOT), g -> new Group());
            if (property instanceof RawProperty raw) {
                String name = raw.getPropertyName().toUpperCase(Locale.ROOT);
                if (name.equals(VcardMapping.KEY)) {
                    group.key = VcardMapping.unescape(raw.getValue());
                } else if (name.equals(VcardMapping.VALUE)) {
                    group.value = VcardMapping.unescape(raw.getValue());
                }
            } else if (group.typed == null
                    && (property instanceof Telephone
                            || property instanceof Email
                            || property instanceof Address
                            || property instanceof Url
                            || property instanceof Birthday
                            || property instanceof Note)) {
                group.typed = property;
            }
        }
        groups.entrySet().stream()
                .sorted(java.util.Comparator.comparingInt(e -> {
                    Matcher m = ATTR_GROUP.matcher(e.getKey());
                    return m.matches() ? Integer.parseInt(m.group(1)) : Integer.MAX_VALUE;
                }))
                .map(Map.Entry::getValue)
                .filter(group -> group.key != null)
                .forEach(group -> {
                    if (group.value != null) {
                        attributes.add(group.key, group.value);
                    } else if (group.typed != null) {
                        consumed.add(group.typed);
                        typedAttribute(attributes, group.key, group.typed);
                    }
                });
    }

    private static void typedAttribute(VcardMapping.AttributeList attributes, String key, VCardProperty property) {
        if (property instanceof Telephone telephone) {
            attributes.add(key, AttributeType.PHONE, phoneText(telephone), null);
        } else if (property instanceof Email email) {
            attributes.add(key, AttributeType.EMAIL, email.getValue(), null);
        } else if (property instanceof Url url) {
            attributes.add(key, AttributeType.URL, url.getValue(), null);
        } else if (property instanceof Note note) {
            attributes.add(key, AttributeType.NOTES, lf(note.getValue()), null);
        } else if (property instanceof Birthday birthday) {
            attributes.add(key, AttributeType.DATE, birthday(birthday), null);
        } else if (property instanceof Address address) {
            si.contactmanager.contact.Address parts = parts(address);
            attributes.add(key, AttributeType.ADDRESS, parts == null ? addressText(address) : null, parts);
        }
    }

    /**
     * Deli {@code ADR} (016, FR-016-24): ulica; dodatna vrstica iz poštnega predala in dodatnega naslova; kraj, regija,
     * poštna številka; država samo kot koda ({@code X-CM-CC}). {@code null}, kadar naslov ni po delih (samo ulica, brez
     * oznake {@code X-CM-PARTS}) ali nima ulice ne kraja.
     */
    static si.contactmanager.contact.Address parts(Address address) {
        String street = lf(join(address.getStreetAddresses()));
        String extra = lf(join(
                java.util.stream.Stream.concat(address.getPoBoxes().stream(), address.getExtendedAddresses().stream())
                        .toList()));
        String city = join(address.getLocalities());
        String region = join(address.getRegions());
        String postal = join(address.getPostalCodes());
        boolean marked = address.getParameters().first(VcardMapping.PARTS) != null;
        boolean structured = marked || !extra.isEmpty() || !city.isEmpty() || !region.isEmpty() || !postal.isEmpty();
        if (!structured || (street.isEmpty() && city.isEmpty())) {
            return null;
        }
        return new si.contactmanager.contact.Address(
                blankToNull(street),
                blankToNull(extra),
                blankToNull(postal),
                blankToNull(city),
                blankToNull(region),
                code(address, VcardMapping.PARTS_COUNTRY));
    }

    private static String countryCode(Address address) {
        return code(address, VcardMapping.COUNTRY_CODE);
    }

    private static String code(Address address, String parameter) {
        String code = address.getParameters().first(parameter);
        if (code != null && CountryNames.isValid(code.strip().toUpperCase(Locale.ROOT))) {
            return code.strip().toUpperCase(Locale.ROOT);
        }
        return null;
    }

    private static boolean typePref(VCardProperty property) {
        for (String type : property.getParameters().getTypes()) {
            if (type.equalsIgnoreCase("pref")) {
                return true;
            }
        }
        return false;
    }

    /** Prednostna lastnost (najmanjši {@code PREF} ali {@code TYPE=pref}) na začetek, ostale v vrstnem redu datoteke. */
    private static <T extends VCardProperty> List<T> preferredFirst(
            List<T> properties, Function<T, Integer> pref, java.util.function.Predicate<T> typePref) {
        List<T> list = new ArrayList<>(properties);
        T best = null;
        int bestRank = Integer.MAX_VALUE;
        for (T property : list) {
            Integer p = pref.apply(property);
            int rank = p != null ? p : typePref.test(property) ? 100 : Integer.MAX_VALUE;
            if (rank < bestRank) {
                best = property;
                bestRank = rank;
            }
        }
        if (best != null) {
            list.remove(best);
            list.add(0, best);
        }
        return list;
    }

    private static String phoneText(Telephone telephone) {
        if (telephone.getText() != null) {
            return telephone.getText();
        }
        return telephone.getUri() == null ? null : telephone.getUri().getNumber();
    }

    /** Vrstice naslova: poštni predal, dodatni naslov, ulica, »poštna številka kraj«, regija. */
    static String addressText(Address address) {
        List<String> lines = new ArrayList<>();
        addLine(lines, join(address.getPoBoxes()));
        addLine(lines, join(address.getExtendedAddresses()));
        addLine(lines, join(address.getStreetAddresses()));
        String postal = join(address.getPostalCodes());
        String locality = join(address.getLocalities());
        addLine(lines, (postal + " " + locality).strip());
        addLine(lines, join(address.getRegions()));
        return blankToNull(String.join("\n", lines));
    }

    private static String countryText(Address address) {
        String code = countryCode(address);
        return code != null ? code : blankToNull(join(address.getCountries()));
    }

    private static String birthday(Birthday birthday) {
        Temporal date = birthday.getDate();
        if (date != null && date.isSupported(ChronoField.EPOCH_DAY)) {
            return DateTimeFormatter.ISO_LOCAL_DATE.format(LocalDate.from(date));
        }
        if (birthday.getText() != null) {
            return birthday.getText();
        }
        return birthday.getPartialDate() == null
                ? null
                : birthday.getPartialDate().toISO8601(true);
    }

    private static void addLine(List<String> lines, String line) {
        for (String part : line.split("\n")) {
            if (!part.isBlank()) {
                lines.add(part.strip());
            }
        }
    }

    private static String join(List<String> values) {
        return String.join(
                ", ", values.stream().filter(v -> v != null && !v.isBlank()).toList());
    }

    /** Prelomi vrstic kot LF (knjižnica jih vrne po sistemu). */
    private static String lf(String value) {
        return value == null ? null : value.replace("\r\n", "\n").replace('\r', '\n');
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }
}
