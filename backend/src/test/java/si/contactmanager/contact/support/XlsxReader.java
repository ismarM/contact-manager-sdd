package si.contactmanager.contact.support;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.List;
import org.dhatim.fastexcel.reader.Cell;
import org.dhatim.fastexcel.reader.CellType;
import org.dhatim.fastexcel.reader.ReadableWorkbook;
import org.dhatim.fastexcel.reader.Row;
import org.dhatim.fastexcel.reader.Sheet;

/**
 * Branje izvožene datoteke {@code .xlsx} nazaj (010, tasks T004): z drugo knjižnico (`fastexcel-reader`), kot jo zapiše
 * zaledje (`fastexcel`), da test ne potrjuje lastne napake. Prazna celica je {@code ""}; vrstice in stolpci brez
 * vrednosti na koncu so odrezani.
 */
public final class XlsxReader {

    private XlsxReader() {}

    /** Prebrana datoteka: imena listov in vrstice prvega lista. */
    public record Workbook(List<String> sheetNames, List<List<String>> rows, List<List<CellType>> cellTypes) {

        /** Ali ima vsaj ena celica formulo (FR-010-08). */
        public boolean hasFormula() {
            return cellTypes.stream().flatMap(List::stream).anyMatch(type -> type == CellType.FORMULA);
        }

        /** Ali so vse neprazne celice besedilo (FR-010-08). */
        public boolean allText() {
            return cellTypes.stream()
                    .flatMap(List::stream)
                    .allMatch(type -> type == CellType.STRING || type == CellType.EMPTY);
        }

        /** Število stolpcev glave (prva vrstica). */
        public int columns() {
            return rows.isEmpty() ? 0 : rows.get(0).size();
        }
    }

    public static Workbook read(byte[] file) {
        try (ReadableWorkbook workbook = new ReadableWorkbook(new ByteArrayInputStream(file))) {
            List<String> names = workbook.getSheets().map(Sheet::getName).toList();
            List<List<String>> rows = new ArrayList<>();
            List<List<CellType>> types = new ArrayList<>();
            if (!names.isEmpty()) {
                int width = 0;
                for (Row row : workbook.getFirstSheet().read()) {
                    List<String> texts = new ArrayList<>();
                    List<CellType> kinds = new ArrayList<>();
                    for (int column = 0; column < row.getPhysicalCellCount(); column++) {
                        Cell cell = row.hasCell(column) ? row.getCell(column) : null;
                        texts.add(cell == null || cell.getType() == CellType.EMPTY ? "" : cell.getText());
                        kinds.add(cell == null ? CellType.EMPTY : cell.getType());
                    }
                    while (!texts.isEmpty() && texts.get(texts.size() - 1).isEmpty()) {
                        texts.remove(texts.size() - 1);
                        kinds.remove(kinds.size() - 1);
                    }
                    width = Math.max(width, texts.size());
                    rows.add(texts);
                    types.add(kinds);
                }
                for (int i = 0; i < rows.size(); i++) {
                    while (rows.get(i).size() < width) {
                        rows.get(i).add("");
                        types.get(i).add(CellType.EMPTY);
                    }
                }
                while (!rows.isEmpty() && rows.get(rows.size() - 1).stream().allMatch(String::isEmpty)) {
                    rows.remove(rows.size() - 1);
                    types.remove(types.size() - 1);
                }
            }
            return new Workbook(names, rows, types);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
