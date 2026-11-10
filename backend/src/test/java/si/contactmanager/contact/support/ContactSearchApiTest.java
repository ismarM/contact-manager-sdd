package si.contactmanager.contact.support;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.UUID;

/** Osnova testov iskanja: zahtevek seznama z URL kodiranimi parametri kot bralec (najnižja vloga, 008). */
public abstract class ContactSearchApiTest extends ContactApiTest {

    protected HttpResponse<String> search(Scenario s, Who who, String... pairs) throws Exception {
        return get(ContactSearchClient.listPath(s.group()) + ContactSearchClient.query(pairs), s.token(who));
    }

    protected HttpResponse<String> search(Scenario s, String... pairs) throws Exception {
        return search(s, Who.VIEWER, pairs);
    }

    /** Prikazna imena zadetkov; zahtevek mora uspeti. */
    protected List<String> found(Scenario s, String... pairs) throws Exception {
        HttpResponse<String> response = search(s, pairs);
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        return ContactSearchClient.names(response.body());
    }

    protected long totalFor(Scenario s, String... pairs) throws Exception {
        HttpResponse<String> response = search(s, pairs);
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        return ContactSearchClient.total(response.body());
    }

    protected UUID add(Scenario s, String first, String last, String email, String phone, String address) {
        return contacts.insert(s.group(), s.id(Who.OWNER), first, last, email, phone, address);
    }

    protected UUID add(Scenario s, String first, String last) {
        return add(s, first, last, null, null, null);
    }
}
