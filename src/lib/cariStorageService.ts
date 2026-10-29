import { supabase } from './supabase';
import * as XLSX from 'xlsx';

export interface ParsedCariRecord {
  id: string | number;
  cariKodu?: string;
  firmaUnvani: string;
  borc: number;
  alacak: number;
  bakiye: number;
  bakiyeTuru: 'BORÇLU' | 'ALACAKLI' | 'BAKİYESİZ';
  hamSatir?: Record<string, any>;
}

export interface CariFileMetadata {
  name: string;
  bucket: string;
  size?: number;
  updated_at?: string;
  recordCount: number;
}

export interface CariMatchResult {
  matched: boolean;
  cariRecord?: ParsedCariRecord;
  status: 'BORÇLU' | 'ALACAKLI' | 'BAKİYESİZ' | 'BULUNAMADI';
  bakiyeText: string;
  amount: number;
  rawDetails?: string;
}

export const SITE_CARI_BUCKET_MAP: Record<string, string> = {
  arnavutkoy: 'ARNAVUTKOYCARILER',
  mamak: 'MAMAKCARILER',
  senbay_ozka: 'BURSACARILER',
  merkez_ozka: 'MERKEZOZKACARILER',
  msb_ozka: 'MSBCARILER',
  seka: 'SEKACARILER',
  diger: 'DIGERCARILER'
};

/**
 * Normalizes text for reliable Turkish supplier name matching
 */
