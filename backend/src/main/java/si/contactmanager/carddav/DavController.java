package si.contactmanager.carddav;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import si.contactmanager.account.AppPasswordAuthenticator.DavAccount;
import si.contactmanager.carddav.DavRepository.Book;
import si.contactmanager.carddav.DavRepository.Card;
import si.contactmanager.carddav.DavXml.Name;
import si.contactmanager.contact.ContactSnapshots;
import si.contactmanager.contact.ContactState;
import si.contactmanager.contact.VcardContact;
import si.contactmanager.contact.VcardWriter;

/**
 * Strežnik CardDAV samo za branje (FR-014-22 … -24, -27; contracts/carddav.md): en imenik za vsako skupino uporabnika
 * (tudi arhivirano), vizitke vCard 3.0 po FR-014-11, postopna sinhronizacija s {@code sync-collection}. Vrstni red
 * preverjanj: 401 (veriga {@code DavSecurityConfig}) → 404 (vir ni viden) → 403 (pisanje). Branje se ne beleži v sled.
 */
@Controller
class DavController {

    static final String ROOT = "/dav/";
    static final String PRINCIPAL = "/dav/principals/me/";
    static final String HOME = "/dav/addressbooks/";

    private static final String SYNC_PREFIX = "urn:contactmanager:sync:";

    private static final Set<String> WRITE =
            Set.of("PUT", "DELETE", "PROPPATCH", "MKCOL", "COPY", "MOVE", "LOCK", "UNLOCK", "POST", "PATCH");

    private static final Pattern BOOK = Pattern.compile("^/dav/addressbooks/([^/]+)/?$");
    private static final Pattern CARD = Pattern.compile("^/dav/addressbooks/([^/]+)/([^/]+)\\.vcf$");

    private static final DateTimeFormatter HTTP_DATE = DateTimeFormatter.RFC_1123_DATE_TIME.withZone(ZoneOffset.UTC);

    private sealed interface Resource permits Root, Principal, Home, BookResource, CardResource {}

    private record Root() implements Resource {}

    private record Principal() implements Resource {}

    private record Home() implements Resource {}

    private record BookResource(Book book) implements Resource {}

    private record CardResource(Book book, Card card) implements Resource {}

    /** Pot ni vidna (tuja ali neobstoječa skupina ali kontakt) ali je ni. */
    private static final class Hidden extends Exception {

        private static final long serialVersionUID = 1L;

        private final boolean creatable;

        Hidden(boolean creatable) {
            super("hidden");
            this.creatable = creatable;
        }
    }

    private final DavRepository repository;
    private final ContactSnapshots snapshots;

    DavController(DavRepository repository, ContactSnapshots snapshots) {
        this.repository = repository;
        this.snapshots = snapshots;
    }

    /** Odkrivanje strežnika (RFC 6764): brez prijave, samo preusmeritev. */
    @RequestMapping("/.well-known/carddav")
    void wellKnown(HttpServletResponse response) {
        response.setStatus(301);
        response.setHeader("Location", ROOT);
    }

    @RequestMapping({"/dav", "/dav/**"})
    void handle(@AuthenticationPrincipal DavAccount account, HttpServletRequest request, HttpServletResponse response)
            throws IOException {
        String method = request.getMethod().toUpperCase(Locale.ROOT);
        String path = path(request);
        Resource resource;
        try {
            resource = resolve(account, path);
        } catch (Hidden hidden) {
            if (WRITE.contains(method) && hidden.creatable) {
                forbidden(response);
            } else {
                response.setStatus(404);
            }
            return;
        }
        if (WRITE.contains(method)) {
            forbidden(response);
            return;
        }
        switch (method) {
            case "OPTIONS" -> options(response);
            case "GET", "HEAD" -> get(account, resource, request, response, method.equals("HEAD"));
            case "PROPFIND" -> propfind(account, resource, request, response);
            case "REPORT" -> report(account, resource, request, response);
            default -> {
                response.setStatus(405);
                response.setHeader("Allow", "OPTIONS, GET, HEAD, PROPFIND, REPORT");
            }
        }
    }

