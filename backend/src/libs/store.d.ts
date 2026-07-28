export interface StoreContactEntry {
  id?: string;
  name?: string;
  notify?: string;
  verifiedName?: string;
  [key: string]: unknown;
}

export interface Store {
  contacts: Record<string, StoreContactEntry>;
}
