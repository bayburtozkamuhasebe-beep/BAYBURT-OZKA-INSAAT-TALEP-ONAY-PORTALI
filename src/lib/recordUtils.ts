import { TalepRecord } from '../types';

/**
 * Robust extractor for FİRMA ÜNVANI / TEDARİKÇİ
 */
export const getFirmaUnvani = (r: TalepRecord): string => {
  const candidates = [
    r.firma_unvani,
    r['firma_unvani'],
    r['Firma Ünvanı'],
    r['FİRMA ÜNVANI'],
    r['firma_unvan'],
    r['firma_adi'],
    r['Firma Adı'],
    r['FİRMA ADI'],
    r.firma,
    r['firma'],
    r['Firma'],
    r['FİRMA'],
    r.tedarikci,
    r['tedarikci'],
    r['Tedarikçi'],
    r['TEDARİKÇİ'],
    r.unvan,
    r['unvan'],
    r['Ünvan'],
    r.cari,
    r['cari'],
    r['Cari'],
    r['CARİ'],
    r.sirket,
    r['sirket'],
    r['Şirket'],
    r.alici,
    r['alici']
  ];

  for (const c of candidates) {
    if (c !== undefined && c !== null && String(c).trim() !== '') {
      return String(c).trim();
    }
  }

  // Check if embedded in notes or aciklama if none found
  return '-';
};

/**
 * Robust extractor for İBAN NO
 */
export const getIban = (r: TalepRecord): string => {
  const candidates = [
    r.iban,
    r['iban'],
    r['IBAN'],
    r['Iban'],
    r.iban_no,
    r['iban_no'],
    r['IBAN NO'],
    r['İBAN NO'],
    r['İBAN No'],
    r['Iban No'],
    r['iban_numarasi'],
    r['hesap_no'],
    r['Hesap No'],
    r['banka_iban'],
    r['hesap_iban']
  ];

  for (const c of candidates) {
    if (c !== undefined && c !== null && String(c).trim() !== '') {
      return String(c).replace(/\s+/g, '').trim();
    }
  }
  return '';
};

/**
 * Format and sanitize IBAN string without spaces (TR000000000000000000000000)
 */
export const formatIbanDisplay = (rawIban: string): string => {
  if (!rawIban) return '-';
  const clean = rawIban.replace(/\s+/g, '').toUpperCase();
  if (clean.length === 0) return '-';
  return clean;
};

/**
 * Robust extractor for TALEP EDEN / PERSONEL
 */
export const getTalepEden = (r: TalepRecord): string => {
  const candidates = [
    r.talep_eden,
    r['talep_eden'],
    r['Talep Eden'],
    r['talep eden'],
    r['TALEP EDEN'],
    r.talep_sahibi,
    r['talep_sahibi'],
    r.isim,
    r['isim'],
    r.ad_soyad,
    r['ad_soyad'],
    r['Ad Soyad'],
    r['AD SOYAD'],
    r.adi_soyadi,
    r['adi_soyadi'],
    r.personel,
    r['personel'],
    r.birim_yetkilisi,
    r['birim_yetkilisi'],
    r.isteyen,
    r['isteyen']
  ];

  for (const c of candidates) {
    if (c !== undefined && c !== null && String(c).trim() !== '') {
      return String(c).trim();
    }
  }
  return '-';
};

/**
 * Robust extractor for AÇIKLAMA / MALZEME / DETAY
 */
export const getAciklama = (r: TalepRecord): string => {
  const candidates = [
    r.aciklama,
    r['aciklama'],
    r['Açıklama'],
    r['açıklama'],
    r['AÇIKLAMA'],
    r.malzeme,
    r['malzeme'],
    r['Malzeme'],
    r['MALZEME'],
    r.talep,
    r['talep'],
    r['Talep'],
    r.detay,
    r['detay'],
    r.icerik,
    r['icerik'],
    r.islem,
    r['islem'],
    r.hizmet,
    r['hizmet']
  ];

  for (const c of candidates) {
    if (c !== undefined && c !== null && String(c).trim() !== '') {
      return String(c).trim();
    }
  }
  return '-';
};