    private Resource resolve(DavAccount account, String path) throws Hidden {
        if (path.equals("/dav") || path.equals(ROOT)) {
            return new Root();
        }
        if (path.equals(PRINCIPAL) || path.equals("/dav/principals/me")) {
            return new Principal();
        }
        if (path.equals(HOME) || path.equals("/dav/addressbooks")) {
            return new Home();
        }
        Matcher card = CARD.matcher(path);
        if (card.matches()) {
            Book book = visibleBook(account, card.group(1)).orElseThrow(() -> new Hidden(false));
            Optional<UUID> id = uuid(card.group(2));
            if (id.isEmpty()) {
                throw new Hidden(true);
            }
            List<Card> cards = repository.cards(book.id(), Set.of(id.get()));
            if (cards.isEmpty()) {
                throw new Hidden(true);
            }
            return new CardResource(book, cards.get(0));
        }
        Matcher book = BOOK.matcher(path);
        if (book.matches()) {
            return new BookResource(visibleBook(account, book.group(1)).orElseThrow(() -> new Hidden(true)));
        }
        throw new Hidden(path.startsWith(HOME));
    }

    private Optional<Book> visibleBook(DavAccount account, String segment) {
        return uuid(segment).flatMap(id -> repository.book(account.userId(), id));
    }

    private static void options(HttpServletResponse response) {
        response.setStatus(200);
        response.setHeader("DAV", "1, 3, addressbook");
        response.setHeader("Allow", "OPTIONS, GET, HEAD, PROPFIND, REPORT");
    }

    private void get(
            DavAccount account,
            Resource resource,
            HttpServletRequest request,
            HttpServletResponse response,
            boolean head)
            throws IOException {
        if (!(resource instanceof CardResource card)) {
            write(response, 200, "text/plain; charset=utf-8", "Contact Manager CardDAV\n", head);
            return;
        }
        String etag = etag(card.card(), account);
        response.setHeader("ETag", etag);
        response.setHeader("Last-Modified", HTTP_DATE.format(card.card().updatedAt()));
        String match = request.getHeader("If-None-Match");
        if (match != null
                && (match.strip().equals("*")
                        || List.of(match.split(",")).stream().map(String::strip).anyMatch(etag::equals))) {
            response.setStatus(304);
            return;
        }
        String vcard = vcards(account, card.book(), List.of(card.card()))
                .get(card.card().id());
        write(response, 200, "text/vcard; charset=utf-8", vcard, head);
    }

    private void propfind(
            DavAccount account, Resource resource, HttpServletRequest request, HttpServletResponse response)
            throws IOException {
        String depth =
                Optional.ofNullable(request.getHeader("Depth")).orElse("0").strip();
        if (depth.equalsIgnoreCase("infinity")) {
            error(response, 403, "<d:propfind-finite-depth/>");
            return;
        }
        Document document;
        try {
            document = DavXml.parse(body(request));
        } catch (DavXml.Malformed e) {
            response.setStatus(400);
            return;
        }
        List<Name> requested = DavXml.requested(document);
        List<Resource> resources = new ArrayList<>();
        resources.add(resource);
        if (depth.equals("1")) {
            switch (resource) {
                case Root r -> {
                    resources.add(new Principal());
                    resources.add(new Home());
                }
                case Home h -> repository.books(account.userId()).forEach(b -> resources.add(new BookResource(b)));
                case BookResource b ->
                    repository.cards(b.book().id()).forEach(c -> resources.add(new CardResource(b.book(), c)));
                default -> {
                    // brez otrok
                }
            }
        }
        multistatus(response, responses(account, resources, requested));
    }

