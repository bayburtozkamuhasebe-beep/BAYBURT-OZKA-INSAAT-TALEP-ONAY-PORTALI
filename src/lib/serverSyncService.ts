import { supabase } from './supabase';
import { ODENECEK_SITES, OdenecekSiteConfig, TalepRecord } from '../types';
import {
  getFirmaUnvani,
  getIban,
  getAciklama,
  getTutar,
  getTalepEden,
  getTarih,
  getNotlar
} from './recordUtils';

export interface SiteSyncResult {
  site: OdenecekSiteConfig;
  count: number;
  totalAmount: number;
  status: 'transferred' | 'skipped_empty' | 'error';
  errorMessage?: string;
}

export interface SyncSummaryResult {
  success: boolean;
  totalTransferredCount: number;
  totalTransferredAmount: number;
  results: SiteSyncResult[];
  message: string;
}

/**
 * Robustly insert records into a Supabase destination table (_odenenler).
 * Handles schema differences by trying multiple column variants.
 */
async function resilientInsertOdenenler(
  tableName: string,
  records: TalepRecord[]
): Promise<{ error: any }> {
  if (!records || records.length === 0) return { error: null };

  const todayStr = new Date().toISOString().split('T')[0];

  // Strategy 1: Standard comprehensive payload
  const payload1 = records.map((rec) => {
    const firma = getFirmaUnvani(rec);
    const ibanVal = getIban(rec);
    const aciklamaVal = getAciklama(rec);
    const tutarVal = getTutar(rec);
    const talepEdenVal = getTalepEden(rec);
    const tarihVal = getTarih(rec) || todayStr;
    const notlarVal = getNotlar(rec) || '';

    return {
      firma_unvani: firma !== '-' ? firma : (rec.firma_unvani || ''),
      iban_no: ibanVal !== '-' ? ibanVal : (rec.iban_no || rec.iban || ''),
      aciklama: aciklamaVal !== '-' ? aciklamaVal : (rec.aciklama || ''),
      tutar: tutarVal || 0,
      talep_eden: talepEdenVal !== '-' ? talepEdenVal : (rec.talep_eden || ''),
      durum: 'ÖDENDİ',
      tarih: tarihVal,
      notlar: notlarVal
    };
  });

  const res1 = await supabase.from(tableName).insert(payload1);
  if (!res1.error) return { error: null };

  console.warn(`Payload 1 failed for ${tableName}:`, res1.error.message);

  // Strategy 2: With 'iban' instead of 'iban_no'
  const payload2 = records.map((rec) => {
    const firma = getFirmaUnvani(rec);
    const ibanVal = getIban(rec);
    const aciklamaVal = getAciklama(rec);
    const tutarVal = getTutar(rec);
    const talepEdenVal = getTalepEden(rec);
    const tarihVal = getTarih(rec) || todayStr;

    return {
      firma_unvani: firma !== '-' ? firma : (rec.firma_unvani || ''),
      iban: ibanVal !== '-' ? ibanVal : (rec.iban || rec.iban_no || ''),
      aciklama: aciklamaVal !== '-' ? aciklamaVal : (rec.aciklama || ''),
      tutar: tutarVal || 0,
      talep_eden: talepEdenVal !== '-' ? talepEdenVal : (rec.talep_eden || ''),
      durum: 'ÖDENDİ',
      tarih: tarihVal
    };
  });

  const res2 = await supabase.from(tableName).insert(payload2);
  if (!res2.error) return { error: null };

  console.warn(`Payload 2 failed for ${tableName}:`, res2.error.message);

  // Strategy 3: With 'odenecek_tutar' instead of 'tutar'
  const payload3 = records.map((rec) => {
    const firma = getFirmaUnvani(rec);
    const ibanVal = getIban(rec);
    const aciklamaVal = getAciklama(rec);
    const tutarVal = getTutar(rec);
    const talepEdenVal = getTalepEden(rec);
    const tarihVal = getTarih(rec) || todayStr;

    return {
      firma_unvani: firma !== '-' ? firma : (rec.firma_unvani || ''),
      iban_no: ibanVal !== '-' ? ibanVal : (rec.iban_no || rec.iban || ''),
      aciklama: aciklamaVal !== '-' ? aciklamaVal : (rec.aciklama || ''),
      odenecek_tutar: tutarVal || 0,
      talep_eden: talepEdenVal !== '-' ? talepEdenVal : (rec.talep_eden || ''),
      durum: 'ÖDENDİ',
      tarih: tarihVal
    };
  });

  const res3 = await supabase.from(tableName).insert(payload3);
  if (!res3.error) return { error: null };

  console.warn(`Payload 3 failed for ${tableName}:`, res3.error.message);

  // Strategy 4: Minimal essential columns (firma_unvani, iban_no, aciklama, tutar, talep_eden)
  const payload4 = records.map((rec) => ({
    firma_unvani: getFirmaUnvani(rec) !== '-' ? getFirmaUnvani(rec) : (rec.firma_unvani || ''),
    iban_no: getIban(rec) !== '-' ? getIban(rec) : (rec.iban_no || rec.iban || ''),
    aciklama: getAciklama(rec) !== '-' ? getAciklama(rec) : (rec.aciklama || ''),
    tutar: getTutar(rec) || 0,
    talep_eden: getTalepEden(rec) !== '-' ? getTalepEden(rec) : (rec.talep_eden || '')
  }));

  const res4 = await supabase.from(tableName).insert(payload4);
  if (!res4.error) return { error: null };

  // Return the best descriptive error
  return { error: res1.error || res4.error };
}

