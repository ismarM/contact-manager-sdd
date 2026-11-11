package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import si.contactmanager.contact.support.ContactSearchApiTest;
import si.contactmanager.contact.support.ContactSearchClient;
import si.contactmanager.support.PostgresContainer;

/**
 * Paginacija zadetkov in stabilnost vrstnega reda (FR-008-08), merilo SC-001: iskanje + dva pogoja + dve znački pri
 * 10.000 kontaktih, 5 ogrevalnih in 50 merjenih zahtev, p95 po metodi najbližjega ranga < 1000 ms (research R-15).
 */
class ContactSearchPagingIT extends ContactSearchApiTest {

    private List<String> ids(String body) {
        return ContactSearchClient.items(body).stream()
                .map(item -> (String) item.get("id"))
                .toList();
    }

    private List<String> allPages(Scenario s, int size, String... pairs) throws Exception {
        List<String> all = new ArrayList<>();
        for (int page = 0; ; page++) {
            List<String> parameters = new ArrayList<>(List.of(pairs));
            parameters.addAll(List.of("size", String.valueOf(size), "page", String.valueOf(page)));
            HttpResponse<String> response = search(s, parameters.toArray(String[]::new));
            assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
            List<String> pageIds = ids(response.body());
            if (pageIds.isEmpty()) {
                return all;
            }
            all.addAll(pageIds);
        }
    }

    @Test
    @Tag("FR-008-08")
    void threeHundredTwelveResultsArePagedBy25With13PagesAndByHundredWith4() throws Exception {
        Scenario s = scenario();
        contacts.insertDistribution(s.group(), s.id(Who.OWNER), 312);

        HttpResponse<String> first = search(s, "size", "25");
        assertThat(ContactSearchClient.total(first.body())).isEqualTo(312);
        assertThat(ids(first.body())).hasSize(25);
        for (int page = 0; page < 12; page++) {
            assertThat(ids(search(s, "size", "25", "page", String.valueOf(page)).body()))
                    .hasSize(25);
        }
        assertThat(ids(search(s, "size", "25", "page", "12").body())).hasSize(12);
        assertThat(ids(search(s, "size", "25", "page", "13").body())).isEmpty();

        assertThat(ids(search(s, "size", "100").body())).hasSize(100);
        assertThat(ids(search(s, "size", "100", "page", "3").body())).hasSize(12);
        assertThat(ids(search(s, "size", "50", "page", "6").body())).hasSize(12);
    }

    @Test
    @Tag("FR-008-08")
    void pageBeyondTheLastIsEmptyWithTheCorrectTotalAndSize() throws Exception {
        Scenario s = scenario();
        contacts.insertDistribution(s.group(), s.id(Who.OWNER), 312);

        HttpResponse<String> response = search(s, "page", "19", "size", "25");

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(ContactSearchClient.items(response.body())).isEmpty();
        assertThat(ContactSearchClient.total(response.body())).isEqualTo(312);
        assertThat(ContactSearchClient.page(response.body()))
                .containsEntry("page", 19)
                .containsEntry("size", 25);
    }