    private void report(DavAccount account, Resource resource, HttpServletRequest request, HttpServletResponse response)
            throws IOException {
        if (!(resource instanceof BookResource bookResource)) {
            error(response, 403, "<d:supported-report/>");
            return;
        }
        Book book = bookResource.book();
        Document document;
        try {
            document = DavXml.parse(body(request));
        } catch (DavXml.Malformed e) {
            response.setStatus(400);
            return;
        }
        if (document == null) {
            response.setStatus(400);
            return;
        }
        Element root = document.getDocumentElement();
        List<Name> requested = DavXml.requested(document);
        String kind = root.getNamespaceURI() + root.getLocalName();
        if (kind.equals(DavXml.CARD + "addressbook-multiget")) {
            multiget(account, book, DavXml.texts(root, DavXml.DAV, "href"), requested, response);
        } else if (kind.equals(DavXml.CARD + "addressbook-query")) {
            List<Resource> cards = new ArrayList<>();
            repository.cards(book.id()).forEach(c -> cards.add(new CardResource(book, c)));
            multistatus(response, responses(account, cards, requested));
        } else if (kind.equals(DavXml.DAV + "sync-collection")) {
            Element token = DavXml.first(root, DavXml.DAV, "sync-token");
            sync(account, book, token == null ? "" : token.getTextContent().strip(), requested, response);
        } else {
            error(response, 403, "<d:supported-report/>");
        }
    }

    private void multiget(
            DavAccount account, Book book, List<String> hrefs, List<Name> requested, HttpServletResponse response)
            throws IOException {
        Map<String, UUID> wanted = new LinkedHashMap<>();
        StringBuilder missing = new StringBuilder();
        for (String href : hrefs) {
            Matcher card = CARD.matcher(hrefPath(href));
            Optional<UUID> id =
                    card.matches() && card.group(1).equalsIgnoreCase(book.id().toString())
                            ? uuid(card.group(2))
                            : Optional.empty();
            if (id.isPresent()) {
                wanted.put(href, id.get());
            } else {
                missing.append(notFound(href));
            }
        }
        List<Card> cards = repository.cards(book.id(), new LinkedHashSet<>(wanted.values()));
        Set<UUID> found = new LinkedHashSet<>();
        List<Resource> resources = new ArrayList<>();
        for (Card card : cards) {
            found.add(card.id());
            resources.add(new CardResource(book, card));
        }
        for (Map.Entry<String, UUID> entry : wanted.entrySet()) {
            if (!found.contains(entry.getValue())) {
                missing.append(notFound(entry.getKey()));
            }
        }
        multistatus(response, responses(account, resources, requested) + missing);
    }

    private void sync(DavAccount account, Book book, String token, List<Name> requested, HttpServletResponse response)
            throws IOException {
        List<Card> cards;
        StringBuilder removed = new StringBuilder();
        if (token.isEmpty()) {
            cards = repository.cards(book.id());
        } else {
            Optional<Long> seq = parseToken(token, account.language());
            if (seq.isEmpty() || seq.get() > book.lastSeq()) {
                error(response, 403, "<d:valid-sync-token/>");
                return;
            }
            Set<UUID> changed = repository.changedSince(book.id(), seq.get());
            cards = repository.cards(book.id(), changed);
            Set<UUID> present = new LinkedHashSet<>();
            cards.forEach(c -> present.add(c.id()));
            for (UUID id : changed) {
                if (!present.contains(id)) {
                    removed.append(notFound(cardHref(book.id(), id)));
                }
            }
        }
        List<Resource> resources = new ArrayList<>();
        cards.forEach(c -> resources.add(new CardResource(book, c)));
        String body =
                responses(account, resources, requested == null ? List.of(new Name(DavXml.DAV, "getetag")) : requested)
                        + removed
                        + "<d:sync-token>" + DavXml.escape(syncToken(book, account)) + "</d:sync-token>";
        multistatus(response, body);
    }