export function normalizeTurkishText(text: string): string {
  if (!text) return '';
  return text
    .toLocaleLowerCase('tr-TR')
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
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
    .replace(/[^a-z0-9ıöüçğş]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Removes standard company suffixes to get the core company identity
 */
export function getCoreCompanyName(name: string): string {
  const norm = normalizeTurkishText(name);
  const stopWords = [
    'sanayi ve ticaret limited sirketi',
    'sanayi ve ticaret anonim sirketi',
    'san ve tic ltd sti',
    'san tic ltd sti',
    'san tic a s',
    'san ve tic a s',
    'insaat taahhut',
    'ltd sti',
    'ltd',
    'sti',
    'a s',
    'as',
    'sanayi',
    'ticaret',
    'insaat',
    'nakliyat',
    'hafriyat',
    'otomotiv',
    'madencilik',
    'muhendislik',
    'mimarlik',
    'gida',
    'petrol',
    'lojistik',
    'san',
    'tic',
    'ins',
    'nak'
  ];

  let cleaned = norm;
  for (const sw of stopWords) {
    const reg = new RegExp(`\\b${sw}\\b`, 'g');
    cleaned = cleaned.replace(reg, ' ');
  }
  return cleaned.replace(/\s+/g, ' ').trim();
}

/**
 * Checks if a string contains alphabetical letters (Turkish + Latin)
 */
export function hasAlphabeticalLetters(val: any): boolean {
  if (val === null || val === undefined) return false;
  const str = String(val).trim();
  return /[a-zA-ZçğıöşüÇĞİÖŞÜ]/.test(str);
}

/**
 * Parse numeric values safely from Excel cells (supports "1.234,56", "1,234.56", currency symbols)
 */
export function parseExcelNumber(val: any): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;

  let str = String(val).trim().replace(/[₺$€TL\s]/gi, '');
  if (!str) return 0;

  // If text contains pure letters (like company name), it's not a number
  if (/[a-zA-ZçğıöşüÇĞİÖŞÜ]/.test(str) && !/^[0-9.,\s+-]+$/.test(str)) {
    return 0;
  }

  // Check Turkish thousand separator (1.234,56)
  if (str.includes('.') && str.includes(',')) {
    if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
      // 1.234,56 -> 1234.56
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      // 1,234.56 -> 1234.56
      str = str.replace(/,/g, '');
    }
  } else if (str.includes(',')) {
    // 1234,56 -> 1234.56
    str = str.replace(',', '.');
  }

  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Parse raw XLSX ArrayBuffer into structured Cari records
 */
export function parseCariWorkbook(dataBuffer: ArrayBuffer | Uint8Array): ParsedCariRecord[] {
  const workbook = XLSX.read(dataBuffer, { type: 'array' });
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    return [];
  }

  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) return [];

  // 1. Parse raw grid 2D array to find actual header row anywhere in top 30 rows
  const rawGrid: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  if (!rawGrid || rawGrid.length === 0) return [];

  let headerRowIdx = -1;
  let maxHeaderScore = 0;

  for (let r = 0; r < Math.min(rawGrid.length, 30); r++) {
    const row = rawGrid[r];
    if (!Array.isArray(row)) continue;

    let score = 0;
    row.forEach((cell) => {
      const norm = normalizeTurkishText(String(cell || ''));
      if (!norm) return;
      if (norm.includes('unvan') || norm.includes('firma') || norm.includes('cari adi') || norm.includes('hesap adi')) {
        score += 15;
      }
      if (norm.includes('borc')) score += 10;
      if (norm.includes('alacak')) score += 10;
      if (norm.includes('bakiye')) score += 10;
      if (norm.includes('cari kod') || norm.includes('hesap kod') || norm === 'kod') score += 5;
    });

    if (score > maxHeaderScore) {
      maxHeaderScore = score;
      headerRowIdx = r;
    }
  }

  let unvanCol = -1;
  let kodCol = -1;
  let borcCol = -1;
  let alacakCol = -1;
  let bakiyeCol = -1;
  let bakiyeTurCol = -1;

  if (headerRowIdx !== -1 && maxHeaderScore >= 15) {
    const hRow = rawGrid[headerRowIdx];
    hRow.forEach((cell, colIdx) => {
      const norm = normalizeTurkishText(String(cell || ''));
      if (!norm) return;

      // Check Borç (must not be Borç Bakiye)
      if (norm.includes('borc') && !norm.includes('bakiye') && borcCol === -1) {
        borcCol = colIdx;
        return;
      }

      // Check Alacak (must not be Alacak Bakiye)
      if (norm.includes('alacak') && !norm.includes('bakiye') && alacakCol === -1) {
        alacakCol = colIdx;
        return;
      }

      // Check Bakiye
      if ((norm.includes('bakiye') || norm.includes('kalan') || norm.includes('net')) && bakiyeCol === -1) {
        bakiyeCol = colIdx;
        return;
      }

      // Check B/A or Bakiye Türü
      if (
        (norm.includes('tur') || norm.includes('tip') || norm === 'b a' || norm === 'b/a' || norm.includes('durum')) &&
        bakiyeTurCol === -1
      ) {
        bakiyeTurCol = colIdx;
        return;
      }

      // Check Cari Kodu
      if (
        (norm.includes('cari kod') || norm.includes('hesap kod') || norm === 'kod' || norm.includes('hesap no')) &&
        !norm.includes('unvan') &&
        !norm.includes('ad') &&
        kodCol === -1
      ) {
        kodCol = colIdx;
        return;
      }

      // Check Unvan / Firma / Cari Adı / Açıklama
      if (
        (norm.includes('unvan') ||
          norm.includes('firma') ||
          norm.includes('cari adi') ||
          norm.includes('hesap adi') ||
          norm.includes('musteri') ||
          norm.includes('tedarikci') ||
          norm.includes('aciklama') ||
          norm === 'cari') &&
        !norm.includes('kod') &&
        !norm.includes('borc') &&
        !norm.includes('alacak') &&
        !norm.includes('bakiye') &&
        unvanCol === -1
      ) {
        unvanCol = colIdx;
      }
    });
  }

  // 2. Data rows start after header row (or 0 if no header row)
  const dataStartRow = headerRowIdx !== -1 ? headerRowIdx + 1 : 0;
  const sampleRows = rawGrid.slice(dataStartRow, dataStartRow + 50);

  // If unvanCol is still not found or invalid, find column with most text/letters
  if (unvanCol === -1 && sampleRows.length > 0) {
    const maxCols = Math.max(...sampleRows.map((r) => (Array.isArray(r) ? r.length : 0)));
    let bestTextCol = -1;
    let maxLettersScore = 0;

    for (let c = 0; c < maxCols; c++) {
      let lettersCount = 0;
      sampleRows.forEach((r) => {
        const val = r[c];
        if (hasAlphabeticalLetters(val) && String(val).trim().length > 3) {
          lettersCount++;
        }
      });
      if (lettersCount > maxLettersScore) {
        maxLettersScore = lettersCount;
        bestTextCol = c;
      }
    }
    if (bestTextCol !== -1) {
      unvanCol = bestTextCol;
    }
  }

  const parsedList: ParsedCariRecord[] = [];
  let recordCounter = 1;

  for (let r = dataStartRow; r < rawGrid.length; r++) {
    const row = rawGrid[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    // Extract unvan candidate
    let unvan = unvanCol !== -1 && row[unvanCol] !== undefined ? String(row[unvanCol]).trim() : '';

    // If unvan candidate is purely numeric or empty, find the best text cell in this row!
    if (!hasAlphabeticalLetters(unvan) || /^[0-9.,\s₺$€+-]+$/.test(unvan)) {
      // Look for any cell with alphabetical letters
      for (let c = 0; c < row.length; c++) {
        if (c === borcCol || c === alacakCol || c === bakiyeCol || c === kodCol) continue;
        const cellVal = String(row[c] || '').trim();
        if (hasAlphabeticalLetters(cellVal) && cellVal.length >= 2) {
          unvan = cellVal;
          break;
        }
      }
    }

    if (!unvan || !hasAlphabeticalLetters(unvan)) {
      continue;
    }

    const normUnvan = normalizeTurkishText(unvan);
    if (
      normUnvan === 'toplam' ||
      normUnvan === 'genel toplam' ||
      normUnvan === 'devir' ||
      normUnvan === 'devir toplami' ||
      normUnvan.includes('toplam:') ||
      normUnvan.startsWith('rapor tarihi')
    ) {
      continue;
    }

    const kod = kodCol !== -1 && row[kodCol] !== undefined ? String(row[kodCol]).trim() : undefined;
    const borcVal = borcCol !== -1 ? parseExcelNumber(row[borcCol]) : 0;
    const alacakVal = alacakCol !== -1 ? parseExcelNumber(row[alacakCol]) : 0;

    let bakiyeVal = bakiyeCol !== -1 ? parseExcelNumber(row[bakiyeCol]) : 0;
    let bakiyeTuruStr =
      bakiyeTurCol !== -1 && row[bakiyeTurCol] !== undefined
        ? String(row[bakiyeTurCol]).trim().toUpperCase()
        : '';

    const bakiyeRawStr =
      bakiyeCol !== -1 && row[bakiyeCol] !== undefined ? String(row[bakiyeCol]).trim().toUpperCase() : '';

    // Calculate balance if not explicitly given
    if (bakiyeCol === -1 && (borcCol !== -1 || alacakCol !== -1)) {
      bakiyeVal = Math.abs(alacakVal - borcVal);
    }

    // Determine Borçlu / Alacaklı status
    let bakiyeTuru: 'BORÇLU' | 'ALACAKLI' | 'BAKİYESİZ' = 'BAKİYESİZ';

    if (
      bakiyeTuruStr.includes('BORÇ') ||
      bakiyeTuruStr.includes('BORC') ||
      bakiyeTuruStr === 'B' ||
      bakiyeTuruStr.startsWith('(B)') ||
      bakiyeRawStr.includes('(B)') ||
      bakiyeRawStr.includes('BORÇ') ||
      bakiyeRawStr.includes('BORC')
    ) {
      bakiyeTuru = 'BORÇLU';
    } else if (
      bakiyeTuruStr.includes('ALACAK') ||
      bakiyeTuruStr === 'A' ||
      bakiyeTuruStr.startsWith('(A)') ||
      bakiyeRawStr.includes('(A)') ||
      bakiyeRawStr.includes('ALACAK')
    ) {
      bakiyeTuru = 'ALACAKLI';
    } else if (alacakVal > borcVal) {
      bakiyeTuru = 'ALACAKLI';
    } else if (borcVal > alacakVal) {
      bakiyeTuru = 'BORÇLU';
    } else if (bakiyeVal > 0) {
      bakiyeTuru = 'ALACAKLI';
    } else {
      bakiyeTuru = 'BAKİYESİZ';
    }

    parsedList.push({
      id: recordCounter++,
      cariKodu: kod,
      firmaUnvani: unvan,
      borc: borcVal,
      alacak: alacakVal,
      bakiye: Math.abs(bakiyeVal),
      bakiyeTuru,
      hamSatir: { row }
    });
  }

  return parsedList;
}