    @Test
    @Tag("FR-008-08")
    void totalFollowsTheFiltersNotTheWholeGroup() throws Exception {
        Scenario s = scenario();
        contacts.insertDistribution(s.group(), s.id(Who.OWNER), 312);

        // vsak 10. kontakt (n % 10 == 0) je »Ana«, vsak drugi ima značko vip: n % 10 == 0 → vsi sodi
        HttpResponse<String> response = search(s, "f", "firstName:ana", "tag", "vip", "size", "25");

        assertThat(ContactSearchClient.total(response.body())).isEqualTo(31);
        assertThat(allPages(s, 25, "f", "firstName:ana", "tag", "vip")).hasSize(31);
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "lastName|asc",
                "lastName|desc",
                "email|desc",
                "phone|asc",
                "x.kompetenca|asc",
                "x.kompetenca|desc",
                "firstName|asc"
            })
    @Tag("FR-008-08")
    @Tag("FR-008-07")
    void everyContactAppearsExactlyOnceAcrossPagesInTheSameOrderAsOnePage(String sorting) throws Exception {
        Scenario s = scenario();
        // veliko popolnoma enakih ključev: 17 priimkov, 10 imen, vrednosti dodatnega atributa na vsakem tretjem
        contacts.insertDistribution(s.group(), s.id(Who.OWNER), 312);
        String[] sort = sorting.split("\\|");

        List<String> by25 = allPages(s, 25, "sort", sort[0], "dir", sort[1]);
        List<String> by100 = allPages(s, 100, "sort", sort[0], "dir", sort[1]);
        List<String> by50 = allPages(s, 50, "sort", sort[0], "dir", sort[1]);

        assertThat(by25).hasSize(312);
        assertThat(new HashSet<>(by25)).as("brez podvojenih").hasSize(312);
        assertThat(by100).containsExactlyElementsOf(by25);
        assertThat(by50).containsExactlyElementsOf(by25);
    }

    @Test
    @Tag("FR-008-08")
    void contactsWithEqualSortKeysKeepAStableOrderAcrossRepeatedRequests() throws Exception {
        Scenario s = scenario();
        for (int i = 0; i < 60; i++) {
            add(s, "Ana", "Novak");
        }
        List<String> first = allPages(s, 25);
        List<String> second = allPages(s, 25);
        List<String> descending = allPages(s, 25, "sort", "lastName", "dir", "desc");

        assertThat(first).hasSize(60);
        assertThat(new HashSet<>(first)).hasSize(60);
        assertThat(second).containsExactlyElementsOf(first);
        assertThat(descending).containsExactlyElementsOf(first);
    }

    @Test
    @Tag("FR-008-08")
    @Tag("SC-001")
    void searchWithTwoConditionsAndTwoTagsIsFastAtTenThousandContacts() throws Exception {
        Scenario s = scenario();
        contacts.insertDistribution(s.group(), s.id(Who.OWNER), 10_000);
        String[] query = {
            "q",
            "ana",
            "f",
            "email:feri.si",
            "f",
            "x.kompetenca:web",
            "tag",
            "vip",
            "tag",
            "konferenca2025",
            "sort",
            "email",
            "dir",
            "desc",
            "size",
            "50"
        };

        assertThat(ContactSearchClient.total(search(s).body())).isEqualTo(10_000);
        for (int i = 0; i < 5; i++) {
            assertThat(search(s, query).statusCode()).isEqualTo(200);
        }
        List<Long> millis = new ArrayList<>();
        for (int i = 0; i < 50; i++) {
            long start = System.nanoTime();
            HttpResponse<String> response = search(s, query);
            millis.add((System.nanoTime() - start) / 1_000_000);
            assertThat(response.statusCode()).isEqualTo(200);
            // n % 30 == 0 (Ana, feri.si, kompetenca, vip in konferenca2025): 333 zadetkov
            assertThat(ContactSearchClient.total(response.body())).isEqualTo(333);
        }
        Collections.sort(millis);
        long p95 = millis.get(47); // najbližji rang: ceil(0,95 × 50) = 48. najmanjša vrednost
        record(millis, p95);

        assertThat(p95).as("p95 iskanja pri 10.000 kontaktih (ms)").isLessThan(1000);
    }

    /** Okolje in rezultat meritve SC-001 (za traceability.md, razdelek *Meritve*). */
    private void record(List<Long> sorted, long p95) throws IOException {
        String version = jdbc.queryForObject("select version()", String.class);
        String cpu = "?";
        try {
            cpu = Files.readAllLines(Path.of("/proc/cpuinfo")).stream()
                    .filter(line -> line.startsWith("model name"))
                    .findFirst()
                    .orElse("?");
        } catch (IOException e) {
            // neznan procesor
        }
        String commit = "?";
        try {
            Process process = new ProcessBuilder("git", "rev-parse", "--short", "HEAD").start();
            commit = new String(process.getInputStream().readAllBytes()).trim();
        } catch (IOException e) {
            // brez gita
        }
        String text = "SC-001 " + Instant.now() + " commit " + commit + "\n"
                + "p50=" + sorted.get(24) + " ms, p95=" + p95 + " ms, max=" + sorted.getLast()
                + " ms (50 meritev, 5 ogrevalnih)\n"
                + "zahteva: p95 < 1000 ms\n"
                + "PostgreSQL: " + version + "\n"
                + "slika: " + PostgresContainer.IMAGE + "\n"
                + "JDK: " + System.getProperty("java.version") + " " + System.getProperty("os.arch") + "\n"
                + "procesorjev: " + Runtime.getRuntime().availableProcessors() + ", " + cpu + "\n"
                + "pomnilnik JVM (največ): " + Runtime.getRuntime().maxMemory() / (1024 * 1024) + " MB\n";
        Path out = Path.of("target", "sc001-measurement.txt");
        Files.createDirectories(out.getParent());
        Files.writeString(out, text);
        System.out.println(text);
    }
}
