export type DocumentType = 'invoice' | 'quote' | 'abono';
export type DocumentStatus = 'Borrador' | 'Emitida' | 'Pagada' | 'Rectificativa' | 'Cancelada' | 'Pendiente' | 'Definitivo' | 'Aceptado' | 'Rechazado' | 'Convertido';

export interface DocumentItem {
  id: string;
  concept: string;
  quantity: number;
  unit_price: number;
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
  client_zip?: string;
  client_province?: string;
  items: DocumentItem[];
  subtotal: number;
  iva_rate: number;
  iva_amount: number;
  irpf_rate?: number;
  irpf_amount?: number;
  total: number;
  status: DocumentStatus;
  is_rectificative?: boolean;
  original_invoice_id?: number;
  created_at?: string;
  fecha_vencimiento?: string;
  client_email?: string;
  recordatorio_cobro_at?: string;
}

export interface Expense {
  id?: number;
  description: string;
  provider?: string;
  nif?: string;
  amount: number;
  base_amount?: number;
  iva_amount: number;
  iva_rate: number;
  category: string;
  date: string;
  ticket_image_url?: string;
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
  zip: string;
  website?: string;
  logo_url?: string;
  account_type?: 'autonomo' | 'sl';
  irpf_rate?: number;
  notification_email?: string;
  recordatorios_cobros?: boolean;
  recordatorios_impuestos?: boolean;
  dias_aviso_cobro?: number;
}