/**
 * Robust extractor for ÖDENECEK TUTAR / TUTAR
 */
export const getTutar = (r: TalepRecord): number => {
  const candidates = [
    r.odenecek_tutar,
    r['odenecek_tutar'],
    r['Ödenecek Tutar'],
    r['ÖDENECEK TUTAR'],
    r['odenecek_tutar_tl'],
    r.tutar,
    r['tutar'],
    r['Tutar'],
    r['TUTAR'],
    r.fiyat,
    r['fiyat'],
    r['Fiyat'],
    r['FİYAT'],
    r.bedel,
    r['bedel'],
    r.ucret,
    r['ucret'],
    r.toplam_tutar,
    r['toplam_tutar'],
    r['Toplam Tutar'],
    r.miktar_tutar
  ];

  for (const c of candidates) {
    if (c !== undefined && c !== null && c !== '') {
      // Remove any non-numeric except dot/comma if it is a string with currency symbol
      let raw = String(c).replace(/₺|TL|TRY|\s/gi, '').trim();
      // Handle comma as decimal separator if format is 1.000,50
      if (raw.includes(',') && raw.includes('.')) {
        raw = raw.replace(/\./g, '').replace(',', '.');
      } else if (raw.includes(',')) {
        raw = raw.replace(',', '.');
      }
      const num = Number(raw);
      if (!isNaN(num)) {
        return num;
      }
    }
  }
  return 0;
};

/**
 * Robust extractor for DURUM / ÖDEME DURUMU
 */
export const getRecordStatus = (r: TalepRecord): 'ÖDENSİN' | 'ÖDENMESİN' | 'BEKLESİN' => {
  const rawCandidate =
    r.durum ||
    r['durum'] ||
    r['Durum'] ||
    r['DURUM'] ||
    r.odeme_durumu ||
    r['odeme_durumu'] ||
    r['Odeme Durumu'] ||
    r['Ödeme Durumu'] ||
    r['ÖDEME DURUMU'] ||
    r.status ||
    r['status'] ||
    'BEKLESİN';

  const raw = String(rawCandidate).toUpperCase().trim();

  if (raw.includes('ÖDE') && !raw.includes('ME')) return 'ÖDENSİN';
  if (raw.includes('ODEN') && !raw.includes('ME')) return 'ÖDENSİN';
  if (raw.includes('ÖDENME') || raw.includes('ODENME') || raw.includes('RED') || raw.includes('İPTAL') || raw.includes('IPTAL')) return 'ÖDENMESİN';
  return 'BEKLESİN';
};

export const getMiktar = (r: TalepRecord): string | number => {
  const val = r.miktar ?? r['miktar'] ?? r['Miktar'] ?? r.adet ?? r.sayi;
  return val !== undefined && val !== null ? val : '';
};

export const getBirim = (r: TalepRecord): string => {
  return r.birim || r['birim'] || r['Birim'] || '';
};

export const getTarih = (r: TalepRecord): string => {
  const raw =
    r.tarih ||
    r['tarih'] ||
    r['Tarih'] ||
    r.created_at ||
    r['created_at'] ||
    r.olusturma_tarihi;
  if (!raw) return '-';
  try {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('tr-TR');
    }
  } catch (e) {}
  return String(raw);
};

export const getNotlar = (r: TalepRecord): string => {
  return r.notlar || r['notlar'] || r['Notlar'] || r.not || r.aciklamalar || '';
};

export const formatCurrency = (val: any): string => {
  const num = Number(val);
  if (isNaN(num)) return '₺0,00';
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num);
};

/**
 * Live formatting preview for amount inputs (showing thousands with dots, decimals with comma, and ₺)
 */
export const formatCurrencyPreview = (val: any): string | null => {
  if (val === undefined || val === null || String(val).trim() === '') return null;
  const num = parseCariBakiyeNumber(val);
  if (num === null) return null;
  return formatCurrency(num);
};

/**
 * Robust extractor for CARİ BAKİYE from TalepRecord
 */
