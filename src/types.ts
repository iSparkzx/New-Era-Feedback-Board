// Shapes shared by the page and the Rust core. Item and Status match the
// database columns in supabase/schema.sql.

export interface Item {
  id: string;
  ref_num: number;
  first_name: string;
  last_name: string;
  department: string;
  type: string;
  link: string | null;
  description: string;
  screenshots: string[];
  status: string;
  source: string;
  created_at: string;
  status_changed_at: string | null;
}

export interface Status {
  key: string;
  label: string;
  color: string;
}

export interface Filter {
  status: string;
  dept: string;
  type: string;
  q: string;
}

export interface Section {
  key: string;
  label: string;
  color: string;
  ids: string[];
}

export interface View {
  total: number;
  shown: number;
  counts: { key: string; n: number }[];
  sections: Section[];
}

export interface FormInput {
  first_name: string;
  last_name: string;
  department: string;
  type: string;
  link: string;
  description: string;
}

export type FormField = 'first' | 'last' | 'dept' | 'type' | 'link' | 'desc';

export interface CleanItem {
  first_name: string;
  last_name: string;
  department: string;
  type: string;
  link: string | null;
  description: string;
}

export interface Checked {
  ok: boolean;
  errors: Partial<Record<FormField, string>>;
  clean?: CleanItem;
}

export interface CountdownInfo {
  launched: boolean;
  days: number;
  hours: number;
}
