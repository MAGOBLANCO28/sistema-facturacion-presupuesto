export type DocumentType = 'invoice' | 'quote';

export interface DocumentItem {
  id: string;
  concept: string;
  quantity: number;
  total: number;
}

export interface DocumentData {
  id?: number;
  type: DocumentType;
  number: string;
  date: string;
  client_name: string;
  client_dni: string;
  client_address: string;
  client_city: string;
  items: DocumentItem[];
  subtotal: number;
  iva_rate: number;
  iva_amount: number;
  total: number;
  created_at?: string;
}

export interface CompanySettings {
  company_name: string;
  owner_name: string;
  cif: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  province: string;
}
