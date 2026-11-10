package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.contact.support.ContactSearchApiTest;
import si.contactmanager.contact.support.ContactSearchClient;

/** Iskanje, filtri in razvrščanje v arhivirani in trajno arhivirani skupini (FR-008-15): enako kot v nearhivirani. */
@Tag("FR-008-15")
class ContactSearchArchivedIT extends ContactSearchApiTest {

    private static final String[][] QUERIES = {
        {},
        {"q", "novak"},
        {"q", "ZUPANC"},
        {"f", "x.kompetenca:web"},
        {"tag", "vip"},
        {"q", "feri", "f", "phone:041", "tag", "vip"},
        {"sort", "lastName", "dir", "desc"},
        {"sort", "x.kompetenca", "dir", "asc"},
        {"sort", "email", "dir", "desc", "size", "50", "page", "0"}
    };

    private void data(Scenario s) {
        UUID a = add(s, "Janez", "Novak", "janez@feri.si", "041 123 456", null);
        contacts.addAttribute(a, 0, "kompetenca", "web dev");
        contacts.addTags(a, "vip");
        UUID b = add(s, "Mojca", "Zupančič", "mojca@primer.si", "031 111 222", null);
        contacts.addTags(b, "vip", "konferenca2025");
        add(s, "Čeh", "Čeh", null, null, null);
    }

    private List<String> answers(Scenario s, Who who) throws Exception {
        List<String> answers = new java.util.ArrayList<>();
        for (String[] query : QUERIES) {
            HttpResponse<String> response = search(s, who, query);
            assertThat(response.statusCode())
                    .as(who + " " + String.join("&", query))
                    .isEqualTo(200);
            answers.add(ContactSearchClient.names(response.body()) + "/" + ContactSearchClient.total(response.body()));
        }
        return answers;
    }

    @Test
    void archivedGroupGivesTheSameResultsForEveryRoleAsBeforeArchiving() throws Exception {
        Scenario s = scenario();
        data(s);
        List<String> before = answers(s, Who.VIEWER);
        assertThat(before).contains("[Janez Novak]/1");

        groups.archive(s.group());

        for (Who who : new Who[] {Who.VIEWER, Who.EDITOR, Who.ADMIN, Who.OWNER}) {
            assertThat(answers(s, who)).as(who.name()).isEqualTo(before);
        }
        HttpResponse<String> options = get(ContactSearchClient.filtersPath(s.group()), s.token(Who.VIEWER));
        assertThat(options.statusCode()).isEqualTo(200);
        assertThat(ContactSearchClient.options(options.body(), "keys")).containsExactly("kompetenca");
        assertThat(ContactSearchClient.options(options.body(), "tags")).containsExactly("konferenca2025", "vip");
    }

    @Test
    void permanentlyArchivedGroupGivesTheSameResults() throws Exception {
        Scenario s = scenario();
        data(s);
        List<String> before = answers(s, Who.VIEWER);
        assertThat(before).contains("[Janez Novak]/1");

        groups.makePermanentlyArchived(s.group());

        // v trajno arhivirani skupini ostane član (npr. lastnik se je izbrisal); bralec in drugi ostanejo
        assertThat(answers(s, Who.VIEWER)).isEqualTo(before);
        assertThat(answers(s, Who.EDITOR)).isEqualTo(before);
    }

    @Test
    void unarchivingKeepsTheResultsIdentical() throws Exception {
        Scenario s = scenario();
        data(s);
        List<String> before = answers(s, Who.VIEWER);
        assertThat(before).contains("[Janez Novak]/1");
        groups.archive(s.group());
        answers(s, Who.VIEWER);

        jdbc.update("update contact_group set archived_at = null where id = ?", s.group());

        assertThat(answers(s, Who.VIEWER)).isEqualTo(before);
    }
}
