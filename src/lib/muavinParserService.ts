import * as pdfjsLib from 'pdfjs-dist';
import preparsedData from './preparsedMuavinData.json';
import { supabase } from './supabase';
import { ParsedCariRecord } from './cariStorageService';

// PDF.js worker setup
function getPdfLib(): any {
  if ((pdfjsLib as any).getDocument) return pdfjsLib;
  if ((pdfjsLib as any).default?.getDocument) return (pdfjsLib as any).default;
  if (typeof window !== 'undefined' && (window as any).pdfjsLib?.getDocument) {
    return (window as any).pdfjsLib;
  }
  return (pdfjsLib as any).default || pdfjsLib;
}

try {
  const lib = getPdfLib();
  if (lib?.GlobalWorkerOptions && !lib.GlobalWorkerOptions.workerSrc) {
    lib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
  }
} catch (e) {
  // Silent fallback
}

export interface MuavinCariRecord extends ParsedCariRecord {
  hesapKodu?: string;
  page?: number;
  lastPage?: number;
}

// In-memory cache
const memoryCache: Record<string, MuavinCariRecord[]> = {};

// Site key normalization
export function mapSiteKeyToMuavinFolder(siteKey: string): string {
  const s = (siteKey || '').toLowerCase();
  if (s.includes('arnavut')) return 'ARNAVUTKOY';
  if (s.includes('mamak')) return 'MAMAK';
  if (s.includes('senbay') || s.includes('bursa')) return 'SENBAY';
  if (s.includes('merkez') || s.includes('ozka') || s === 'ozka') return 'OZKA';
  if (s.includes('msb')) return 'MSB';
  if (s.includes('seka')) return 'SEKA';
  if (s.includes('diger') || s.includes('diğer')) return 'DIGER';
  return 'ARNAVUTKOY';
}

/**
 * Text normalization for Turkish accounting firm names
 */
