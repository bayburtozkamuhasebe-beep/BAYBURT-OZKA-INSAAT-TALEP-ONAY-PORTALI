import { createClient } from '@supabase/supabase-js';
import { supabase, SUPABASE_URL } from './supabase';

export interface FaturaInfo {
  url: string;
  fileName: string;
  fileType: 'pdf' | 'image' | 'html' | 'other';
  uploadedAt: string;
  size?: number;
  storagePath?: string;
  sourceBucket?: string;
  sourceProject?: string;
  sequenceNumber?: number;
  displayName?: string;
}

export const CARIFATURALAR_BUCKET = 'CARIFATURALAR';
export const PRIMARY_PROJECT_ID = 'mgtunrfpzbyfnmeloeeq';
export const PRIMARY_STORAGE_URL = 'https://mgtunrfpzbyfnmeloeeq.supabase.co';
export const FALLBACK_STORAGE_URL = SUPABASE_URL;

// Provided Supabase anon key for project mgtunrfpzbyfnmeloeeq
export const PRIMARY_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ndHVucmZwemJ5Zm5tZWxvZWVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxNDUwMjgsImV4cCI6MjEwNDcyMTAyOH0.HcdwZbO-oHXQxytE-G221_62irBwuv0-8e3P_ux4a7k';

// Primary client for CARIFATURALAR storage bucket
export const primaryClient = createClient(PRIMARY_STORAGE_URL, PRIMARY_ANON_KEY);

const LOCAL_STORAGE_PREFIX = 'carifatura_list_cache_';
const CACHE_TTL_MS = 1000 * 60 * 10; // 10 minutes

// In-memory caches
interface BucketFileEntry {
  name: string;
  path: string;
  size?: number;
  updated_at?: string;
}

let cachedBucketFiles: BucketFileEntry[] | null = null;
let bucketListPromise: Promise<BucketFileEntry[]> | null = null;
let lastBucketFetchTime = 0;

const memoryListCache = new Map<string, { list: FaturaInfo[]; timestamp: number }>();
const inFlightListChecks = new Map<string, Promise<FaturaInfo[]>>();

/**
 * Determine file type from extension
 */
export function getFileType(fileName: string): 'pdf' | 'image' | 'html' | 'other' {
  const lower = (fileName || '').toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.png') ||
    lower.endsWith('.webp') ||
    lower.endsWith('.gif') ||
    lower.endsWith('.bmp')
  ) {
    return 'image';
  }
  if (lower.endsWith('.html') || lower.endsWith('.htm')) {
    return 'html';
  }
  return 'other';
}

/**
 * Standard Turkish lowercase & ASCII normalizer
 */
