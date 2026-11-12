package si.contactmanager.contact;

import java.io.IOException;
import java.io.OutputStream;
import java.util.List;
import java.util.Map;
import org.dhatim.fastexcel.Workbook;
import org.dhatim.fastexcel.Worksheet;

/**
 * Zapis datoteke {@code .xlsx} neposredno v tok (010, research R-01, R-07; D-89): en list, vrstica 1 je glava, vsaka
 * vrednost je besedilo prek {@link CellText} (nikoli formula), stolpci imajo slog besedila {@code @}.
 */
final class ExportWriter {

    private ExportWriter() {}

    /** Stolpec atributa: normaliziran ključ in zapis ključa za glavo. */
    record Column(String keyNorm, String header) {}

    static void write(OutputStream out, String language, List<Column> columns, List<ExportRow> rows)
            throws IOException {
        ExportLabels.Headers headers = ExportLabels.headers(language);
        int leading = headers.leading().size();
        int width = leading + columns.size() + 1;
        try (Workbook workbook = new Workbook(out, "Contact Manager", "1.0")) {
            Worksheet sheet = workbook.newWorksheet(ExportLabels.sheetName(language));
            for (int column = 0; column < width; column++) {
                sheet.style(column).format("@").wrapText(column == 2).set();
            }
            int column = 0;
            for (String header : headers.leading()) {
                put(sheet, 0, column++, header);
            }
            for (Column attribute : columns) {
                put(sheet, 0, column++, attribute.header());
            }
            put(sheet, 0, column, headers.tags());
            int row = 1;
            for (ExportRow contact : rows) {
                put(sheet, row, 0, contact.firstName());
                put(sheet, row, 1, contact.lastName());
                put(sheet, row, 2, contact.address());
                put(sheet, row, 3, contact.email());
                put(sheet, row, 4, contact.phone());
                int index = leading;
                Map<String, String> attributes = contact.attributes();
                for (Column attribute : columns) {
                    put(sheet, row, index++, attributes.get(attribute.keyNorm()));
                }
                put(sheet, row, index, String.join(", ", contact.tags()));
                row++;
            }
            sheet.finish();
        }
    }

    private static void put(Worksheet sheet, int row, int column, String value) {
        CellText.of(value).ifPresent(text -> sheet.value(row, column, text));
    }
}
