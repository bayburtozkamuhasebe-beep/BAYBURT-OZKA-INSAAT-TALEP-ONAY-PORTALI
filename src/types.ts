export type SiteKey =
  | 'all'
  | 'mamak'
  | 'senbay_ozka'
  | 'merkez_ozka'
  | 'msb_ozka'
  | 'seka'
  | 'diger'
  | 'arnavutkoy';

export interface SiteConfig {
  id: SiteKey;
  name: string;
  tableName: string;
  code: string;
  badgeColor: string;
}

export const ALL_SITES_OPTION: SiteConfig = {
  id: 'all',
  name: 'TÜM ŞANTİYELER (HEPSİ)',
  tableName: 'all_tables',
  code: 'HEPSİ',
  badgeColor: 'border-blue-500 text-blue-600 bg-blue-50'
};

export const SITES: SiteConfig[] = [
  {
    id: 'arnavutkoy',
    name: 'ARNAVUTKÖY',
    tableName: 'arnavutkoy_talep',
    code: 'ARN',
    badgeColor: 'border-cyan-500 text-cyan-700 bg-cyan-50'
  },
  {
    id: 'mamak',
    name: 'MAMAK-ANKARA',
    tableName: 'mamak_talep',
    code: 'MMK',
    badgeColor: 'border-blue-500 text-blue-700 bg-blue-50'
  },
  {
    id: 'senbay_ozka',
    name: 'ŞENBAY-ÖZKA',
    tableName: 'senbay_ozka_talep',
    code: 'SNB',
    badgeColor: 'border-indigo-500 text-indigo-700 bg-indigo-50'
  },
  {
    id: 'merkez_ozka',
    name: 'MERKEZ ÖZKA',
    tableName: 'merkez_ozka_talep',
    code: 'MRK',
    badgeColor: 'border-emerald-500 text-emerald-700 bg-emerald-50'
  },
  {
    id: 'msb_ozka',
    name: 'MSB ÖZKA',
    tableName: 'msb_ozka_talep',
    code: 'MSB',
    badgeColor: 'border-amber-500 text-amber-700 bg-amber-50'
  },
  {
    id: 'seka',
    name: 'SEKA',
    tableName: 'seka_talep',
    code: 'SKA',
    badgeColor: 'border-purple-500 text-purple-700 bg-purple-50'
  },
  {
    id: 'diger',
    name: 'DİĞER',
    tableName: 'diger_talep',
    code: 'DGR',
    badgeColor: 'border-slate-500 text-slate-700 bg-slate-100'
  }
];

export const ALL_NAVIGATION_ITEMS: SiteConfig[] = SITES;

export interface OdenecekSiteConfig {
  id: SiteKey;
  name: string;
  tableName: string;
  talepTableName: string;
  odenenlerTableName: string;
  code: string;
  badgeColor: string;
}

export const ODENECEK_SITES: OdenecekSiteConfig[] = [
  {
    id: 'arnavutkoy',
    name: 'ARNAVUTKÖY',
    tableName: 'arnavutkoy_odenecek',
    talepTableName: 'arnavutkoy_talep',
    odenenlerTableName: 'arnavutkoy_odenenler',
    code: 'ARN',
    badgeColor: 'border-cyan-500 text-cyan-700 bg-cyan-50'
  },
  {
    id: 'mamak',
    name: 'MAMAK-ANKARA',
    tableName: 'mamak_odenecek',
    talepTableName: 'mamak_talep',
    odenenlerTableName: 'mamak_odenenler',
    code: 'MMK',
    badgeColor: 'border-blue-500 text-blue-700 bg-blue-50'
  },
  {
    id: 'senbay_ozka',
    name: 'ŞENBAY-ÖZKA',
    tableName: 'senbay_ozka_odenecek',
    talepTableName: 'senbay_ozka_talep',
    odenenlerTableName: 'senbay_ozka_odenenler',
    code: 'SNB',
    badgeColor: 'border-indigo-500 text-indigo-700 bg-indigo-50'
  },
  {
    id: 'merkez_ozka',
    name: 'MERKEZ ÖZKA',
    tableName: 'merkez_ozka_odenecek',
    talepTableName: 'merkez_ozka_talep',
    odenenlerTableName: 'merkez_ozka_odenenler',
    code: 'MRK',
    badgeColor: 'border-emerald-500 text-emerald-700 bg-emerald-50'
  },
  {
    id: 'msb_ozka',
    name: 'MSB ÖZKA',
    tableName: 'msb_ozka_odenecek',
    talepTableName: 'msb_ozka_talep',
    odenenlerTableName: 'msb_ozka_odenenler',
    code: 'MSB',
    badgeColor: 'border-amber-500 text-amber-700 bg-amber-50'
  },
  {
    id: 'seka',
    name: 'SEKA',
    tableName: 'seka_odenecek',
    talepTableName: 'seka_talep',
    odenenlerTableName: 'seka_odenenler',
    code: 'SKA',
    badgeColor: 'border-purple-500 text-purple-700 bg-purple-50'
  },
  {
    id: 'diger',
    name: 'DİĞER',
    tableName: 'diger_odenecek',
    talepTableName: 'diger_talep',
    odenenlerTableName: 'diger_odenenler',
    code: 'DGR',
    badgeColor: 'border-slate-500 text-slate-700 bg-slate-100'
  }
];

export type PaymentStatus = 'ÖDENSİN' | 'ÖDENMESİN' | 'BEKLESİN' | string;

export interface TalepRecord {
  id?: string | number;
  firma_unvani?: string;
  iban?: string;
  iban_no?: string;
  aciklama?: string;
  odenecek_tutar?: string | number;
  tutar?: string | number;
  cari_bakiye?: string | number;
  talep_eden?: string;
  durum?: string;
  odeme_durumu?: string;
  tarih?: string;
  notlar?: string;
  miktar?: string | number;
  birim?: string;
  created_at?: string;
  _siteName?: string;
  _siteTable?: string;
  _siteId?: string;
  _siteBadge?: string;
  [key: string]: any; // supports dynamic columns from supabase
}
