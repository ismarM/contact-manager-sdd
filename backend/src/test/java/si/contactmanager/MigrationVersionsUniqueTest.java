package si.contactmanager;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * Varovalo pred trkom številk migracij med vzporednimi vejami (012, research R-14): dve veji z isto različico sta
 * posamično zeleni, trk se pokaže šele po združitvi. Test brez baze zavrne podvojene različice in vrzeli.
 */
class MigrationVersionsUniqueTest {

    private static final Path DIRECTORY = Path.of("src/main/resources/db/migration");
    private static final Pattern NAME = Pattern.compile("V(\\d+)__.+\\.sql");

    private static List<Integer> versions() throws IOException {
        try (Stream<Path> files = Files.list(DIRECTORY)) {
            return files.map(path -> path.getFileName().toString())
                    .map(NAME::matcher)
                    .filter(Matcher::matches)
                    .map(matcher -> Integer.parseInt(matcher.group(1)))
                    .sorted()
                    .toList();
        }
    }

    @Test
    void migrationVersionsAreUnique() throws IOException {
        List<Integer> versions = versions();

        assertThat(versions).as("različice migracij").doesNotHaveDuplicates();
    }

    @Test
    void migrationVersionsAreContiguousFromOne() throws IOException {
        List<Integer> versions = versions();

        assertThat(versions).isNotEmpty();
        assertThat(versions)
                .containsExactlyElementsOf(java.util.stream.IntStream.rangeClosed(1, versions.size())
                        .boxed()
                        .toList());
    }

    @Test
    void everyMigrationFileFollowsTheNamingConvention() throws IOException {
        try (Stream<Path> files = Files.list(DIRECTORY)) {
            assertThat(files.map(path -> path.getFileName().toString()))
                    .allSatisfy(name -> assertThat(name).matches(NAME.pattern()));
        }
    }
}
