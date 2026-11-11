package si.contactmanager.contact;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import si.contactmanager.contact.ContactQuery.Condition;
import si.contactmanager.contact.ContactQuery.Direction;
import si.contactmanager.contact.ContactQuery.Field;
import si.contactmanager.contact.ContactQuery.Kind;

/**
 * Gradnik poizvedb seznama kontaktov (specs/008-iskanje/research.md R-04, R-05, R-13). Besedilo SQL je sestavljeno iz
 * <b>zaprtih fragmentov</b>: od vnosa je odvisna samo oblika (število besed, pogojev in značk, vrsta polja, smer),
 * nikoli vrednost; vse vrednosti so imenovani parametri. Polje razvrščanja in stolpec pogoja izbira zaprta
 * preslikava, nikoli niz iz zahteve.
 *
 * <p>Gradnik je neodvisen od spletnega sloja; 009 (izbor vseh zadetkov) in 010 (izvoz) uporabita isti {@link #where}
 * in {@link #orderBy} z istim pomenom.
 */
public final class ContactSearch {

    /** Besedilo SQL in imenovani parametri. */
    public record Sql(String text, Map<String, Object> parameters) {}

    private static final String SEARCH = " COLLATE search_fold";

    private ContactSearch() {}

    /** Stran kontaktov (stolpci vrstice seznama; značke strani se preberejo posebej). */
    public static Sql page(UUID group, ContactQuery query) {
        Map<String, Object> parameters = new LinkedHashMap<>();
        String where = where(group, query, parameters);
        String order = orderBy(query, parameters);
        parameters.put("size", query.size());
        parameters.put("offset", (long) query.page() * query.size());
        return new Sql(
                "SELECT c.id, c.first_name, c.last_name, c.email, c.phone, c.version,"
                        + " c.reverted_entry_id IS NOT NULL AS reverted FROM contact c WHERE " + where
                        + " ORDER BY " + order + " LIMIT :size OFFSET :offset",
                parameters);
    }

    /** Skupno število zadetkov. */
    public static Sql count(UUID group, ContactQuery query) {
        Map<String, Object> parameters = new LinkedHashMap<>();
        String where = where(group, query, parameters);
        return new Sql("SELECT count(*) FROM contact c WHERE " + where, parameters);
    }

    /** Pogoj {@code WHERE}: skupina, besede (AND), pogoji atributov (AND) in značke (AND). */
    public static String where(UUID group, ContactQuery query, Map<String, Object> parameters) {
        List<String> parts = new ArrayList<>();
        parameters.put("group", group);
        parts.add("c.group_id = :group");
        List<String> words = query.words();
        for (int i = 0; i < words.size(); i++) {
            String parameter = "w" + i;
            parameters.put(parameter, words.get(i));
            List<String> columns = new ArrayList<>();
            for (String column : List.of("first_name", "last_name", "address", "email", "phone")) {
                columns.add("strpos(coalesce(c." + column + ", '')" + SEARCH + ", :" + parameter + ") > 0");
            }
            parts.add("(" + String.join(" OR ", columns) + ")");
        }
        List<Condition> conditions = query.conditions();
        for (int i = 0; i < conditions.size(); i++) {
            Condition condition = conditions.get(i);
            String value = "cv" + i;
            parameters.put(value, condition.value());
            if (condition.field().kind() == Kind.ATTRIBUTE) {
                String key = "ck" + i;
                parameters.put(key, condition.field().keyNorm());
                parts.add("EXISTS (SELECT 1 FROM contact_attribute a WHERE a.contact_id = c.id AND a.key_norm = :" + key
                        + " AND strpos(a.value" + SEARCH + ", :" + value + ") > 0)");
            } else {
                parts.add("strpos(coalesce(c." + column(condition.field().kind()) + ", '')" + SEARCH + ", :" + value
                        + ") > 0");
            }
        }
        List<String> tags = query.tags();
        for (int i = 0; i < tags.size(); i++) {
            String parameter = "t" + i;
            parameters.put(parameter, tags.get(i));
            parts.add("EXISTS (SELECT 1 FROM contact_tag t WHERE t.contact_id = c.id AND t.tag_norm = :" + parameter
                    + ")");
        }
        return String.join(" AND ", parts);
    }

    /**
     * Razvrščanje (D-63, R-05): izbrano polje, prazno vedno na koncu, nato priimek, ime, čas nastanka in id, zato je
     * vrstni red popolnoma določen.
     */
    public static String orderBy(ContactQuery query, Map<String, Object> parameters) {
        Field sort = query.sort();
        String direction = query.direction() == Direction.DESC ? "DESC" : "ASC";
        String tail = "c.created_at, c.id";
        return switch (sort.kind()) {
            case LAST_NAME -> "c.sort_last " + direction + " NULLS LAST, c.sort_first ASC NULLS LAST, " + tail;
            case FIRST_NAME -> "c.sort_first " + direction + " NULLS LAST, c.sort_last ASC NULLS LAST, " + tail;
            case ADDRESS, EMAIL, PHONE ->
                "c." + column(sort.kind()) + " COLLATE sort_sl " + direction
                        + " NULLS LAST, c.sort_last ASC NULLS LAST, c.sort_first ASC NULLS LAST, " + tail;
            case ATTRIBUTE -> {
                parameters.put("sortKey", sort.keyNorm());
                yield "(SELECT a.value FROM contact_attribute a WHERE a.contact_id = c.id AND a.key_norm = :sortKey)"
                        + " COLLATE sort_sl " + direction
                        + " NULLS LAST, c.sort_last ASC NULLS LAST, c.sort_first ASC NULLS LAST, " + tail;
            }
        };
    }

    /** Stolpec predefiniranega polja (zaprta preslikava). */
    private static String column(Kind kind) {
        return switch (kind) {
            case FIRST_NAME -> "first_name";
            case LAST_NAME -> "last_name";
            case ADDRESS -> "address";
            case EMAIL -> "email";
            case PHONE -> "phone";
            case ATTRIBUTE -> throw new IllegalArgumentException("dodatni atribut nima stolpca");
        };
    }
}
