package si.contactmanager.contact;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.stream.Stream;
import org.dhatim.fastexcel.reader.Cell;
import org.dhatim.fastexcel.reader.ReadableWorkbook;
import org.dhatim.fastexcel.reader.ReadingOptions;
import org.dhatim.fastexcel.reader.Row;
import org.dhatim.fastexcel.reader.Sheet;

/**
 * Branje prvega lista {@code .xlsx} za uvoz (FR-014-02, -06, -08; research R-01): glava v vrstici 1, stolpci brez glave
 * in prazne vrstice se preskočijo; celica je besedilo, kot ga hrani datoteka (shranjena vrednost formule, števila brez
 * eksponenta, datum ISO); en vodilni {@code '} pred {@code = + - @}, tabulatorjem ali CR se odstrani.
 */
final class XlsxSheetReader {

    /** Največ vrstic podatkov (FR-014-08). */
    static final int MAX_ROWS = 10_000;

    /** Največ stolpcev (Excel, enako kot izvoz 010). */
    static final int MAX_COLUMNS = ExportService.MAX_COLUMNS;

    record SheetRow(int rowNumber, List<String> cells) {}

    record Sheet1(int sheetCount, List<String> headers, List<SheetRow> rows) {}

    private XlsxSheetReader() {}

    static Sheet1 read(byte[] file) throws XlsxGuard.Rejected {
        XlsxGuard.check(file);
        try (ReadableWorkbook workbook =
                new ReadableWorkbook(new ByteArrayInputStream(file), new ReadingOptions(true, false))) {
            List<Sheet> sheets = workbook.getSheets().toList();
            if (sheets.isEmpty()) {
                throw new XlsxGuard.Rejected("NOT_XLSX");
            }
            try (Stream<Row> stream = sheets.get(0).openStream()) {
                return rows(sheets.size(), stream.iterator());
            }
        } catch (IOException | RuntimeException e) {
            throw new XlsxGuard.Rejected("NOT_XLSX");
        }
    }

    private static Sheet1 rows(int sheetCount, Iterator<Row> iterator) throws XlsxGuard.Rejected {
        if (!iterator.hasNext()) {
            throw new XlsxGuard.Rejected("NO_HEADER");
        }
        Row first = iterator.next();
        if (first.getRowNum() != 1) {
            throw new XlsxGuard.Rejected("NO_HEADER");
        }
        if (first.getCellCount() > MAX_COLUMNS) {
            throw new XlsxGuard.Rejected("TOO_MANY_COLUMNS");
        }
        List<Integer> columns = new ArrayList<>();
        List<String> headers = new ArrayList<>();
        for (int i = 0; i < first.getCellCount(); i++) {
            String header = text(first.getCell(i)).strip();
            if (!header.isEmpty()) {
                columns.add(i);
                headers.add(header);
            }
        }
        if (headers.isEmpty()) {
            throw new XlsxGuard.Rejected("NO_HEADER");
        }
        List<SheetRow> rows = new ArrayList<>();
        while (iterator.hasNext()) {
            Row row = iterator.next();
            List<String> cells = new ArrayList<>(columns.size());
            boolean empty = true;
            for (int column : columns) {
                String value = column < row.getCellCount() ? unprotect(text(row.getCell(column))) : "";
                empty &= value.isBlank();
                cells.add(value);
            }
            if (empty) {
                continue;
            }
            if (rows.size() == MAX_ROWS) {
                throw new XlsxGuard.Rejected("TOO_MANY_ROWS");
            }
            rows.add(new SheetRow(row.getRowNum(), List.copyOf(cells)));
        }
        return new Sheet1(sheetCount, List.copyOf(headers), List.copyOf(rows));
    }

    /** FR-014-06: obratno od zaščite {@code CellText} pri izvozu 010. */
    static String unprotect(String value) {
        if (value.length() >= 2 && value.charAt(0) == '\'') {
            switch (value.charAt(1)) {
                case '=', '+', '-', '@', '\t', '\r' -> {
                    return value.substring(1);
                }
                default -> {
                    // ostane dobesedno
                }
            }
        }
        return value;
    }

    private static String text(Cell cell) {
        if (cell == null) {
            return "";
        }
        return switch (cell.getType()) {
            case STRING -> nonNull(cell.asString());
            case NUMBER -> number(cell);
            case BOOLEAN -> Boolean.TRUE.equals(cell.asBoolean()) ? "TRUE" : "FALSE";
            case FORMULA, ERROR -> nonNull(cell.getRawValue());
            default -> "";
        };
    }

    private static String number(Cell cell) {
        String format = cell.getDataFormatString();
        if (format != null && isDateFormat(format)) {
            LocalDateTime date = cell.asDate();
            if (date != null) {
                return date.toLocalTime().equals(java.time.LocalTime.MIDNIGHT)
                        ? date.toLocalDate().toString()
                        : date.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"));
            }
        }
        BigDecimal value = cell.asNumber();
        return value == null ? "" : value.stripTrailingZeros().toPlainString();
    }

    private static boolean isDateFormat(String format) {
        String bare = format.replaceAll("\"[^\"]*\"|\\[[^]]*]", "").toLowerCase(Locale.ROOT);
        return !bare.equals("general") && bare.matches(".*[dmy].*") && !bare.contains("0");
    }

    private static String nonNull(String value) {
        return value == null ? "" : value;
    }
}