    private String responses(DavAccount account, List<Resource> resources, List<Name> requested) {
        List<Card> needData = new ArrayList<>();
        Book dataBook = null;
        boolean wantsData = requested != null
                && requested.stream()
                        .anyMatch(n ->
                                n.namespace().equals(DavXml.CARD) && n.local().equals("address-data"));
        if (wantsData) {
            for (Resource resource : resources) {
                if (resource instanceof CardResource card) {
                    needData.add(card.card());
                    dataBook = card.book();
                }
            }
        }
        Map<UUID, String> data = dataBook == null ? Map.of() : vcards(account, dataBook, needData);
        StringBuilder out = new StringBuilder();
        for (Resource resource : resources) {
            List<Name> names = requested == null ? defaults(resource) : requested;
            StringBuilder ok = new StringBuilder();
            StringBuilder missing = new StringBuilder();
            for (Name name : names) {
                String value = property(account, resource, name, data);
                if (value == null) {
                    missing.append(empty(name));
                } else {
                    ok.append(value);
                }
            }
            out.append("<d:response><d:href>")
                    .append(DavXml.escape(href(resource)))
                    .append("</d:href>");
            if (!ok.isEmpty()) {
                out.append("<d:propstat><d:prop>").append(ok).append("</d:prop>");
                out.append("<d:status>HTTP/1.1 200 OK</d:status></d:propstat>");
            }
            if (!missing.isEmpty()) {
                out.append("<d:propstat><d:prop>").append(missing).append("</d:prop>");
                out.append("<d:status>HTTP/1.1 404 Not Found</d:status></d:propstat>");
            }
            out.append("</d:response>");
        }
        return out.toString();
    }

    private static List<Name> defaults(Resource resource) {
        List<Name> names = new ArrayList<>(List.of(
                new Name(DavXml.DAV, "resourcetype"),
                new Name(DavXml.DAV, "displayname"),
                new Name(DavXml.DAV, "current-user-principal")));
        switch (resource) {
            case Principal p -> {
                names.add(new Name(DavXml.DAV, "principal-URL"));
                names.add(new Name(DavXml.CARD, "addressbook-home-set"));
            }
            case BookResource b -> {
                names.add(new Name(DavXml.CS, "getctag"));
                names.add(new Name(DavXml.DAV, "sync-token"));
                names.add(new Name(DavXml.DAV, "current-user-privilege-set"));
                names.add(new Name(DavXml.DAV, "supported-report-set"));
                names.add(new Name(DavXml.CARD, "supported-address-data"));
            }
            case CardResource c -> {
                names.clear();
                names.add(new Name(DavXml.DAV, "resourcetype"));
                names.add(new Name(DavXml.DAV, "getetag"));
                names.add(new Name(DavXml.DAV, "getcontenttype"));
                names.add(new Name(DavXml.DAV, "getlastmodified"));
            }
            default -> {
                // koren in dom
            }
        }
        return names;
    }

