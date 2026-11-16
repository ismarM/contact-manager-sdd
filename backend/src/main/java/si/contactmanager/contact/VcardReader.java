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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.function.Function;

/**
 * Branje vizitk vCard 2.1, 3.0 in 4.0 v kandidate uvoza (FR-014-13, research R-03): prednostni (sicer prvi) e-naslov,
 * telefon in naslov v predefinirana polja, naslednji v oštevilčene atribute; rojstni dan, spletna stran in opomba v
 * atribute v jeziku vmesnika; fotografije in drugih lastnosti ne uvozi.
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
        extendedAttributes(card, attributes);

        List<Email> emails = preferredFirst(card.getEmails(), Email::getPref, VcardReader::typePref);
        List<Telephone> phones = preferredFirst(card.getTelephoneNumbers(), Telephone::getPref, VcardReader::typePref);
        List<Address> addresses = preferredFirst(card.getAddresses(), Address::getPref, VcardReader::typePref);

        String email = emails.isEmpty() ? null : emails.get(0).getValue();
        String phone = phones.isEmpty() ? null : phoneText(phones.get(0));
        String address = null;
        String country = null;
        if (!addresses.isEmpty()) {
            address = addressText(addresses.get(0));
            country = countryText(addresses.get(0));
        }
        for (int i = 1; i < emails.size(); i++) {
            attributes.addNumbered(labels.email(), 2, emails.get(i).getValue());
        }
        for (int i = 1; i < phones.size(); i++) {
            attributes.addNumbered(labels.phone(), 2, phoneText(phones.get(i)));
        }
        for (int i = 1; i < addresses.size(); i++) {
            List<String> parts = new ArrayList<>();
            String lines = addressText(addresses.get(i));
            if (lines != null) {
                parts.addAll(List.of(lines.split("\n")));
            }
            String extraCountry = addresses.get(i).getCountry();
            if (extraCountry != null && !extraCountry.isBlank()) {
                parts.add(extraCountry.strip());
            }
            attributes.addNumbered(labels.address(), 2, blankToNull(String.join(", ", parts)));
        }
        if (card.getBirthday() != null) {
            attributes.addNumbered(labels.birthday(), 1, birthday(card.getBirthday()));
        }
        for (Url url : card.getUrls()) {
            attributes.addNumbered(labels.website(), 1, url.getValue());
        }
        for (Note note : card.getNotes()) {
            attributes.addNumbered(labels.note(), 1, note.getValue());
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
        return new ImportCandidate(first, last, address, email, phone, company, country, attributes.list(), tags);
    }

    /** Pari {@code X-CM-KEY}/{@code X-CM-VALUE} po skupinah, v vrstnem redu prve lastnosti skupine. */
    private static void extendedAttributes(VCard card, VcardMapping.AttributeList attributes) {
        Map<String, String[]> pairs = new LinkedHashMap<>();
        for (RawProperty raw : card.getExtendedProperties()) {
            String name = raw.getPropertyName().toUpperCase(Locale.ROOT);
            if (raw.getGroup() == null || (!name.equals(VcardMapping.KEY) && !name.equals(VcardMapping.VALUE))) {
                continue;
            }
            String[] pair = pairs.computeIfAbsent(raw.getGroup().toLowerCase(Locale.ROOT), g -> new String[2]);
            pair[name.equals(VcardMapping.KEY) ? 0 : 1] = VcardMapping.unescape(raw.getValue());
        }
        for (String[] pair : pairs.values()) {
            if (pair[0] != null && pair[1] != null) {
                attributes.add(pair[0], pair[1]);
            }
        }
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
        String code = address.getParameters().first(VcardMapping.COUNTRY_CODE);
        if (code != null && CountryNames.isValid(code.strip().toUpperCase(Locale.ROOT))) {
            return code.strip().toUpperCase(Locale.ROOT);
        }
        return blankToNull(join(address.getCountries()));
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

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }
}
