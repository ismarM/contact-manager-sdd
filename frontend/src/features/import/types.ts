import type { Address } from '../attributes/types';
import type { Attribute } from '../contacts/types';
import type { CardCandidate } from '../contacts/qr/vcardTypes';

// Oblike API uvoza (specs/014-uvoz-izvoz/contracts/openapi.yaml).

export type ImportSource = 'XLSX' | 'VCF';

export type MappingTarget =
  | 'FIRST_NAME'
  | 'LAST_NAME'
  | 'ADDRESS'
  | 'EMAIL'
  | 'PHONE'
  | 'COUNTRY'
  | 'COMPANY'
  | 'TAGS'
  | 'ATTRIBUTE'
  | 'SKIP';

export interface ColumnMapping {
  column: number;
  target: MappingTarget;
  key: string | null;
}

export interface ImportSheet {
  format: 'XLSX';
  sheetCount: number;
  headers: string[];
  suggestedMapping: ColumnMapping[];
  rows: { rowNumber: number; cells: string[] }[];
}

export interface ImportCards {
  format: 'VCF';
  candidates: CardCandidate[];
  omitted: string[];
}

export type Candidate = CardCandidate;

export interface FieldError {
  field: string;
  code: string;
}

export interface PreviewRow {
  index: number;
  errors: FieldError[];
  country: {
    status: 'FOUND' | 'AMBIGUOUS' | 'UNKNOWN' | 'EMPTY';
    code: string | null;
    candidates: string[];
  };
  duplicate: {
    reason: 'NAME' | 'EMAIL' | 'PHONE';
    contactName: string | null;
    inFileIndex: number | null;
  } | null;
  normalized: { attributeKeys: string[]; tags: string[] } | null;
}

/** Kontakt za potrditev: država je koda ali `null`. */
export interface ImportContact {
  firstName: string | null;
  lastName: string | null;
  address: string | null;
  /** 016: deli naslova iz vizitke (`ADR` po delih); `address` je tedaj `null`. */
  addressParts?: Address | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  country: string | null;
  attributes: Attribute[];
  tags: string[];
}
