package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import si.contactmanager.contact.support.ExportApiTest;
import si.contactmanager.contact.support.XlsxReader.Workbook;

/**
 * Izvoz v arhivirani skupini (FR-010-16): vsi člani, tudi v trajno arhivirani skupini, dobijo datoteko z enako
 * vsebino kot v nearhivirani skupini; nikoli {@code 409 GROUP_ARCHIVED}.
 */
@Tag("FR-010-16")
class ExportArchivedIT extends ExportApiTest {

    private List<UUID> fill(Scenario s) {
        UUID a = contacts.insert(s.group(), s.id(Who.OWNER), "Ana", "Avsec", "ana@primer.si", "041 111 111", null);
        contacts.addAttribute(a, 0, "podjetje", "FERI");
        contacts.addTag(a, 0, "vip");
        UUID b = contacts.insert(s.group(), s.id(Who.OWNER), "Bor", "Bizjak");
        return List.of(a, b);
    }

    private Workbook baseline(Scenario s, Who who, List<UUID> ids) throws Exception {
        HttpResponse<byte[]> response = export(s.token(who), s.group(), exportBody(ids, "sl"));
        assertThat(response.statusCode()).as("nearhivirana skupina, " + who).isEqualTo(200);
        return workbook(response);
    }

    @ParameterizedTest(name = "arhivirana skupina, {0}")
    @EnumSource(
            value = Who.class,
            names = {"VIEWER", "EDITOR", "ADMIN", "OWNER"})
    void anArchivedGroupExportsTheSameFileForEveryRole(Who who) throws Exception {
        Scenario s = scenario();
        List<UUID> ids = fill(s);
        Workbook active = baseline(s, who, ids);
        groups.archive(s.group());
        Snapshot before = readOnlySnapshot(s.group());

        HttpResponse<byte[]> response = export(s.token(who), s.group(), exportBody(ids, "sl"));

        assertThat(response.statusCode()).as(text(response)).isEqualTo(200);
        assertThat(workbook(response).rows()).isEqualTo(active.rows());
        assertThat(active.rows()).hasSize(3);
        assertUnchanged(before, readOnlySnapshot(s.group()));
    }

    @Test
    void aPermanentlyArchivedGroupExportsToo() throws Exception {
        Scenario s = scenario();
        List<UUID> ids = fill(s);
        Workbook active = baseline(s, Who.VIEWER, ids);
        groups.makePermanentlyArchived(s.group());

        // trajno arhivirana skupina nima več lastnika (kot v BulkArchivedIT, D-76)
        for (Who who : List.of(Who.VIEWER, Who.EDITOR, Who.ADMIN)) {
            HttpResponse<byte[]> response = export(s.token(who), s.group(), exportBody(ids, "sl"));
            assertThat(response.statusCode()).as(who + " " + text(response)).isEqualTo(200);
            assertThat(workbook(response).rows()).isEqualTo(active.rows());
        }
    }
}