    /** Vrednost lastnosti kot XML ali {@code null}, če je vir nima. */
    private String property(DavAccount account, Resource resource, Name name, Map<UUID, String> data) {
        String key = name.namespace() + name.local();
        switch (key) {
            case DavXml.DAV + "current-user-principal":
                return "<d:current-user-principal><d:href>" + PRINCIPAL + "</d:href></d:current-user-principal>";
            case DavXml.DAV + "principal-URL":
                return resource instanceof Principal
                        ? "<d:principal-URL><d:href>" + PRINCIPAL + "</d:href></d:principal-URL>"
                        : null;
            case DavXml.CARD + "addressbook-home-set":
                return resource instanceof Principal || resource instanceof Root
                        ? "<card:addressbook-home-set><d:href>" + HOME + "</d:href></card:addressbook-home-set>"
                        : null;
            case DavXml.DAV + "resourcetype":
                return switch (resource) {
                    case BookResource b -> "<d:resourcetype><d:collection/><card:addressbook/></d:resourcetype>";
                    case Principal p -> "<d:resourcetype><d:principal/></d:resourcetype>";
                    case CardResource c -> "<d:resourcetype/>";
                    default -> "<d:resourcetype><d:collection/></d:resourcetype>";
                };
            case DavXml.DAV + "displayname":
                return switch (resource) {
                    case BookResource b ->
                        "<d:displayname>" + DavXml.escape(b.book().title()) + "</d:displayname>";
                    case Principal p -> "<d:displayname>" + DavXml.escape(account.email()) + "</d:displayname>";
                    case CardResource c -> null;
                    default -> "<d:displayname>Contact Manager</d:displayname>";
                };
            case DavXml.CS + "getctag":
                return resource instanceof BookResource b
                        ? "<cs:getctag>" + ctag(b.book(), account) + "</cs:getctag>"
                        : null;
            case DavXml.DAV + "sync-token":
                return resource instanceof BookResource b
                        ? "<d:sync-token>" + DavXml.escape(syncToken(b.book(), account)) + "</d:sync-token>"
                        : null;
            case DavXml.DAV + "current-user-privilege-set":
                return "<d:current-user-privilege-set><d:privilege><d:read/></d:privilege>"
                        + "<d:privilege><d:read-current-user-privilege-set/></d:privilege>"
                        + "</d:current-user-privilege-set>";
            case DavXml.DAV + "supported-report-set":
                return resource instanceof BookResource
                        ? "<d:supported-report-set>"
                                + "<d:supported-report><d:report><d:sync-collection/></d:report></d:supported-report>"
                                + "<d:supported-report><d:report><card:addressbook-multiget/></d:report></d:supported-report>"
                                + "<d:supported-report><d:report><card:addressbook-query/></d:report></d:supported-report>"
                                + "</d:supported-report-set>"
                        : null;
            case DavXml.CARD + "supported-address-data":
                return resource instanceof BookResource
                        ? "<card:supported-address-data><card:address-data-type content-type=\"text/vcard\""
                                + " version=\"3.0\"/></card:supported-address-data>"
                        : null;
            case DavXml.DAV + "getetag":
                return resource instanceof CardResource c
                        ? "<d:getetag>" + DavXml.escape(etag(c.card(), account)) + "</d:getetag>"
                        : null;
            case DavXml.DAV + "getcontenttype":
                return resource instanceof CardResource
                        ? "<d:getcontenttype>text/vcard; charset=utf-8</d:getcontenttype>"
                        : null;
            case DavXml.DAV + "getlastmodified":
                return resource instanceof CardResource c
                        ? "<d:getlastmodified>" + HTTP_DATE.format(c.card().updatedAt()) + "</d:getlastmodified>"
                        : null;
            case DavXml.CARD + "address-data":
                return resource instanceof CardResource c
                                && data.containsKey(c.card().id())
                        ? "<card:address-data>"
                                + DavXml.escape(data.get(c.card().id())) + "</card:address-data>"
                        : null;
            default:
                return null;
        }
    }

    /** Vizitke po FR-014-11 v jeziku uporabnika (ime države v {@code ADR}). */
    private Map<UUID, String> vcards(DavAccount account, Book book, List<Card> cards) {
        List<UUID> ids = cards.stream().map(Card::id).toList();
        Map<UUID, ContactState> states = snapshots.load(book.id(), ids);
        Map<UUID, String> result = new LinkedHashMap<>();
        for (UUID id : ids) {
            ContactState s = states.get(id);
            if (s != null) {
                VcardContact contact = new VcardContact(
                        id,
                        s.updatedAt(),
                        s.firstName(),
                        s.lastName(),
                        s.address(),
                        s.email(),
                        s.phone(),
                        s.company(),
                        s.country(),
                        s.attributes(),
                        s.tags());
                result.put(id, VcardWriter.write(List.of(contact), account.language()));
            }
        }
        return result;
    }

    /** ETag vključuje jezik, ker je ime države v vizitki odvisno od njega (research R-08). */
    static String etag(Card card, DavAccount account) {
        return "\"" + card.version() + "-" + card.updatedAt().toEpochMilli() + "-" + account.language() + "\"";
    }

