import ExcelJS from 'exceljs';

// Branje prenesene datoteke `.xlsx` nazaj (010, workflow.md §2.9) z `exceljs` – drugo knjižnico, kot jo uporablja zaledje.

export interface ReadXlsx {
  sheetNames: string[];
  /** Vrstice prvega lista; prazna celica je `''`, prazni končni stolpci in vrstice so odrezani. */
  rows: string[][];
  /** Vrste celic po vrsticah: `string` (besedilo), `formula`, `number`, `empty`, `other`. */
  cellTypes: string[][];
  /** Ali ima vsaj ena celica formulo. */
  hasFormula: boolean;
}

function kindOf(cell: ExcelJS.Cell): string {
  switch (cell.type) {
    case ExcelJS.ValueType.Null:
    case ExcelJS.ValueType.Merge:
      return 'empty';
    case ExcelJS.ValueType.String:
    case ExcelJS.ValueType.SharedString:
      return 'string';
    case ExcelJS.ValueType.Formula:
      return 'formula';
    case ExcelJS.ValueType.Number:
      return 'number';
    default:
      return 'other';
  }
}

export async function readXlsx(path: string): Promise<ReadXlsx> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  const sheetNames = workbook.worksheets.map((sheet) => sheet.name);
  const sheet = workbook.worksheets[0];
  const rows: string[][] = [];
  const cellTypes: string[][] = [];
  if (sheet) {
    let width = 0;
    sheet.eachRow({ includeEmpty: true }, (row) => {
      const texts: string[] = [];
      const kinds: string[] = [];
      for (let column = 1; column <= sheet.columnCount; column += 1) {
        const cell = row.getCell(column);
        const kind = kindOf(cell);
        kinds.push(kind);
        texts.push(kind === 'empty' ? '' : cell.text);
      }
      while (texts.length > 0 && texts[texts.length - 1] === '') {
        texts.pop();
        kinds.pop();
      }
      width = Math.max(width, texts.length);
      rows.push(texts);
      cellTypes.push(kinds);
    });
    rows.forEach((row, index) => {
      while (row.length < width) {
        row.push('');
        cellTypes[index]?.push('empty');
      }
    });
    while (rows.length > 0 && rows[rows.length - 1]?.every((value) => value === '')) {
      rows.pop();
      cellTypes.pop();
    }
  }
  return {
    sheetNames,
    rows,
    cellTypes,
    hasFormula: cellTypes.some((row) => row.includes('formula')),
  };
}