export function normalizeTurkishText(text: string): string {
  if (!text) return '';
  return text
    .toLocaleUpperCase('tr-TR')
    .replace(/İ/g, 'I')
    .replace(/I/g, 'I')
    .replace(/Ğ/g, 'G')
    .replace(/Ü/g, 'U')
    .replace(/Ş/g, 'S')
    .replace(/Ö/g, 'O')
    .replace(/Ç/g, 'C')
    .replace(/[\.\,\-\_\/\(\)\'\"\:\;\*\+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Strips common Turkish corporate suffixes (LTD, ŞTİ, A.Ş., İNŞAAT, SANAYİ, TİCARET, vb.)
 */
export function getCoreCompanyName(text: string): string {
  const norm = normalizeTurkishText(text);
  const wordsToRemove = [
    'LTD',
    'STI',
    'SIRKETI',
    'A S',
    'AS',
    'ANONIM',
    'LIMITED',
    'TIC',
    'TICARET',
    'SAN',
    'SANAYI',
    'INS',
    'INSAAT',
    'GIDA',
    'NAK',
    'NAKLIYAT',
    'MUH',
    'MUHENDISLIK',
    'MIM',
    'MIMARLIK',
    'MAD',
    'MADENCILIK',
    'PETROL',
    'OTOMOTIV',
    'TAAHHUT',
    'PAZARLAMA',
    'ITHALAT',
    'IHRACAT',
    'IS ORTAKLIGI',
    'ADI ORTAKLIK'
  ];

  let cleaned = ` ${norm} `;
  for (const word of wordsToRemove) {
    const regex = new RegExp(`\\b${word}\\b`, 'g');
    cleaned = cleaned.replace(regex, ' ');
  }
  return cleaned.replace(/\s+/g, ' ').trim();
}

/**
 * Dynamically parses a PDF file from a Uint8Array buffer
 */
export async function parsePdfMuavinAccounts(arrayBuffer: ArrayBuffer): Promise<MuavinCariRecord[]> {
  const lib = getPdfLib();
  const loadingTask = lib.getDocument({ data: new Uint8Array(arrayBuffer) });
  const doc = await loadingTask.promise;

  const accounts = new Map<string, MuavinCariRecord>();
  let currentHeader: { code: string; name: string; page: number } | null = null;

  for (let p = 1; p <= doc.numPages; p++) {
    try {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const str = tc.items.map((i: any) => i.str).join(' ');

      // Find account header
      const headerMatch = str.match(/((?:120|320)\.[\d\.]+)\s+([^0-9\n]{2,80}?)(?=\s+TARİH|\s+TİP|\s+Dönem|$)/);
      if (headerMatch) {
        currentHeader = {
          code: headerMatch[1].trim(),
          name: headerMatch[2].trim(),
          page: p
        };
      }

      // Find TOPLAM line
      const toplamMatch = str.match(/TOPLAM\s*:\s*([\d\.\,]+)\s+([\d\.\,]+)\s+([\d\.\,]+)\s*([AB]?)/);
      if (toplamMatch && currentHeader) {
        const borcStr = toplamMatch[1];
        const alacakStr = toplamMatch[2];
        const bakiyeStr = toplamMatch[3];
        const tur = (toplamMatch[4] || '').toUpperCase();

        const borcNum = parseFloat(borcStr.replace(/\./g, '').replace(',', '.')) || 0;
        const alacakNum = parseFloat(alacakStr.replace(/\./g, '').replace(',', '.')) || 0;
        const bakiyeNum = parseFloat(bakiyeStr.replace(/\./g, '').replace(',', '.')) || 0;

        let bakiyeTuru: 'BORÇLU' | 'ALACAKLI' | 'BAKİYESİZ' = 'BAKİYESİZ';
        if (tur === 'B') {
          bakiyeTuru = 'BORÇLU';
        } else if (tur === 'A') {
          bakiyeTuru = 'ALACAKLI';
        } else if (bakiyeNum > 0) {
          bakiyeTuru = 'ALACAKLI';
        }

        accounts.set(currentHeader.code, {
          id: currentHeader.code,
          cariKodu: currentHeader.code,
          hesapKodu: currentHeader.code,
          firmaUnvani: currentHeader.name,
          borc: borcNum,
          alacak: alacakNum,
          bakiye: bakiyeNum,
          bakiyeTuru,
          page: currentHeader.page,
          lastPage: p
        });
      }
    } catch (e) {
      console.warn(`Error parsing page ${p} of muavin:`, e);
    }
  }

  return Array.from(accounts.values());
}

/**
 * Returns the muavin cari records for a site, with instant pre-parsed fallback and storage caching
 */
export async function getMuavinCariRecordsForSite(siteKey: string): Promise<MuavinCariRecord[]> {
  const folder = mapSiteKeyToMuavinFolder(siteKey);

  // 1. Check memory cache
  if (memoryCache[folder] && memoryCache[folder].length > 0) {
    return memoryCache[folder];
  }

  // 2. Check localStorage cache
  try {
    const cached = localStorage.getItem(`muavin_records_${folder}`);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        memoryCache[folder] = parsed;
        return parsed;
      }
    }
  } catch (e) {
    // Ignore localStorage errors
  }

  // 3. Check pre-parsed JSON dataset (Arnavutkoy, Mamak, Senbay, Ozka)
  const pre = (preparsedData as any)[folder];
  if (pre && Array.isArray(pre) && pre.length > 0) {
    memoryCache[folder] = pre as MuavinCariRecord[];
    return pre as MuavinCariRecord[];
  }

  // 4. If folder is MSB, SEKA, DIGER or has a new file, try downloading from Supabase Storage
  try {
    const bucket = 'MUAVINLER';
    const { data: list } = await supabase.storage.from(bucket).list(folder, { limit: 10 });
    const pdfFile = list?.find((item) => item.name && item.name.toLowerCase().endsWith('.pdf'));

    if (pdfFile) {
      const { data: fileData, error } = await supabase.storage.from(bucket).download(`${folder}/${pdfFile.name}`);
      if (!error && fileData) {
        const buf = await fileData.arrayBuffer();
        const records = await parsePdfMuavinAccounts(buf);
        if (records.length > 0) {
          memoryCache[folder] = records;
          try {
            localStorage.setItem(`muavin_records_${folder}`, JSON.stringify(records));
          } catch (e) {
            // Ignore quota
          }
          return records;
        }
      }
    }
  } catch (err) {
    console.warn(`Could not load or parse dynamic muavin for ${folder}:`, err);
  }

  return [];
}

export interface MuavinMatchResult {
  matched: boolean;
  record?: MuavinCariRecord;
  status: 'BORÇLU' | 'ALACAKLI' | 'BAKİYESİZ' | 'BULUNAMADI';
  amount: number;
  page?: number;
  hesapKodu?: string;
  firmaUnvani?: string;
}

/**
 * Searches and matches a firm name against the site's muavin defteri records
 */
export function matchMuavinCari(searchName: string, records: MuavinCariRecord[]): MuavinMatchResult {
  if (!searchName || !records || records.length === 0) {
    return {
      matched: false,
      status: 'BULUNAMADI',
      amount: 0
    };
  }

  const normSearch = normalizeTurkishText(searchName);
  const coreSearch = getCoreCompanyName(searchName);

  if (!normSearch) {
    return {
      matched: false,
      status: 'BULUNAMADI',
      amount: 0
    };
  }

  // 1. Exact normalized match
  let found = records.find((r) => normalizeTurkishText(r.firmaUnvani) === normSearch);

  // 2. Core name exact match
  if (!found && coreSearch.length >= 3) {
    found = records.find((r) => getCoreCompanyName(r.firmaUnvani) === coreSearch);
  }

  // 3. Substring match
  if (!found && normSearch.length >= 4) {
    found = records.find((r) => {
      const normR = normalizeTurkishText(r.firmaUnvani);
      return normR.includes(normSearch) || normSearch.includes(normR);
    });
  }

  // 4. Core Substring match
  if (!found && coreSearch.length >= 4) {
    found = records.find((r) => {
      const coreR = getCoreCompanyName(r.firmaUnvani);
      return (coreR.length >= 4 && (coreR.includes(coreSearch) || coreSearch.includes(coreR)));
    });
  }

  // 5. Significant word token match
  if (!found && coreSearch.length >= 4) {
    const searchTokens = coreSearch.split(' ').filter((t) => t.length >= 4);
    if (searchTokens.length > 0) {
      found = records.find((r) => {
        const normR = normalizeTurkishText(r.firmaUnvani);
        return searchTokens.every((token) => normR.includes(token));
      });
    }
  }

  // 6. Two-word significant match (any 2 key words >= 5 chars)
  if (!found) {
    const keyWords = normSearch.split(' ').filter((t) => t.length >= 5);
    if (keyWords.length >= 2) {
      found = records.find((r) => {
        const normR = normalizeTurkishText(r.firmaUnvani);
        const matchCount = keyWords.filter((w) => normR.includes(w)).length;
        return matchCount >= 2;
      });
    }
  }

  if (found) {
    return {
      matched: true,
      record: found,
      status: found.bakiyeTuru,
      amount: found.bakiye,
      page: found.page,
      hesapKodu: found.hesapKodu,
      firmaUnvani: found.firmaUnvani
    };
  }

  return {
    matched: false,
    status: 'BULUNAMADI',
    amount: 0
  };
}