/**
 * Fetch XLSX files from a specific Supabase storage bucket
 */
export async function fetchCariFileFromBucket(
  bucketName: string
): Promise<{ records: ParsedCariRecord[]; metadata: CariFileMetadata | null; error: string | null }> {
  try {
    // 1. List files in bucket
    const { data: files, error: listErr } = await supabase.storage.from(bucketName).list('', {
      limit: 100,
      sortBy: { column: 'updated_at', order: 'desc' }
    });

    if (listErr) {
      return {
        records: [],
        metadata: null,
        error: `Bucket '${bucketName}' listelenemedi: ${listErr.message}`
      };
    }

    if (!files || files.length === 0) {
      return {
        records: [],
        metadata: null,
        error: `Bucket '${bucketName}' içinde dosya bulunamadı.`
      };
    }

    // 2. Find xlsx / xls file (take latest)
    const excelFile = files.find(
      (f) =>
        f.name.toLowerCase().endsWith('.xlsx') ||
        f.name.toLowerCase().endsWith('.xls') ||
        f.name.toLowerCase().endsWith('.csv')
    );

    if (!excelFile) {
      return {
        records: [],
        metadata: null,
        error: `Bucket '${bucketName}' içinde .xlsx veya .xls dosyası bulunamadı.`
      };
    }

    // 3. Download file
    const { data: blobData, error: downloadErr } = await supabase.storage
      .from(bucketName)
      .download(excelFile.name);

    if (downloadErr || !blobData) {
      return {
        records: [],
        metadata: null,
        error: `Dosya indirilemedi (${excelFile.name}): ${downloadErr?.message || 'Bilinmeyen hata'}`
      };
    }

    // 4. Parse workbook
    const arrayBuffer = await blobData.arrayBuffer();
    const parsedRecords = parseCariWorkbook(arrayBuffer);

    const metadata: CariFileMetadata = {
      name: excelFile.name,
      bucket: bucketName,
      size: (excelFile as any).metadata?.size || blobData.size,
      updated_at: excelFile.updated_at || (excelFile as any).created_at,
      recordCount: parsedRecords.length
    };

    return {
      records: parsedRecords,
      metadata,
      error: null
    };
  } catch (err: any) {
    return {
      records: [],
      metadata: null,
      error: `Cari dosyası işlenirken hata: ${err.message}`
    };
  }
}

