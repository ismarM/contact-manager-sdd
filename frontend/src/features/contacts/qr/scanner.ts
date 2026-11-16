import { readMecard, isMecard } from './mecard';
import { readVcards } from './vcardRead';
import type { CardCandidate, CardLanguage } from './vcardTypes';

// Branje kode QR v brskalniku (FR-014-17 … -20; research R-07): izvorni `BarcodeDetector`, sicer leno naložen polyfill
// z lokalno gostovanim `zxing_reader.wasm` (brez CDN, konstitucija VI). Slike ne zapustijo naprave.

export interface QrDetector {
  detect(source: ImageBitmapSource): Promise<{ rawValue: string }[]>;
}

interface NativeDetectorClass {
  new (options: { formats: string[] }): QrDetector;
  getSupportedFormats(): Promise<string[]>;
}

export async function createDetector(): Promise<QrDetector> {
  const native = (globalThis as { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector;
  if (native) {
    try {
      if ((await native.getSupportedFormats()).includes('qr_code')) {
        return new native({ formats: ['qr_code'] });
      }
    } catch {
      // izvorni detektor ni uporaben – polyfill spodaj
    }
  }
  const [{ BarcodeDetector, setZXingModuleOverrides }, { default: wasmUrl }] = await Promise.all([
    import('barcode-detector/ponyfill'),
    import('zxing-wasm/reader/zxing_reader.wasm?url'),
  ]);
  setZXingModuleOverrides({
    locateFile: (path: string, prefix: string) =>
      path.endsWith('.wasm') ? wasmUrl : prefix + path,
  });
  return new BarcodeDetector({ formats: ['qr_code'] });
}

export type ScanResult =
  { kind: 'contact'; candidate: CardCandidate } | { kind: 'none' } | { kind: 'many' };

/** Kontakt iz besedila kode: vizitka vCard 2.1–4.0 ali MECARD; drugo (npr. spletni naslov) ni kontakt. */
export function contactFromCode(text: string, language: CardLanguage): CardCandidate | null {
  if (isMecard(text)) return readMecard(text, language);
  const cards = readVcards(text, language);
  const first = cards[0];
  return first && (first.firstName || first.lastName) ? first : null;
}

/** Izid iz vseh prebranih kod: natanko ena koda s kontaktom je uspeh (Edge Cases: več kod s kontakti). */
export function scanResult(codes: { rawValue: string }[], language: CardLanguage): ScanResult {
  const contacts = codes
    .map((code) => contactFromCode(code.rawValue, language))
    .filter((candidate): candidate is CardCandidate => candidate != null);
  if (contacts.length === 0) return { kind: 'none' };
  if (contacts.length > 1) return { kind: 'many' };
  return { kind: 'contact', candidate: contacts[0]! };
}

/** Ustavi vse sledi toka kamere (FR-014-20). */
export function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}