export function normalizeTurkishChars(text: string): string {
  if (!text) return '';
  return text
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/ı/g, 'i')
    .replace(/i̇/g, 'i')
    .replace(/Ğ/g, 'g')
    .replace(/ğ/g, 'g')
    .replace(/Ü/g, 'u')
    .replace(/ü/g, 'u')
    .replace(/Ş/g, 's')
    .replace(/ş/g, 's')
    .replace(/Ö/g, 'o')
    .replace(/ö/g, 'o')
    .replace(/Ç/g, 'c')
    .replace(/ç/g, 'c')
    .toLowerCase()
    .replace(/[\._\-,\/\\\(\)\[\]"'`’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts sequence number from filename like:
 * "ABC SAC METAL ANONIM SIRKETI 1.pdf" => 1
 * "SRP RENT A CAR GIDA TEMIZLIK HIZ.INS 3.pdf" => 3
 * "SRP RENT A CAR GIDA TEMIZLIK HIZ.INS.pdf" => 0
 */
export function extractSequenceNumber(fileName: string): number {
  const base = fileName.replace(/\.[^/.]+$/, '').trim();
  const m = base.match(/(?:^|\s+|_|-)(\d+)$/);
  if (m) {
    return parseInt(m[1], 10);
  }
  return 0;
}

/**
 * Checks if a filename in CARIFATURALAR matches the row's company title in FULL NAME (TAM ADDA).
 * Sadece ilgili satırdaki Firma Ünvanının TAM ADIYLA eşleşen evrakları bulur:
 * - Tam birebir isim eşleşmesi: "ABC SAC METAL ANONIM SIRKETI.pdf" <-> "ABC SAC METAL ANONİM ŞİRKETİ"
 * - Numaralı sıralı evraklar: "ABC SAC METAL ANONIM SIRKETI 1.pdf", "ABC SAC METAL ANONIM SIRKETI 2.pdf"
 * - Türkçe karakter ve noktalama normalizasyonu yapılarak tam ünvan karşılaştırılır.
 * - Kısmi veya kelime bazlı gevşek eşleşmeler (yanlış firma evrakı gösterilmemesi için) kesinlikle kabul edilmez.
 */
export function doesFileMatchFirma(fileName: string, firma: string, _recordId?: string | number): boolean {
  if (!fileName || !firma) return false;

  // Gizli veya probe dosyalarını atla
  if (fileName.startsWith('.') || fileName.startsWith('_probe')) return false;

  // Uzantıyı kaldır (.pdf, .html vb.)
  const baseFileName = fileName.replace(/\.[^/.]+$/, '').trim();
  const normFile = normalizeTurkishChars(baseFileName);
  const normFirma = normalizeTurkishChars(firma);

  if (!normFirma || !normFile) return false;

  // 1. TAM AD: Birebir tam eşleşme
  if (normFile === normFirma) {
    return true;
  }

  // 2. TAM AD + Sıra Numarası (örn: "FIRMA UNVANI 1", "FIRMA UNVANI 2", "FIRMA UNVANI 3")
  const normFileNoNum = normFile.replace(/\s+\d+$/, '').trim();
  if (normFileNoNum === normFirma) {
    return true;
  }

  // 3. Firma unvanının kendisinde numara varsa veya her ikisinde de varsa
  const normFirmaNoNum = normFirma.replace(/\s+\d+$/, '').trim();
  if (normFileNoNum && normFirmaNoNum && normFileNoNum === normFirmaNoNum) {
    return true;
  }

  return false;
}

/**
 * Invalidates cache to force reload from Supabase
 */
export function invalidateBucketCache() {
  cachedBucketFiles = null;
  bucketListPromise = null;
  memoryListCache.clear();
  try {
    sessionStorage.clear();
  } catch {
    // ignore
  }
}

/**
 * Fetches all files from the primary CARIFATURALAR bucket
 */
export async function fetchBucketFileList(forceRefresh = false): Promise<BucketFileEntry[]> {
  const now = Date.now();
  if (!forceRefresh && cachedBucketFiles !== null && now - lastBucketFetchTime < CACHE_TTL_MS) {
    return cachedBucketFiles;
  }
  if (!forceRefresh && bucketListPromise) {
    return bucketListPromise;
  }

  bucketListPromise = (async () => {
    const fileEntries: BucketFileEntry[] = [];

    // 1. Fetch from primary project mgtunrfpzbyfnmeloeeq CARIFATURALAR bucket
    try {
      const { data, error } = await primaryClient.storage
        .from(CARIFATURALAR_BUCKET)
        .list('', { limit: 1000, sortBy: { column: 'name', order: 'asc' } });

      if (!error && data) {
        for (const item of data) {
          if (item.name && !item.name.startsWith('.')) {
            fileEntries.push({
              name: item.name,
              path: item.name,
              size: item.metadata?.size,
              updated_at: item.updated_at || item.created_at
            });
          }
        }
      }
    } catch (e) {
      console.warn('CARIFATURALAR list error on primary:', e);
    }

    // 2. Also check fallback supabase if primary was empty
    if (fileEntries.length === 0) {
      try {
        const { data, error } = await supabase.storage
          .from(CARIFATURALAR_BUCKET)
          .list('', { limit: 1000 });
        if (!error && data) {
          for (const item of data) {
            if (item.name && !item.name.startsWith('.') && !fileEntries.some((e) => e.name === item.name)) {
              fileEntries.push({
                name: item.name,
                path: item.name,
                size: item.metadata?.size,
                updated_at: item.updated_at || item.created_at
              });
            }
          }
        }
      } catch {
        // ignore
      }
    }

    cachedBucketFiles = fileEntries;
    lastBucketFetchTime = Date.now();
    return fileEntries;
  })();

  return bucketListPromise;
}

/**
 * Returns all matching invoices/documents in CARIFATURALAR for a given firma.
 * Sorts them so numbered documents (1, 2, 3...) appear in proper sequential order.
 */
export async function getFaturaListForRecord(
  _recordId?: string | number,
  firmaUnvani?: string,
  forceRefresh = false
): Promise<FaturaInfo[]> {
  const firma = firmaUnvani?.trim() || '';
  if (!firma) return [];

  const cacheKey = normalizeTurkishChars(firma);

  if (!forceRefresh) {
    const cachedMem = memoryListCache.get(cacheKey);
    if (cachedMem && Date.now() - cachedMem.timestamp < CACHE_TTL_MS) {
      return cachedMem.list;
    }

    const existingPromise = inFlightListChecks.get(cacheKey);
    if (existingPromise) {
      return existingPromise;
    }

    try {
      const stored = sessionStorage.getItem(`${LOCAL_STORAGE_PREFIX}${cacheKey}`);
      if (stored) {
        const parsed = JSON.parse(stored) as { list: FaturaInfo[]; timestamp: number };
        if (parsed && Date.now() - parsed.timestamp < CACHE_TTL_MS) {
          memoryListCache.set(cacheKey, parsed);
          return parsed.list;
        }
      }
    } catch {
      // ignore
    }
  }

  const checkPromise = (async () => {
    try {
      const allFiles = await fetchBucketFileList(forceRefresh);
      const matchedEntries = allFiles.filter((item) =>
        doesFileMatchFirma(item.name, firma)
      );

      // Sort matches: base document first, then 1, 2, 3...
      matchedEntries.sort((a, b) => {
        const seqA = extractSequenceNumber(a.name);
        const seqB = extractSequenceNumber(b.name);
        if (seqA !== seqB) {
          // If one is 0 and others are 1, 2, 3, keep 0 as base first or if both > 0 sort ascending
          return seqA - seqB;
        }
        return a.name.localeCompare(b.name, 'tr');
      });

      const results: FaturaInfo[] = matchedEntries.map((item, index) => {
        const seq = extractSequenceNumber(item.name);
        const publicUrl = `${PRIMARY_STORAGE_URL}/storage/v1/object/public/${CARIFATURALAR_BUCKET}/${encodeURIComponent(
          item.path
        )}`;

        let displayName = `Evrak ${index + 1}`;
        if (seq > 0) {
          displayName = `Evrak ${seq}`;
        } else if (matchedEntries.length === 1) {
          displayName = 'Fatura & Evrak';
        }

        return {
          url: publicUrl,
          fileName: item.name,
          fileType: getFileType(item.name),
          uploadedAt: item.updated_at || new Date().toISOString(),
          size: item.size,
          storagePath: item.path,
          sourceBucket: CARIFATURALAR_BUCKET,
          sourceProject: PRIMARY_STORAGE_URL,
          sequenceNumber: seq > 0 ? seq : index + 1,
          displayName
        };
      });

      saveListToCache(cacheKey, results);
      return results;
    } finally {
      inFlightListChecks.delete(cacheKey);
    }
  })();

  inFlightListChecks.set(cacheKey, checkPromise);
  return checkPromise;
}

/**
 * Returns single (first) invoice info for backward compatibility
 */
export async function getFaturaForRecord(
  recordId: string | number,
  firmaUnvani?: string
): Promise<FaturaInfo | null> {
  const list = await getFaturaListForRecord(recordId, firmaUnvani);
  return list.length > 0 ? list[0] : null;
}

function saveListToCache(key: string, list: FaturaInfo[]) {
  const payload = { list, timestamp: Date.now() };
  memoryListCache.set(key, payload);
  try {
    sessionStorage.setItem(`${LOCAL_STORAGE_PREFIX}${key}`, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

/**
 * Synchronous cached lookup
 */
export function getCachedFaturaList(
  firmaUnvani: string,
  _recordId?: string | number
): FaturaInfo[] | undefined {
  const firma = (firmaUnvani || '').trim();
  const cacheKey = normalizeTurkishChars(firma);
  const entry = memoryListCache.get(cacheKey);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
    return entry.list;
  }
  return undefined;
}

export function getCachedFaturaInfo(
  firmaUnvani: string,
  recordId?: string | number
): FaturaInfo | null | undefined {
  const list = getCachedFaturaList(firmaUnvani, recordId);
  if (list !== undefined) {
    return list.length > 0 ? list[0] : null;
  }
  return undefined;
}

export interface SitePruneDetail {
  siteKey: string;
  siteName: string;
  tableLabel: string;
  talepTableName: string;
  odemeTableName: string;
  firmas: string[];
  protectedFilesCount: number;
}

export interface BucketPruneAnalysis {
  allFilesCount: number;
  registeredFirmas: string[];
  siteDetails: SitePruneDetail[];
  filesToKeep: {
    name: string;
    path: string;
    size?: number;
    url: string;
    matchedFirma: string;
    matchedSites: string[];
  }[];
  filesToDelete: {
    name: string;
    path: string;
    size?: number;
    url: string;
  }[];
}

/**
 * Recursively list all files in CARIFATURALAR bucket
 */
export async function listAllBucketFilesRecursively(
  folder = ''
): Promise<{ name: string; path: string; size?: number }[]> {
  const { data, error } = await primaryClient.storage
    .from(CARIFATURALAR_BUCKET)
    .list(folder, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });

  if (error || !data) {
    console.warn('Error listing bucket folder:', folder, error);
    return [];
  }

  let result: { name: string; path: string; size?: number }[] = [];

  for (const item of data) {
    if (!item.name || item.name.startsWith('.')) continue;

    const fullPath = folder ? `${folder}/${item.name}` : item.name;

    // Supabase folders have null id or null metadata
    if (item.id === null || item.metadata === null) {
      const subFiles = await listAllBucketFilesRecursively(fullPath);
      result = result.concat(subFiles);
    } else {
      result.push({
        name: item.name,
        path: fullPath,
        size: item.metadata?.size
      });
    }
  }

  return result;
}

/**
 * Scan all registered company names from the specified 6+ sites
 * (Arnavutköy, Mamak-Ankara, Şenbay-Özka, Merkez Özka, MSB Özka, Seka, Diğer)
 * both from Talep & Ödeme tables, and determine filesToKeep vs filesToDelete.
 */
export async function scanBucketFilesForPruning(): Promise<BucketPruneAnalysis> {
  const { SITES, ODENECEK_SITES } = await import('../types');
  const { getFirmaUnvani } = await import('./recordUtils');

  const siteMap = new Map<
    string,
    {
      siteKey: string;
      siteName: string;
      tableLabel: string;
      talepTableName: string;
      odemeTableName: string;
      firmas: Set<string>;
    }
  >();

  // Standardize site table labels as explicitly requested by user
  const SITE_LABELS: Record<string, string> = {
    arnavutkoy: 'ARNAVUTKÖY — TALEP & ÖDEME TABLOSU',
    mamak: 'MAMAK-ANKARA — TALEP & ÖDEME TABLOSU',
    senbay_ozka: 'ŞENBAY-ÖZKA — TALEP & ÖDEME TABLOSU',
    merkez_ozka: 'MERKEZ ÖZKA — TALEP & ÖDEME TABLOSU',
    msb_ozka: 'MSB ÖZKA — TALEP & ÖDEME TABLOSU',
    seka: 'SEKA — TALEP & ÖDEME TABLOSU',
    diger: 'DİĞER — TALEP & ÖDEME TABLOSU'
  };

  // Initialize site map
  for (const s of SITES) {
    const o = ODENECEK_SITES.find((os) => os.id === s.id);
    siteMap.set(s.id, {
      siteKey: s.id,
      siteName: s.name,
      tableLabel: SITE_LABELS[s.id] || `${s.name} — TALEP & ÖDEME TABLOSU`,
      talepTableName: s.tableName,
      odemeTableName: o ? o.tableName : `${s.id}_odenecek`,
      firmas: new Set<string>()
    });
  }

  // 1. Gather firmas from all SITES (talep tables)
  await Promise.all(
    SITES.map(async (s) => {
      try {
        const { data } = await supabase.from(s.tableName).select('*');
        if (data && Array.isArray(data)) {
          const entry = siteMap.get(s.id);
          data.forEach((r) => {
            const f = getFirmaUnvani(r);
            if (f && f !== '-' && f.trim()) {
              entry?.firmas.add(f.trim());
            }
          });
        }
      } catch (err) {
        console.warn(`Error reading table ${s.tableName}:`, err);
      }
    })
  );

  // 2. Gather firmas from all ODENECEK_SITES (odenecek tables & odenenler)
  await Promise.all(
    ODENECEK_SITES.map(async (s) => {
      const entry = siteMap.get(s.id);
      try {
        const { data: odenecekData } = await supabase.from(s.tableName).select('*');
        if (odenecekData && Array.isArray(odenecekData)) {
          odenecekData.forEach((r) => {
            const f = getFirmaUnvani(r);
            if (f && f !== '-' && f.trim()) {
              entry?.firmas.add(f.trim());
            }
          });
        }
      } catch (err) {
        console.warn(`Error reading table ${s.tableName}:`, err);
      }

      if (s.odenenlerTableName) {
        try {
          const { data: odenenlerData } = await supabase.from(s.odenenlerTableName).select('*');
          if (odenenlerData && Array.isArray(odenenlerData)) {
            odenenlerData.forEach((r) => {
              const f = getFirmaUnvani(r);
              if (f && f !== '-' && f.trim()) {
                entry?.firmas.add(f.trim());
              }
            });
          }
        } catch {
          // ignore if table doesn't exist
        }
      }
    })
  );

  // Build aggregate registered firmas and per-firma site associations
  const allFirmasSet = new Set<string>();
  const firmaToSites = new Map<string, Set<string>>();

  for (const entry of siteMap.values()) {
    entry.firmas.forEach((f) => {
      allFirmasSet.add(f);
      if (!firmaToSites.has(f)) {
        firmaToSites.set(f, new Set());
      }
      firmaToSites.get(f)?.add(entry.tableLabel);
    });
  }

  const registeredFirmas = Array.from(allFirmasSet).sort((a, b) => a.localeCompare(b, 'tr'));

  // 3. List all files recursively from CARIFATURALAR
  const allBucketFiles = await listAllBucketFilesRecursively();

  const filesToKeep: BucketPruneAnalysis['filesToKeep'] = [];
  const filesToDelete: BucketPruneAnalysis['filesToDelete'] = [];

  const siteProtectedCounts = new Map<string, number>();

  for (const file of allBucketFiles) {
    let matchedFirma: string | null = null;

    for (const firma of registeredFirmas) {
      if (doesFileMatchFirma(file.name, firma)) {
        matchedFirma = firma;
        break;
      }
    }

    const publicUrl = `${PRIMARY_STORAGE_URL}/storage/v1/object/public/${CARIFATURALAR_BUCKET}/${encodeURIComponent(
      file.path
    )}`;

    if (matchedFirma) {
      const sites = Array.from(firmaToSites.get(matchedFirma) || []);
      sites.forEach((siteLabel) => {
        siteProtectedCounts.set(siteLabel, (siteProtectedCounts.get(siteLabel) || 0) + 1);
      });

      filesToKeep.push({
        name: file.name,
        path: file.path,
        size: file.size,
        url: publicUrl,
        matchedFirma,
        matchedSites: sites.length > 0 ? sites : ['GENEL TALEP & ÖDEME']
      });
    } else {
      filesToDelete.push({
        name: file.name,
        path: file.path,
        size: file.size,
        url: publicUrl
      });
    }
  }

  // Format site details
  const siteDetails: SitePruneDetail[] = Array.from(siteMap.values()).map((s) => ({
    siteKey: s.siteKey,
    siteName: s.siteName,
    tableLabel: s.tableLabel,
    talepTableName: s.talepTableName,
    odemeTableName: s.odemeTableName,
    firmas: Array.from(s.firmas).sort((a, b) => a.localeCompare(b, 'tr')),
    protectedFilesCount: siteProtectedCounts.get(s.tableLabel) || 0
  }));

  return {
    allFilesCount: allBucketFiles.length,
    registeredFirmas,
    siteDetails,
    filesToKeep,
    filesToDelete
  };
}

/**
 * Permanently delete unmatched files from CARIFATURALAR bucket.
 * Supports passing an optional serviceRoleKey or custom secret key to bypass RLS if anon key lacks DELETE policy.
 */
export async function deleteUnmatchedBucketFiles(
  filePaths: string[],
  onProgress?: (deleted: number, total: number) => void,
  customKey?: string
): Promise<{ success: boolean; deletedCount: number; errors: any[] }> {
  // Clean paths to ensure no leading slash and no empty strings
  const cleanPaths = filePaths
    .map((p) => p.replace(/^\/+/, '').trim())
    .filter(Boolean);

  const total = cleanPaths.length;
  let deletedCount = 0;
  const errors: any[] = [];

  // Determine client: if customKey provided, use it
  const clientToUse = customKey && customKey.trim().length > 10
    ? createClient(PRIMARY_STORAGE_URL, customKey.trim())
    : primaryClient;

  // Batch delete in chunks of 25
  const chunkSize = 25;
  for (let i = 0; i < total; i += chunkSize) {
    const chunk = cleanPaths.slice(i, i + chunkSize);
    try {
      const { data, error } = await clientToUse.storage
        .from(CARIFATURALAR_BUCKET)
        .remove(chunk);

      console.log('Storage remove response:', { chunk, data, error });

      if (error) {
        console.warn('Storage remove error:', error);
        errors.push({
          chunk,
          message: error.message || 'Silme işlemi reddedildi'
        });
      } else if (Array.isArray(data)) {
        if (data.length === 0 && chunk.length > 0) {
          // Supabase returned 200 OK with empty array -> RLS DELETE policy rejected the deletion!
          console.warn('Supabase RLS policy blocked delete for chunk:', chunk);
          errors.push({
            chunk,
            message: 'Supabase Storage RLS Yetki Hatası: CARIFATURALAR deposunda anon anahtarı için DELETE (silme) yetki kuralı bulunmuyor.'
          });
        } else {
          deletedCount += data.length;
        }
      }
    } catch (err: any) {
      console.error('Storage delete exception:', err);
      errors.push({ chunk, message: err?.message || 'Silme istisnası' });
    }

    if (onProgress) {
      onProgress(Math.min(deletedCount, total), total);
    }
  }

  // Clear cache completely
  invalidateBucketCache();

  return {
    success: errors.length === 0 && deletedCount > 0,
    deletedCount,
    errors
  };
}

export interface OdenmesinFirmaInfo {
  firma: string;
  tables: string[];
  recordCount: number;
}

export interface OdenmesinPruneAnalysis {
  allFilesCount: number;
  odenmesinFirmas: OdenmesinFirmaInfo[];
  filesToKeep: {
    name: string;
    path: string;
    size?: number;
    url: string;
    matchedFirma: string;
    matchedTables: string[];
  }[];
  filesToDelete: {
    name: string;
    path: string;
    size?: number;
    url: string;
  }[];
}

/**
 * Scan all tables in Bayburt Özka portal for records where durum is 'ÖDENMESİN'.
 * Documents in CARIFATURALAR that match any of these ÖDENMESİN companies MUST NOT BE DELETED (SİLMESİN).
 * All other documents in CARIFATURALAR are marked for deletion.
 */
export async function scanBucketFilesForOdenmesinPruning(): Promise<OdenmesinPruneAnalysis> {
  const { SITES, ODENECEK_SITES } = await import('../types');
  const { getFirmaUnvani, getRecordStatus } = await import('./recordUtils');

  const SITE_NAMES: Record<string, string> = {
    arnavutkoy: 'ARNAVUTKÖY',
    mamak: 'MAMAK-ANKARA',
    senbay_ozka: 'ŞENBAY-ÖZKA',
    merkez_ozka: 'MERKEZ ÖZKA',
    msb_ozka: 'MSB ÖZKA',
    seka: 'SEKA',
    diger: 'DİĞER'
  };

  const odenmesinMap = new Map<string, { tables: Set<string>; count: number }>();

  const processRows = (rows: any[], tableLabel: string) => {
    if (!Array.isArray(rows)) return;
    for (const r of rows) {
      const status = getRecordStatus(r);
      if (status === 'ÖDENMESİN') {
        const firma = getFirmaUnvani(r);
        if (firma && firma !== '-' && firma.trim()) {
          const trimmedFirma = firma.trim();
          if (!odenmesinMap.has(trimmedFirma)) {
            odenmesinMap.set(trimmedFirma, { tables: new Set(), count: 0 });
          }
          const entry = odenmesinMap.get(trimmedFirma)!;
          entry.tables.add(tableLabel);
          entry.count++;
        }
      }
    }
  };

  // 1. Scan Talep tables
  await Promise.all(
    SITES.map(async (s) => {
      try {
        const { data } = await supabase.from(s.tableName).select('*');
        if (data) {
          const siteName = SITE_NAMES[s.id] || s.name;
          processRows(data, `${siteName} (Talep Tablosu)`);
        }
      } catch (err) {
        console.warn(`Error querying ${s.tableName}:`, err);
      }
    })
  );

  // 2. Scan Ödenecek & Ödenenler tables
  await Promise.all(
    ODENECEK_SITES.map(async (s) => {
      const siteName = SITE_NAMES[s.id] || s.name;
      try {
        const { data: odenecekData } = await supabase.from(s.tableName).select('*');
        if (odenecekData) {
          processRows(odenecekData, `${siteName} (Ödenecek Tablosu)`);
        }
      } catch (err) {
        console.warn(`Error querying ${s.tableName}:`, err);
      }

      if (s.odenenlerTableName) {
        try {
          const { data: odenenlerData } = await supabase.from(s.odenenlerTableName).select('*');
          if (odenenlerData) {
            processRows(odenenlerData, `${siteName} (Ödenenler Tablosu)`);
          }
        } catch {
          // ignore
        }
      }
    })
  );

  const odenmesinFirmas: OdenmesinFirmaInfo[] = Array.from(odenmesinMap.entries())
    .map(([firma, info]) => ({
      firma,
      tables: Array.from(info.tables),
      recordCount: info.count
    }))
    .sort((a, b) => a.firma.localeCompare(b.firma, 'tr'));

  // 3. List all files recursively from CARIFATURALAR bucket
  const allBucketFiles = await listAllBucketFilesRecursively();

  const filesToKeep: OdenmesinPruneAnalysis['filesToKeep'] = [];
  const filesToDelete: OdenmesinPruneAnalysis['filesToDelete'] = [];

  for (const file of allBucketFiles) {
    let matchedFirma: string | null = null;
    let matchedTables: string[] = [];

    // Check against all ÖDENMESİN companies
    for (const odenFirma of odenmesinFirmas) {
      if (doesFileMatchFirma(file.name, odenFirma.firma)) {
        matchedFirma = odenFirma.firma;
        matchedTables = odenFirma.tables;
        break;
      }
    }

    const publicUrl = `${PRIMARY_STORAGE_URL}/storage/v1/object/public/${CARIFATURALAR_BUCKET}/${encodeURIComponent(
      file.path
    )}`;

    if (matchedFirma) {
      filesToKeep.push({
        name: file.name,
        path: file.path,
        size: file.size,
        url: publicUrl,
        matchedFirma,
        matchedTables
      });
    } else {
      filesToDelete.push({
        name: file.name,
        path: file.path,
        size: file.size,
        url: publicUrl
      });
    }
  }

  return {
    allFilesCount: allBucketFiles.length,
    odenmesinFirmas,
    filesToKeep,
    filesToDelete
  };
}