/**
 * Match a Talep record's firma unvanı with parsed cari records
 */
export function matchCariStatus(
  firmaUnvani: string,
  cariRecords: ParsedCariRecord[]
): CariMatchResult {
  if (!firmaUnvani || !cariRecords || cariRecords.length === 0) {
    return {
      matched: false,
      status: 'BULUNAMADI',
      bakiyeText: '-',
      amount: 0
    };
  }

  const rawSearch = firmaUnvani.trim();
  const normSearch = normalizeTurkishText(rawSearch);
  const coreSearch = getCoreCompanyName(rawSearch);

  if (!normSearch || normSearch === '-') {
    return {
      matched: false,
      status: 'BULUNAMADI',
      bakiyeText: '-',
      amount: 0
    };
  }

  // 1. Exact or normalized exact match
  let found = cariRecords.find((c) => {
    const normC = normalizeTurkishText(c.firmaUnvani);
    return normC === normSearch;
  });

  // 2. Core name exact match
  if (!found && coreSearch.length >= 3) {
    found = cariRecords.find((c) => {
      const coreC = getCoreCompanyName(c.firmaUnvani);
      return coreC === coreSearch;
    });
  }

  // 3. Substring match
  if (!found && normSearch.length >= 4) {
    found = cariRecords.find((c) => {
      const normC = normalizeTurkishText(c.firmaUnvani);
      return normC.includes(normSearch) || normSearch.includes(normC);
    });
  }

  // 4. Core Substring match
  if (!found && coreSearch.length >= 4) {
    found = cariRecords.find((c) => {
      const coreC = getCoreCompanyName(c.firmaUnvani);
      return coreC.includes(coreSearch) || coreSearch.includes(coreC);
    });
  }

  // 5. Significant word token match
  if (!found && coreSearch.length >= 4) {
    const searchTokens = coreSearch.split(' ').filter((t) => t.length >= 4);
    if (searchTokens.length > 0) {
      found = cariRecords.find((c) => {
        const normC = normalizeTurkishText(c.firmaUnvani);
        return searchTokens.every((token) => normC.includes(token));
      });
    }
  }

  if (found) {
    return {
      matched: true,
      cariRecord: found,
      status: found.bakiyeTuru,
      amount: found.bakiye,
      bakiyeText: `${found.bakiyeTuru}: ${new Intl.NumberFormat('tr-TR', {
        style: 'currency',
        currency: 'TRY'
      }).format(found.bakiye)}`,
      rawDetails: `Borç: ${new Intl.NumberFormat('tr-TR', {
        style: 'currency',
        currency: 'TRY'
      }).format(found.borc)} | Alacak: ${new Intl.NumberFormat('tr-TR', {
        style: 'currency',
        currency: 'TRY'
      }).format(found.alacak)}`
    };
  }

  return {
    matched: false,
    status: 'BULUNAMADI',
    bakiyeText: 'Cari Kaydı Bulunamadı',
    amount: 0
  };
}
