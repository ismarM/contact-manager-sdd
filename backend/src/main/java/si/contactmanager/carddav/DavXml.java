package si.contactmanager.carddav;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.xml.sax.SAXException;

/**
 * Varno branje teles WebDAV in pisanje odgovorov {@code 207 Multi-Status} (014 research R-08): brez DTD, zunanjih
 * entitet in XInclude (XXE); telo do {@value #MAX_BODY} bajtov.
 */
final class DavXml {

    static final String DAV = "DAV:";

    static final String CARD = "urn:ietf:params:xml:ns:carddav";

    static final String CS = "http://calendarserver.org/ns/";

    static final int MAX_BODY = 1024 * 1024;

    /** Ime lastnosti: imenski prostor in lokalno ime. */
    record Name(String namespace, String local) {}

    /** Neberljivo ali nevarno telo. */
    static final class Malformed extends Exception {

        private static final long serialVersionUID = 1L;

        Malformed() {
            super("malformed");
        }
    }

    private DavXml() {}

    /** Dokument ali {@code null} za prazno telo. */
    static Document parse(byte[] body) throws Malformed {
        if (body.length == 0) {
            return null;
        }
        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
            factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            factory.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
            factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
            factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
            factory.setXIncludeAware(false);
            factory.setExpandEntityReferences(false);
            DocumentBuilder builder = factory.newDocumentBuilder();
            builder.setErrorHandler(null);
            return builder.parse(new ByteArrayInputStream(body));
        } catch (ParserConfigurationException | SAXException | IOException e) {
            throw new Malformed();
        }
    }

    /** Zahtevane lastnosti iz {@code <prop>}; {@code null} pomeni {@code allprop} (ali prazno telo). */
    static List<Name> requested(Document document) {
        if (document == null) {
            return null;
        }
        Element prop = first(document.getDocumentElement(), DAV, "prop");
        if (prop == null) {
            return null;
        }
        List<Name> names = new ArrayList<>();
        for (Node child = prop.getFirstChild(); child != null; child = child.getNextSibling()) {
            if (child instanceof Element element) {
                names.add(new Name(nonNull(element.getNamespaceURI()), element.getLocalName()));
            }
        }
        return names;
    }

    static List<String> texts(Element root, String namespace, String local) {
        List<String> values = new ArrayList<>();
        var nodes = root.getElementsByTagNameNS(namespace, local);
        for (int i = 0; i < nodes.getLength(); i++) {
            values.add(nodes.item(i).getTextContent().strip());
        }
        return values;
    }

    static Element first(Element root, String namespace, String local) {
        if (root == null) {
            return null;
        }
        var nodes = root.getElementsByTagNameNS(namespace, local);
        return nodes.getLength() == 0 ? null : (Element) nodes.item(0);
    }

    static String escape(String text) {
        StringBuilder out = new StringBuilder(text.length());
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            switch (c) {
                case '&' -> out.append("&amp;");
                case '<' -> out.append("&lt;");
                case '>' -> out.append("&gt;");
                case '"' -> out.append("&quot;");
                case '\r' -> out.append("&#13;");
                default -> out.append(c);
            }
        }
        return out.toString();
    }

    private static String nonNull(String value) {
        return value == null ? "" : value;
    }
}