    /** {@code getctag}: jezik, zadnja številka sledi in verzija skupine (sprememba naslova). */
    static String ctag(Book book, DavAccount account) {
        return account.language() + "-" + book.lastSeq() + "-" + book.version();
    }

    static String syncToken(Book book, DavAccount account) {
        return SYNC_PREFIX + account.language() + ":" + book.lastSeq();
    }

    static Optional<Long> parseToken(String token, String language) {
        String prefix = SYNC_PREFIX + language + ":";
        if (!token.startsWith(prefix)) {
            return Optional.empty();
        }
        try {
            long seq = Long.parseLong(token.substring(prefix.length()));
            return seq < 0 ? Optional.empty() : Optional.of(seq);
        } catch (NumberFormatException e) {
            return Optional.empty();
        }
    }

    private static String href(Resource resource) {
        return switch (resource) {
            case Root r -> ROOT;
            case Principal p -> PRINCIPAL;
            case Home h -> HOME;
            case BookResource b -> HOME + b.book().id() + "/";
            case CardResource c -> cardHref(c.book().id(), c.card().id());
        };
    }

    private static String cardHref(UUID book, UUID card) {
        return HOME + book + "/" + card + ".vcf";
    }

    private static String notFound(String href) {
        return "<d:response><d:href>" + DavXml.escape(href) + "</d:href><d:status>HTTP/1.1 404 Not Found</d:status>"
                + "</d:response>";
    }

    private static String empty(Name name) {
        return switch (name.namespace()) {
            case DavXml.DAV -> "<d:" + name.local() + "/>";
            case DavXml.CARD -> "<card:" + name.local() + "/>";
            case DavXml.CS -> "<cs:" + name.local() + "/>";
            default -> "<x:" + name.local() + " xmlns:x=\"" + DavXml.escape(name.namespace()) + "\"/>";
        };
    }

    private static void multistatus(HttpServletResponse response, String responses) throws IOException {
        String xml = "<?xml version=\"1.0\" encoding=\"utf-8\"?>"
                + "<d:multistatus xmlns:d=\"DAV:\" xmlns:card=\"" + DavXml.CARD + "\" xmlns:cs=\"" + DavXml.CS + "\">"
                + responses + "</d:multistatus>";
        write(response, 207, "application/xml; charset=utf-8", xml, false);
    }

    private static void forbidden(HttpServletResponse response) throws IOException {
        error(response, 403, "<d:need-privileges/>");
    }

    private static void error(HttpServletResponse response, int status, String condition) throws IOException {
        String xml = "<?xml version=\"1.0\" encoding=\"utf-8\"?><d:error xmlns:d=\"DAV:\">" + condition + "</d:error>";
        write(response, status, "application/xml; charset=utf-8", xml, false);
    }

    private static void write(HttpServletResponse response, int status, String type, String body, boolean head)
            throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        response.setStatus(status);
        response.setContentType(type);
        response.setContentLength(bytes.length);
        response.setHeader("Cache-Control", "no-store");
        if (!head) {
            response.getOutputStream().write(bytes);
        }
    }

    private static byte[] body(HttpServletRequest request) throws IOException {
        try (InputStream in = request.getInputStream()) {
            byte[] bytes = in.readNBytes(DavXml.MAX_BODY + 1);
            if (bytes.length > DavXml.MAX_BODY) {
                throw new IOException("telo je preveliko");
            }
            return bytes;
        }
    }

    private static String path(HttpServletRequest request) {
        String uri = request.getRequestURI().substring(request.getContextPath().length());
        return URLDecoder.decode(uri.replace("+", "%2B"), StandardCharsets.UTF_8);
    }

    private static String hrefPath(String href) {
        try {
            String path = URI.create(href.strip()).getPath();
            return path == null ? "" : path;
        } catch (IllegalArgumentException e) {
            return "";
        }
    }

    private static Optional<UUID> uuid(String text) {
        try {
            return Optional.of(UUID.fromString(text));
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
    }
}
