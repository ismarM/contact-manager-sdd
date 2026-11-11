package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * Arhitekturno varovalo za ponovno uporabo poizvedbe v 009 in 010 (research R-14, plan: zasnova za 009/010), ne test
 * funkcionalne zahteve: model poizvedbe, razčlenjevalnik in gradnik SQL ne smejo biti vezani na spletni sloj, model je
 * nepremenljiv, razčlenjevalnik sprejme navaden {@code Map}. Zelen že ob ogrodju (zavestna izjema od »pade zaradi
 * pravega razloga«, kot {@code MemberArchitectureTest}, D-59).
 */
class ContactQueryArchitectureTest {

    private static final List<Class<?>> REUSABLE = List.of(
            ContactQuery.class,
            ContactQuery.Field.class,
            ContactQuery.Condition.class,
            ContactQuery.Kind.class,
            ContactQuery.Direction.class,
            ContactQueryParser.class,
            ContactQueryParser.Parsed.class,
            ContactSearch.class,
            ContactSearch.Sql.class);

    private static final List<String> FORBIDDEN_PREFIXES = List.of(
            "org.springframework.web.",
            "org.springframework.http.",
            "org.springframework.security.",
            "jakarta.servlet.",
            "si.contactmanager.contact.ContactController");

    private static List<Class<?>> typesUsedBy(Class<?> type) {
        List<Class<?>> used = new ArrayList<>();
        for (Field field : type.getDeclaredFields()) {
            used.add(field.getType());
        }
        for (Constructor<?> constructor : type.getDeclaredConstructors()) {
            used.addAll(List.of(constructor.getParameterTypes()));
        }
        for (Method method : type.getDeclaredMethods()) {
            used.add(method.getReturnType());
            used.addAll(List.of(method.getParameterTypes()));
        }
        return used;
    }

    @Test
    void queryParserAndSearchDoNotUseTheWebLayer() {
        List<String> violations = new ArrayList<>();
        for (Class<?> type : REUSABLE) {
            for (Class<?> used : typesUsedBy(type)) {
                if (FORBIDDEN_PREFIXES.stream()
                        .anyMatch(prefix -> used.getName().startsWith(prefix))) {
                    violations.add(type.getSimpleName() + " uporablja " + used.getName());
                }
            }
        }

        assertThat(violations).isEmpty();
    }

    @Test
    void parserAcceptsAPlainMapOfStringLists() throws Exception {
        Method parse = ContactQueryParser.class.getMethod("parse", Map.class);

        assertThat(parse.getGenericParameterTypes()[0].getTypeName())
                .isEqualTo("java.util.Map<java.lang.String, java.util.List<java.lang.String>>");
    }

    @Test
    void queryIsImmutable() {
        List<String> words = new ArrayList<>(List.of("a"));
        List<ContactQuery.Condition> conditions = new ArrayList<>();
        List<String> tags = new ArrayList<>(List.of("vip"));
        ContactQuery query = new ContactQuery(
                words,
                conditions,
                tags,
                new ContactQuery.Field(ContactQuery.Kind.LAST_NAME, null),
                ContactQuery.Direction.ASC,
                0,
                25);

        words.add("b");
        tags.clear();

        assertThat(query.words()).containsExactly("a");
        assertThat(query.tags()).containsExactly("vip");
        assertThatThrownBy(() -> query.words().add("c")).isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> query.conditions().clear()).isInstanceOf(UnsupportedOperationException.class);
        assertThat(ContactQuery.class.isRecord()).isTrue();
        assertThat(Stream.of(ContactQuery.class.getDeclaredMethods())
                        .filter(m -> m.getName().startsWith("set")))
                .isEmpty();
    }
}