export const getCariBakiye = (r: TalepRecord): any => {
  const candidates = [
    r.cari_bakiye,
    r['cari_bakiye'],
    r['Cari Bakiye'],
    r['CARİ BAKİYE'],
    r['Cari_Bakiye'],
    r['cari_bakiye_tutar'],
    r['bakiye'],
    r.bakiye
  ];

  for (const c of candidates) {
    if (c !== undefined && c !== null && String(c).trim() !== '') {
      return c;
    }
  }
  return '';
};

/**
 * Parse any CARİ BAKİYE representation into a number (or null if empty/invalid)
 */
export const parseCariBakiyeNumber = (val: any): number | null => {
  if (val === undefined || val === null || val === '' || val === '-') return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;
  const str = String(val).trim();
  const isNegative = str.startsWith('-') || str.includes('(-') || (str.startsWith('(') && str.endsWith(')'));
  let clean = str.replace(/[^0-9,.-]/g, '');
  if (clean.includes('.') && clean.includes(',')) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (clean.includes(',')) {
    clean = clean.replace(',', '.');
  }
  let num = parseFloat(clean);
  if (isNaN(num)) return null;
  if (isNegative && num > 0) num = -num;
  return num;
};

/**
 * Format CARİ BAKİYE for display
 */
export const formatCariBakiyeDisplay = (val: any): string => {
  if (val === undefined || val === null || val === '') return '-';
  const num = parseCariBakiyeNumber(val);
  if (num !== null) {
    return formatCurrency(num);
  }
  return String(val);
};

/**
 * Return appropriate Tailwind classes based on CARİ BAKİYE vs ÖDENECEK TUTAR:
 * - Cari bakiye ödenecek tutardan küçükse: KIRMIZI RENK VE BELİRGİN YANIP SÖNER (text-red-600 font-black animate-cari-blink)
 * - Cari bakiye ödenecek tutara eşit veya büyükse: YEŞİL RENK (text-emerald-700 font-black)
 * - Tanımlı değilse: Nötr açık gri (text-slate-400 font-medium)
 */
export const getCariBakiyeTextStyle = (bakiyeVal: any, tutarVal: any): string => {
  const bakiye = parseCariBakiyeNumber(bakiyeVal);
  if (bakiye === null) {
    return 'text-slate-400 font-medium';
  }

  const tutar = typeof tutarVal === 'number' ? tutarVal : (parseCariBakiyeNumber(tutarVal) ?? 0);

  // Ödenecek tutara eşit ve büyükse yeşil renk
  if (bakiye >= tutar) {
    return 'text-emerald-700 font-black';
  }

  // Ödenecek tutardan küçükse kırmızı renk yap ve belirgin yanıp sönsün (eksi bakiye dahil)
  return 'text-red-600 font-black animate-cari-blink';
};

/**
 * Tooltip description for CARİ BAKİYE
 */
export const getCariBakiyeTitle = (bakiyeVal: any, tutarVal: any): string => {
  const bakiye = parseCariBakiyeNumber(bakiyeVal);
  if (bakiye === null) return 'Cari bakiye belirtilmemiş';
  const tutar = typeof tutarVal === 'number' ? tutarVal : (parseCariBakiyeNumber(tutarVal) ?? 0);
  if (bakiye >= tutar) {
    return `Cari Bakiye (${formatCurrency(bakiye)}) Ödenecek Tutara (${formatCurrency(tutar)}) EŞİT veya BÜYÜK (Yeşil)`;
  }
  return `Cari Bakiye (${formatCurrency(bakiye)}) Ödenecek Tutardan (${formatCurrency(tutar)}) KÜÇÜK (Kırmızı - Belirgin Yanıp Sönüyor)`;
};

/**
 * Checks whether CARİ BAKİYE is strictly lower than ÖDENECEK TUTAR
 */
export const isCariBakiyeLowerThanTutar = (bakiyeVal: any, tutarVal: any): boolean => {
  const bakiye = parseCariBakiyeNumber(bakiyeVal);
  if (bakiye === null) return false;
  const tutar = typeof tutarVal === 'number' ? tutarVal : (parseCariBakiyeNumber(tutarVal) ?? 0);
  return bakiye < tutar;
};