/**
 * Synchronize/Transfer all non-empty _odenecek tables to _odenenler tables.
 * Skips empty tables.
 */
export async function executeServerSyncAllOdenecekToOdenenler(
  onProgress?: (stepMessage: string) => void,
  preloadedRecordsMap?: Record<string, TalepRecord[]>
): Promise<SyncSummaryResult> {
  const results: SiteSyncResult[] = [];
  let totalTransferredCount = 0;
  let totalTransferredAmount = 0;

  for (const site of ODENECEK_SITES) {
    try {
      let records: TalepRecord[] = [];

      if (preloadedRecordsMap && preloadedRecordsMap[site.tableName]) {
        records = preloadedRecordsMap[site.tableName];
      } else {
        onProgress?.(`${site.name}: ${site.tableName} tablosu kontrol ediliyor...`);
        const { data, error: fetchErr } = await supabase
          .from(site.tableName)
          .select('*')
          .order('id', { ascending: true });

        if (fetchErr) {
          throw new Error(`Veri okunamadı (${site.tableName}): ${fetchErr.message}`);
        }
        records = data || [];
      }

      // BOŞ TABLOLAR İÇİN BU İŞLEMLERİ YAPMASIN
      if (!records || records.length === 0) {
        results.push({
          site,
          count: 0,
          totalAmount: 0,
          status: 'skipped_empty'
        });
        continue;
      }

      const siteTotalAmount = records.reduce((acc, r) => acc + getTutar(r), 0);

      onProgress?.(
        `${site.name} (${records.length} kayıt): ${site.odenenlerTableName} tablosuna aktarılıyor...`
      );

      // 1. Hedef _odenenler tablosuna güvenli yaz
      const { error: insertError } = await resilientInsertOdenenler(
        site.odenenlerTableName,
        records
      );

      if (insertError) {
        const errMsg = `Hedef tablo hatası (${site.odenenlerTableName}): ${insertError.message}`;
        results.push({
          site,
          count: records.length,
          totalAmount: siteTotalAmount,
          status: 'error',
          errorMessage: errMsg
        });
        throw new Error(errMsg);
      }

      // 2. Kaynak _odenecek tablosundan sil
      const recordIds = records
        .map((r) => r.id)
        .filter((id) => id !== undefined && id !== null);

      if (recordIds.length > 0) {
        onProgress?.(
          `${site.name}: ${site.tableName} ödenecek listesi temizleniyor...`
        );
        const { error: deleteError } = await supabase
          .from(site.tableName)
          .delete()
          .in('id', recordIds);

        if (deleteError) {
          console.warn(`Silme uyarısı (${site.tableName}):`, deleteError);
        }
      }

      totalTransferredCount += records.length;
      totalTransferredAmount += siteTotalAmount;

      results.push({
        site,
        count: records.length,
        totalAmount: siteTotalAmount,
        status: 'transferred'
      });
    } catch (err: any) {
      console.error(`Sync error for ${site.name}:`, err);
      // If result for this site wasn't pushed yet
      if (!results.some((r) => r.site.id === site.id)) {
        results.push({
          site,
          count: 0,
          totalAmount: 0,
          status: 'error',
          errorMessage: err.message || 'Bilinmeyen aktarım hatası'
        });
      }
      return {
        success: false,
        totalTransferredCount,
        totalTransferredAmount,
        results,
        message: `${site.name} aktarımında hata: ${err.message || 'İşlem durduruldu'}`
      };
    }
  }

  const transferredSites = results
    .filter((r) => r.status === 'transferred')
    .map((r) => `${r.site.name} (${r.count} kayıt)`);

  return {
    success: true,
    totalTransferredCount,
    totalTransferredAmount,
    results,
    message:
      totalTransferredCount > 0
        ? `Toplam ${totalTransferredCount} adet ödeme kaydı sunucudaki _odenenler tablolarına aktarıldı ve ödenecek listeleri temizlendi. [${transferredSites.join(
            ', '
          )}]`
        : 'Tüm ödenecek tabloları boş olduğu için aktarılacak kayıt bulunamadı.'
  };
}
