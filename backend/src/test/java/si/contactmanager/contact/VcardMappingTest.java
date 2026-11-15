package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * Preslikava kontakt ↔ vCard (FR-014-11, -12, -13; SC-003; research R-03) na skupnih testnih vizitkah
 * {@code src/test/resources/vcard/}, ki jih bere tudi frontend ({@code features/contacts/qr/vcardShared.test.ts}):
 * {@code cases/*.vcf} → pričakovani kandidati, pisalnik zaledja → {@code written-backend.vcf}, bralnik zaledja prebere
 * vizitko pisalnika frontenda ({@code written-frontend.vcf}) v {@code contact-full.json}.
 *
 * <p>Vzorec pisalnika se po namerni spremembi preslikave obnovi z {@code -Dvcard.update=true}; sprememba vzorca je v
 * opisu PR.
 */
@Tag("FR-014-11")
@Tag("FR-014-12")
@Tag("FR-014-13")
@Tag("SC-003")
class VcardMappingTest {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private static final Path SOURCE = Path.of("src", "test", "resources", "vcard");

    @ParameterizedTest
    @ValueSource(strings = {"qp-21", "phone-30", "fn-only-40"})
    void sharedCasesAreReadAsExpected(String name) throws Exception {
        Map<String, Object> expected = JSON.readValue(resource("cases/" + name + ".json"), new TypeReference<>() {});

        VcardReader.Result result =
                VcardReader.read(resource("cases/" + name + ".vcf"), (String) expected.get("language"));

        assertThat(JSON.convertValue(result.candidates(), new TypeReference<List<Map<String, Object>>>() {}))
                .isEqualTo(expected.get("candidates"));
        assertThat(List.copyOf(new java.util.TreeSet<>(result.omitted()))).isEqualTo(expected.get("omitted"));
    }

    @Test
    void theBackendWriterProducesItsSharedSample() throws Exception {
        String written = normalize(VcardWriter.write(List.of(contactFull()), "sl"));

        if (Boolean.getBoolean("vcard.update")) {
            Files.writeString(SOURCE.resolve("written-backend.vcf"), written, StandardCharsets.UTF_8);
        }

        assertThat(written).isEqualTo(normalize(resource("written-backend.vcf")));
    }

    @ParameterizedTest
    @ValueSource(strings = {"written-backend.vcf", "written-frontend.vcf"})
    void bothWritersAreReadBackIntoTheSameContact(String sample) throws Exception {
        Map<String, Object> expected = JSON.readValue(resource("contact-full.json"), new TypeReference<>() {});

        VcardReader.Result result = VcardReader.read(resource(sample), "sl");

        assertThat(JSON.convertValue(result.candidates(), new TypeReference<List<Map<String, Object>>>() {}))
                .containsExactly(expected);
        assertThat(result.omitted()).isEmpty();
    }

    @Test
    void aRoundTripKeepsFiftyAttributesThirtyTagsAndFormulaLikeValues() throws Exception {
        List<Attribute> attributes = new ArrayList<>();
        for (int i = 0; i < 50; i++) {
            attributes.add(new Attribute("Ključ " + i, i % 2 == 0 ? "=A" + i + ";B,\\x" : "+38641 " + i));
        }
        List<String> tags =
                Stream.iterate(0, i -> i + 1).limit(30).map(i -> "značka-" + i).toList();
        VcardContact contact = new VcardContact(
                UUID.randomUUID(),
                java.time.Instant.parse("2026-11-15T10:00:00Z"),
                "Žan",
                "Čeh",
                "Vrstica 1\nVrstica 2; tretja, četrta",
                "zan@primer.si",
                "@386",
                "-Podjetje",
                "SI",
                attributes,
                tags);

        String written = VcardWriter.write(List.of(contact), "en");
        ImportCandidate read = VcardReader.read(written, "sl").candidates().get(0);

        assertThat(written).contains("UID:urn:uuid:" + contact.id()).contains("REV:");
        assertThat(read.firstName()).isEqualTo("Žan");
        assertThat(read.lastName()).isEqualTo("Čeh");
        assertThat(read.address()).isEqualTo("Vrstica 1\nVrstica 2; tretja, četrta");
        assertThat(read.email()).isEqualTo("zan@primer.si");
        assertThat(read.phone()).isEqualTo("@386");
        assertThat(read.company()).isEqualTo("-Podjetje");
        assertThat(read.countryText()).isEqualTo("SI");
        assertThat(read.attributes()).isEqualTo(attributes);
        assertThat(read.tags()).isEqualTo(tags);
    }

    @Test
    void theCountryNameIsInTheRequestedLanguage() {
        VcardContact contact =
                new VcardContact(null, null, "Ana", null, null, null, null, null, "AT", List.of(), List.of());

        assertThat(VcardWriter.write(List.of(contact), "sl")).contains("Avstrija");
        assertThat(VcardWriter.write(List.of(contact), "en")).contains("Austria");
    }

    @Test
    void textThatIsNotAVcardIsRejected() {
        assertThatThrownBy(() -> VcardReader.read("Ime;Priimek\nAna;Kos\n", "sl"))
                .isInstanceOf(VcardReader.Invalid.class)
                .hasMessage("NOT_VCF");
    }

    @Test
    void moreThanTenThousandCardsAreRejected() {
        String card = "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:A\r\nEND:VCARD\r\n";

        assertThatThrownBy(() -> VcardReader.read(card.repeat(VcardReader.MAX_CARDS + 1), "sl"))
                .isInstanceOf(VcardReader.Invalid.class)
                .hasMessage("TOO_MANY_ROWS");
    }

    private static VcardContact contactFull() throws IOException {
        ImportCandidate c = JSON.readValue(resource("contact-full.json"), ImportCandidate.class);
        return new VcardContact(
                null,
                null,
                c.firstName(),
                c.lastName(),
                c.address(),
                c.email(),
                c.phone(),
                c.company(),
                c.countryText(),
                c.attributes(),
                c.tags());
    }

    static String resource(String name) throws IOException {
        try (InputStream in = VcardMappingTest.class.getResourceAsStream("/vcard/" + name)) {
            if (in == null) {
                throw new IOException("ni vzorca " + name);
            }
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private static String normalize(String text) {
        return text.replace("\r\n", "\n");
    }
}
