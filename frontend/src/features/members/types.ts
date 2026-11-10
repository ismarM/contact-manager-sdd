import type { Role, UserRef } from '../groups/types';

// Oblike odgovorov API članov (specs/007-clani/contracts/openapi.yaml).

/** Vloge, ki jih je mogoče dodeliti članu (lastnik nastane samo s prenosom lastništva). */
export type AssignableRole = Exclude<Role, 'OWNER'>;

/** Član skupine; `id` je opaken `memberId`, `canManage` izračuna strežnik (pravilo »le nižjim od sebe«). */
export interface Member {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  version: number;
  self: boolean;
  canManage: boolean;
  updatedBy: UserRef | null;
  updatedAt: string | null;
}

export interface Members {
  total: number;
  page: number;
  size: number;
  /** Trajno arhivirana skupina: prikaži vrstico »izbrisan uporabnik« z vlogo Lastnik (ni članstvo). */
  deletedOwner: boolean;
  items: Member[];
}

export interface MembersParams {
  page: number;
  size: number;
  lang: 'sl' | 'en';
}
