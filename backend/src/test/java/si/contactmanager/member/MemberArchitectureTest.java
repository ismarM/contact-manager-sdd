package si.contactmanager.member;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.AnnotatedBeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.classreading.MetadataReader;

/**
 * Arhitekturno varovalo (D-59, T2), ne test funkcionalne zahteve: paket {@code member} ne sme uporabljati paketa
 * {@code audit} (FR-005-06). Vedenjsko pokritost FR-007-12 zagotavlja {@code MemberAuditIT}. Test je zelen že ob ogrodju.
 */
class MemberArchitectureTest {

    /**
     * Varovalni test (T2): nobena členska spremenljivka, konstruktor, metoda ali anotacija nobenega razreda produkcijskega
     * paketa {@code member} (vključno z notranjimi in bodočimi razredi) ne uporablja tipa iz paketa {@code audit}. Zelen že
     * ob ogrodju; zavestna izjema od »pade zaradi pravega razloga« (D-59). Paket se pregleda dinamično.
     */
    @Test
    void memberPackageDoesNotUseAudit() throws Exception {
        ClassPathScanningCandidateComponentProvider scanner = new ClassPathScanningCandidateComponentProvider(false) {
            @Override
            protected boolean isCandidateComponent(AnnotatedBeanDefinition definition) {
                return true;
            }

            @Override
            protected boolean isCandidateComponent(MetadataReader reader) {
                return true;
            }
        };
        scanner.addIncludeFilter((reader, factory) -> true);
        List<Class<?>> classes = new ArrayList<>();
        for (var definition : scanner.findCandidateComponents("si/contactmanager/member")) {
            String name = definition.getBeanClassName();
            if (!name.contains(".support.")
                    && !name.endsWith("Test")
                    && !name.endsWith("IT")
                    && !name.contains("IT$")) {
                classes.add(Class.forName(name));
            }
        }
        assertThat(classes).as("razredi paketa member").isNotEmpty();
        List<String> used = new ArrayList<>();
        for (Class<?> type : classes) {
            used.add(
                    type.getGenericSuperclass() == null
                            ? ""
                            : type.getGenericSuperclass().getTypeName());
            for (Field field : type.getDeclaredFields()) {
                used.add(field.getGenericType().getTypeName());
            }
            for (Constructor<?> constructor : type.getDeclaredConstructors()) {
                Stream.of(constructor.getGenericParameterTypes()).forEach(t -> used.add(t.getTypeName()));
            }
            for (Method method : type.getDeclaredMethods()) {
                used.add(method.getGenericReturnType().getTypeName());
                Stream.of(method.getGenericParameterTypes()).forEach(t -> used.add(t.getTypeName()));
            }
        }
        assertThat(used).noneMatch(name -> name.contains("si.contactmanager.audit."));
    }
}
