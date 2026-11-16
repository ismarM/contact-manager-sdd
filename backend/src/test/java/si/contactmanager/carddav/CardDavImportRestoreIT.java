package si.contactmanager.carddav;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/**
 * Uskladitev 014 s 015: kontakt, ustvarjen z uvozom ({@code IMPORT}), ima zgodovino in je po izbrisu na seznamu
 * izbrisanih; obnova enega kontakta ({@code RESTORE}) ustvari spremembo v sledi, zato ga CardDAV {@code sync-collection}
 * vrne kot spremenjenega z novim {@code getetag} (FR-014-23, FR-015-22).
 */
@Tag("FR-014-23")
@Tag("FR-015-22")
class CardDavImportRestoreIT extends DavApiTest {

    @Test
    void anImportedDeletedAndRestoredContactReappearsInSyncCollection() throws Exception {
        Scenario s = scenario();
        Map<String, Object> request = new LinkedHashMap<>();
        request.put("source", "XLSX");
        request.put("contacts", List.of(input("Ana", "Kos"), input("Bor", "Zupan")));
        assertThat(post("/api/groups/" + s.group() + "/imports", s.token(Who.EDITOR), body(request))
                        .statusCode())
                .isEqualTo(201);
        UUID bor = jdbc.queryForObject(
                "select id from contact where group_id = ? and first_name = 'Bor'", UUID.class, s.group());
        Credentials viewer = appPassword(s.users().get(Who.VIEWER));

        assertThat(delete(contactPath(s.group(), bor) + "?version=0", s.token(Who.EDITOR))
                        .statusCode())
                .isEqualTo(204);
        String token =
                element(report(book(s.group()), viewer, syncCollection("")).body(), "d:sync-token");
        HttpResponse<String> deleted = get("/api/groups/" + s.group() + "/deleted-contacts", s.token(Who.VIEWER));
        assertThat(deleted.statusCode()).isEqualTo(200);
        assertThat(deleted.body()).contains(bor.toString());

        Map<String, Object> history = json(get(contactPath(s.group(), bor) + "/history", s.token(Who.VIEWER))
                .body());
        List<Map<String, Object>> items = asObjects(history.get("items"));
        assertThat(items).extracting(item -> item.get("action")).containsExactly("DELETE", "IMPORT");
        Map<String, Object> restore = new LinkedHashMap<>();
        restore.put("from", items.get(1).get("entryId"));
        restore.put("lastEntryId", asObject(history.get("contact")).get("lastEntryId"));
        HttpResponse<String> restored =
                post(contactPath(s.group(), bor) + "/restore", s.token(Who.EDITOR), body(restore));
        assertThat(restored.statusCode()).as(restored.body()).isEqualTo(201);

        HttpResponse<String> delta = report(book(s.group()), viewer, syncCollection(token));

        assertThat(delta.statusCode()).isEqualTo(207);
        assertThat(delta.body()).contains("<d:href>" + card(s.group(), bor) + "</d:href><d:propstat>");
        assertThat(delta.body()).contains("<d:getetag>");
        assertThat(element(delta.body(), "d:sync-token")).isNotEqualTo(token);
        assertThat(dav("GET", card(s.group(), bor), viewer, null, Map.of()).body())
                .contains("FN:Bor Zupan");
    }
}
