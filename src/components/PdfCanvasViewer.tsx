import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Search,
  RefreshCw,
  ExternalLink,
  Download,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Check,
  XCircle,
  FileText,
  Sparkles,
  X
} from 'lucide-react';

// Configure PDF.js worker
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
  if (lib?.GlobalWorkerOptions) {
    // Same-origin worker served from public directory
    lib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
  }
} catch (e) {
  console.warn('PDF.js worker initialization notice:', e);
}

export type MatchTier = 'tam_ad' | '25_karakter' | '15_karakter' | '10_karakter';

interface PdfCanvasViewerProps {
  url: string;
  fileName?: string;
  initialSearchTerm?: string;
  onClose?: () => void;
  onSearchStatusChange?: (
    status: 'searching' | 'found' | 'not_found',
    count?: number,
    page?: number,
    matchTierLabel?: string
  ) => void;
}

interface SearchResult {
  pageNumber: number;
  snippet: string;
  isAccountHeader?: boolean;
  score: number;
  yRatio?: number;
  matchTier: MatchTier;
  matchTierLabel: string;
  matchedQuery: string;
}

interface CachedPageData {
  pageNumber: number;
  rawText: string;
  normTurkish: string;
  ascii: string;
  canon: string;
  compactAscii: string;
  compactTurkish: string;
  itemsPos: Array<{ str: string; yRatio: number }>;
  isAccountHeader: boolean;
}

// 1. Standard Turkish Lowercase Normalizer
function normalizeTurkish(text: string): string {
  if (!text) return '';
  return text
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .replace(/i̇/g, 'i')
    .toLocaleLowerCase('tr-TR')
    .replace(/[^a-z0-9ğüşıöç]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// 2. ASCII Fallback Normalizer (for PDFs with ASCII-encoded fonts)
function normalizeAscii(text: string): string {
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
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// 3. Turkish Commercial Title Canonicalizer (Standardizes corporate suffixes & expands abbreviations)
const COMMERCIAL_CANON_MAP: Record<string, string> = {
  san: 'sanayi',
  tic: 'ticaret',
  ltd: 'limited',
  sti: 'sirketi',
  as: 'anonim sirketi',
  ins: 'insaat',
  nak: 'nakliyat',
  nakliye: 'nakliyat',
  oto: 'otomotiv',
  muh: 'muhendislik',
  mad: 'madencilik',
  haf: 'hafriyat',
  hafr: 'hafriyat',
  paz: 'pazarlama',
  gid: 'gida',
  pet: 'petrol',
  tur: 'turizm',
  taah: 'taahhut'
};

function canonicalizeCommercialTitle(asciiText: string): string {
  if (!asciiText) return '';
  const words = asciiText.split(' ').filter((w) => w && w !== 've' && w !== 'ile');
  const mapped = words.map((w) => COMMERCIAL_CANON_MAP[w] || w);
  return mapped.join(' ');
}

// 4. Extract Distinctive Title Words (ensures full title phrases are matched)
function extractDistinctiveTitle(cleanQuery: string): {
  fullNameAscii: string;
  fullNameCanon: string;
  coreWords: string[];
  corePhrase: string;
} {
  const ascii = normalizeAscii(cleanQuery);
  const canon = canonicalizeCommercialTitle(ascii);

  // Common corporate legal forms to separate the core company name from legal type
  const corporateTerms = new Set([
    'sanayi', 'ticaret', 'limited', 'sirketi', 'anonim', 'insaat', 'nakliyat',
    'otomotiv', 'muhendislik', 'madencilik', 'hafriyat', 'pazarlama', 'gida',
    'petrol', 'turizm', 'taahhut', 've', 'ile', 'san', 'tic', 'ltd', 'sti',
    'as', 'ins', 'nak', 'oto', 'muh', 'haf', 'paz', 'gid', 'pet', 'tur'
  ]);

  const allWords = ascii.split(' ').filter((w) => w.length >= 2);
  const coreWords = allWords.filter((w) => !corporateTerms.has(w));

  // If all words happen to be corporate terms, use at least the first 2 words
  const finalCoreWords = coreWords.length > 0 ? coreWords : allWords.slice(0, 2);
  const corePhrase = finalCoreWords.join(' ');

  return {
    fullNameAscii: ascii,
    fullNameCanon: canon,
    coreWords: finalCoreWords,
    corePhrase
  };
}

export const PdfCanvasViewer: React.FC<PdfCanvasViewerProps> = ({
  url,
  fileName,
  initialSearchTerm,
  onSearchStatusChange
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const renderTaskRef = useRef<any>(null);

  // Stabilize external callbacks via ref to eliminate any possibility of re-render loops
  const onSearchStatusChangeRef = useRef(onSearchStatusChange);
  useEffect(() => {
    onSearchStatusChangeRef.current = onSearchStatusChange;
  }, [onSearchStatusChange]);

  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [pageInput, setPageInput] = useState<string>('1');
  // KULLANICI İSTEĞİ: PDF %200 Yakınlaştırma (Scale = 2.0)
  const [scale, setScale] = useState<number>(2.0);
  const [rotation, setRotation] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [rendering, setRendering] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [displayMode, setDisplayMode] = useState<'canvas' | 'embed'>('canvas');
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  // Arama Durumları
  const [searchTerm, setSearchTerm] = useState<string>(initialSearchTerm || '');
  const [searching, setSearching] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchProgress, setSearchProgress] = useState<string>('');
  const [showSearchPanel, setShowSearchPanel] = useState<boolean>(false);

  // Otomatik Cari Arama Bilgi Bildirimi
  const [autoSearchNotice, setAutoSearchNotice] = useState<{
    type: 'searching' | 'found' | 'not_found';
    message: string;
    pageNumber?: number;
    totalMatches?: number;
    matchTier?: MatchTier;
    matchTierLabel?: string;
    matchedQuery?: string;
  } | null>(null);

  // Vurgulanacak Cari Satırı Konumu (Sayfa ve Y-oranı)
  const [highlightTarget, setHighlightTarget] = useState<{ pageNumber: number; yRatio: number } | null>(null);

  // Sayfaya gitme fonksiyonu (isteğe bağlı Y-oranı ile satıra odaklanma)
  const goToPage = useCallback(
    (num: number, targetYRatio?: number) => {
      if (!pdfDoc) return;
      const clamped = Math.max(1, Math.min(totalPages, num));
      setCurrentPage(clamped);
      setPageInput(clamped.toString());
      if (targetYRatio !== undefined) {
        setHighlightTarget({ pageNumber: clamped, yRatio: targetYRatio });
      }
      if (containerRef.current && targetYRatio === undefined) {
        containerRef.current.scrollTop = 0;
      }
    },
    [pdfDoc, totalPages]
  );

  // KULLANICI İSTEĞİ:
  // CARİYİ ÖNCE TAM ADLA EŞLEŞTİREREK BUL, CARİ BULAMAZSA SIRASIYLA 25 KARAKTERLE, 15 KARAKTERLE, 10 KARAKTERLE BUL
  const executeSearch = useCallback(
    async (docInstance: any, queryStr: string, isAutoInitial: boolean = false) => {
      const cleanQuery = queryStr ? queryStr.replace(/^["'\s]+|["'\s]+$/g, '').trim() : '';
      if (!docInstance || !cleanQuery || cleanQuery === '-') return;

      setSearching(true);
      if (!isAutoInitial) {
        setShowSearchPanel(true);
      }
      setSearchResults([]);
      setHighlightTarget(null);
      setSearchProgress('Muavin defteri taranıyor...');
      onSearchStatusChangeRef.current?.('searching', 0);

      const raw25 = cleanQuery.slice(0, 25).trim();
      const raw15 = cleanQuery.slice(0, 15).trim();
      const raw10 = cleanQuery.slice(0, 10).trim();

      if (isAutoInitial) {
        setAutoSearchNotice({
          type: 'searching',
          message: `"${cleanQuery}" sırasıyla Tam Ad -> 25 Karakter -> 15 Karakter -> 10 Karakter kademeleriyle aranıyor...`
        });
      }

      try {
        const total = docInstance.numPages;

        // Sayfa metinlerini önbelleğe al veya mevcut önbelleği kullan (tek seferde tarama)
        let pages: CachedPageData[] = (docInstance as any)._extractedPages;
        if (!pages || pages.length !== total) {
          pages = [];
          for (let i = 1; i <= total; i++) {
            if (i % 4 === 0) {
              await new Promise((resolve) => setTimeout(resolve, 0));
            }
            if (i % 10 === 0 || i === total) {
              setSearchProgress(`Sayfa ${i} / ${total} taranıyor...`);
            }

            const page = await docInstance.getPage(i);
            const textContent = await page.getTextContent();

            let rawText = '';
            const itemsPos: Array<{ str: string; yRatio: number }> = [];
            const pageView = page.view || [0, 0, 595, 842];
            const rawHeight = (pageView[3] - pageView[1]) || 842;

            for (const item of textContent.items) {
              if (item && typeof item.str === 'string') {
                rawText += item.str + ' ';
                if (item.transform && Array.isArray(item.transform) && item.transform.length >= 6) {
                  const transY = item.transform[5];
                  const yRatio = Math.max(0, Math.min(1, (rawHeight - transY) / rawHeight));
                  itemsPos.push({ str: item.str, yRatio });
                }
              }
            }
            rawText = rawText.replace(/\s+/g, ' ').trim();

            const normTurkish = normalizeTurkish(rawText);
            const ascii = normalizeAscii(rawText);
            const canon = canonicalizeCommercialTitle(ascii);
            const compactAscii = ascii.replace(/\s+/g, '');
            const compactTurkish = normTurkish.replace(/\s+/g, '');

            const isAccountHeader =
              /(?:120|320|329|159)\s*[\.\s\-\/]\s*\d+/.test(ascii) ||
              ascii.includes('cari hesap') ||
              ascii.includes('hesap adi') ||
              ascii.includes('hesap kodu') ||
              ascii.includes('cari unvani') ||
              ascii.includes('muavin defteri');

            pages.push({
              pageNumber: i,
              rawText,
              normTurkish,
              ascii,
              canon,
              compactAscii,
              compactTurkish,
              itemsPos,
              isAccountHeader
            });
          }
          (docInstance as any)._extractedPages = pages;
        }

        // Kademeli arama yardımcı kontrolü
        const evaluatePage = (
          p: CachedPageData,
          tier: MatchTier,
          sliceText: string
        ): { isMatch: boolean; score: number; targetStr: string; bestYRatio: number } => {
          const normSlice = normalizeTurkish(sliceText);
          const asciiSlice = normalizeAscii(sliceText);
          const compactSlice = asciiSlice.replace(/\s+/g, '');

          let isMatch = false;
          let score = 0;
          let targetStr = sliceText;

          if (tier === 'tam_ad') {
            const queryInfo = extractDistinctiveTitle(cleanQuery);
            const normFull = normalizeTurkish(cleanQuery);
            const asciiFull = normalizeAscii(cleanQuery);
            const compactFull = asciiFull.replace(/\s+/g, '');
            const canonFull = canonicalizeCommercialTitle(asciiFull);

            if (normFull.length >= 3 && p.normTurkish.includes(normFull)) {
              isMatch = true;
              score = 100;
              targetStr = normFull;
            } else if (asciiFull.length >= 3 && p.ascii.includes(asciiFull)) {
              isMatch = true;
              score = 96;
              targetStr = asciiFull;
            } else if (compactFull.length >= 5 && p.compactAscii.includes(compactFull)) {
              isMatch = true;
              score = 92;
              targetStr = compactFull;
            } else if (canonFull.length >= 5 && p.canon.includes(canonFull)) {
              isMatch = true;
              score = 88;
              targetStr = canonFull;
            } else if (
              queryInfo.coreWords.length >= 2 &&
              queryInfo.corePhrase.length >= 4 &&
              p.ascii.includes(queryInfo.corePhrase)
            ) {
              isMatch = true;
              score = 82;
              targetStr = queryInfo.corePhrase;
            } else if (
              queryInfo.coreWords.length === 1 &&
              queryInfo.coreWords[0].length >= 4 &&
              p.ascii.includes(queryInfo.coreWords[0])
            ) {
              isMatch = true;
              score = 75;
              targetStr = queryInfo.coreWords[0];
            }
          } else if (tier === '25_karakter') {
            if (normSlice.length >= 4 && p.normTurkish.includes(normSlice)) {
              isMatch = true;
              score = 72;
              targetStr = normSlice;
            } else if (asciiSlice.length >= 4 && p.ascii.includes(asciiSlice)) {
              isMatch = true;
              score = 70;
              targetStr = asciiSlice;
            } else if (compactSlice.length >= 5 && p.compactAscii.includes(compactSlice)) {
              isMatch = true;
              score = 67;
              targetStr = compactSlice;
            }
          } else if (tier === '15_karakter') {
            if (normSlice.length >= 3 && p.normTurkish.includes(normSlice)) {
              isMatch = true;
              score = 58;
              targetStr = normSlice;
            } else if (asciiSlice.length >= 3 && p.ascii.includes(asciiSlice)) {
              isMatch = true;
              score = 56;
              targetStr = asciiSlice;
            } else if (compactSlice.length >= 4 && p.compactAscii.includes(compactSlice)) {
              isMatch = true;
              score = 52;
              targetStr = compactSlice;
            }
          } else if (tier === '10_karakter') {
            if (normSlice.length >= 3 && p.normTurkish.includes(normSlice)) {
              isMatch = true;
              score = 42;
              targetStr = normSlice;
            } else if (asciiSlice.length >= 3 && p.ascii.includes(asciiSlice)) {
              isMatch = true;
              score = 40;
              targetStr = asciiSlice;
            } else if (compactSlice.length >= 3 && p.compactAscii.includes(compactSlice)) {
              isMatch = true;
              score = 38;
              targetStr = compactSlice;
            }
          }

          if (!isMatch) {
            return { isMatch: false, score: 0, targetStr: '', bestYRatio: 0.15 };
          }

          if (p.isAccountHeader) {
            score += 30;
          }
          if (p.pageNumber === 1 && !p.isAccountHeader) {
            score -= 15;
          }

          // Y-Ratio hesaplama (sayfada eşleşen satıra odaklanma)
          let bestYRatio = 0.15;
          const matchTarget = asciiSlice || targetStr;
          const matchWords = matchTarget.split(' ').filter((w) => w.length >= 3);
          for (const it of p.itemsPos) {
            const normIt = normalizeAscii(it.str);
            if (!normIt) continue;
            if (normIt.includes(matchTarget) || matchTarget.includes(normIt)) {
              bestYRatio = it.yRatio;
              break;
            }
            if (matchWords.length > 0 && matchWords.some((w) => normIt.includes(w))) {
              bestYRatio = it.yRatio;
            }
          }

          return { isMatch: true, score, targetStr, bestYRatio };
        };

        // KADEMELİ ARAMA LİSTESİ:
        // 1. Önce TAM AD
        // 2. Bulamazsa 25 KARAKTER
        // 3. Bulamazsa 15 KARAKTER
        // 4. Bulamazsa 10 KARAKTER
        interface TierSpec {
          tier: MatchTier;
          label: string;
          sliceText: string;
          minLen: number;
        }

        const tiersToRun: TierSpec[] = [
          { tier: 'tam_ad', label: 'Tam Ad', sliceText: cleanQuery, minLen: 3 },
          { tier: '25_karakter', label: '25 Karakter', sliceText: raw25, minLen: 5 },
          { tier: '15_karakter', label: '15 Karakter', sliceText: raw15, minLen: 4 },
          { tier: '10_karakter', label: '10 Karakter', sliceText: raw10, minLen: 3 }
        ];

        let chosenTier: TierSpec | null = null;
        let chosenResults: SearchResult[] = [];

        for (const t of tiersToRun) {
          if (!t.sliceText || t.sliceText.length < t.minLen) continue;

          const currentMatches: SearchResult[] = [];
          for (const p of pages) {
            const res = evaluatePage(p, t.tier, t.sliceText);
            if (res.isMatch) {
              const lowerRaw = p.rawText.toLowerCase();
              const targetLower = res.targetStr.toLowerCase();
              let idx = lowerRaw.indexOf(targetLower);
              if (idx === -1) {
                const firstWord = targetLower.split(' ')[0];
                if (firstWord) idx = lowerRaw.indexOf(firstWord);
              }
              const start = Math.max(0, (idx === -1 ? 0 : idx) - 30);
              const end = Math.min(p.rawText.length, (idx === -1 ? 0 : idx) + targetLower.length + 70);
              const snippet =
                (start > 0 ? '...' : '') +
                p.rawText.substring(start, end).trim() +
                (end < p.rawText.length ? '...' : '');

              currentMatches.push({
                pageNumber: p.pageNumber,
                snippet,
                isAccountHeader: p.isAccountHeader,
                score: res.score,
                yRatio: res.bestYRatio,
                matchTier: t.tier,
                matchTierLabel: t.label,
                matchedQuery: t.sliceText
              });
            }
          }

          if (currentMatches.length > 0) {
            currentMatches.sort((a, b) => {
              if (b.score !== a.score) return b.score - a.score;
              return a.pageNumber - b.pageNumber;
            });
            chosenTier = t;
            chosenResults = currentMatches;
            // KULLANICI İSTEĞİ: Bir kademede cari bulunursa SONRAKİ KADEMELERE GEÇİLMEZ!
            break;
          }
        }

        if (chosenResults.length > 0 && chosenTier) {
          const topMatch = chosenResults[0];
          setSearchResults(chosenResults);
          goToPage(topMatch.pageNumber, topMatch.yRatio);

          let noticeMsg = '';
          if (chosenTier.tier === 'tam_ad') {
            noticeMsg = `✓ Cari "${cleanQuery}" TAM ADLA eşleştirildi! Sayfa ${topMatch.pageNumber}'ye gidildi. (%200 Yakınlaştırma - ${chosenResults.length} sayfada geçiyor)`;
          } else if (chosenTier.tier === '25_karakter') {
            noticeMsg = `✓ Cari tam adla bulunamadı, SIRASIYLA İLK 25 KARAKTERLE eşleştirildi: "${chosenTier.sliceText}" (Sayfa ${topMatch.pageNumber}'ye gidildi - %200 Yakınlaştırma)`;
          } else if (chosenTier.tier === '15_karakter') {
            noticeMsg = `✓ Cari tam ad ve 25 karakterle bulunamadı, SIRASIYLA İLK 15 KARAKTERLE eşleştirildi: "${chosenTier.sliceText}" (Sayfa ${topMatch.pageNumber}'ye gidildi - %200 Yakınlaştırma)`;
          } else {
            noticeMsg = `✓ Cari tam ad, 25 ve 15 karakterle bulunamadı, SIRASIYLA İLK 10 KARAKTERLE eşleştirildi: "${chosenTier.sliceText}" (Sayfa ${topMatch.pageNumber}'ye gidildi - %200 Yakınlaştırma)`;
          }

          setAutoSearchNotice({
            type: 'found',
            message: noticeMsg,
            pageNumber: topMatch.pageNumber,
            totalMatches: chosenResults.length,
            matchTier: chosenTier.tier,
            matchTierLabel: chosenTier.label,
            matchedQuery: chosenTier.sliceText
          });
          onSearchStatusChangeRef.current?.('found', chosenResults.length, topMatch.pageNumber, chosenTier.label);
        } else {
          // KULLANICI İSTEĞİ: Tüm kademeler (Tam ad, 25, 15, 10) arandıktan sonra bulunamadı bildirimi
          setSearchResults([]);
          setAutoSearchNotice({
            type: 'not_found',
            message: `CARİ BULUNMAMAKTADIR - "${cleanQuery}" isimli cari; sırasıyla Tam Ad, 25 Karakter ("${raw25}"), 15 Karakter ("${raw15}") ve 10 Karakter ("${raw10}") aramalarında bu muavin defterinde bulunamamıştır.`
          });
          onSearchStatusChangeRef.current?.('not_found', 0);
        }
      } catch (err: any) {
        console.error('Search error:', err);
      } finally {
        setSearching(false);
        setSearchProgress('');
      }
    },
    [goToPage]
  );

  const executeSearchRef = useRef(executeSearch);
  useEffect(() => {
    executeSearchRef.current = executeSearch;
  }, [executeSearch]);

  // PDF Belgesini Yükle ve Sayfa Açılışında Otomatik Arama Başlat
  useEffect(() => {
    let isCancelled = false;
    setLoading(true);
    setError(null);
    setPdfDoc(null);
    setCurrentPage(1);
    setPageInput('1');
    setSearchResults([]);
    setAutoSearchNotice(null);

    async function loadDocument() {
      try {
        const pdf = getPdfLib();
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        if (pdf.GlobalWorkerOptions) {
          pdf.GlobalWorkerOptions.workerSrc = origin ? `${origin}/pdf.worker.min.js` : '/pdf.worker.min.js';
        }

        // Direct fetch to Uint8Array ensures no CORS Range request failures in iframes
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`PDF sunucudan indirilemedi (HTTP ${response.status}: ${response.statusText})`);
        }
        const arrayBuffer = await response.arrayBuffer();
        if (isCancelled) return;

        // In-memory Blob URL for browser iframe view or seamless fallback
        try {
          const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
          const bUrl = URL.createObjectURL(blob);
          setBlobUrl(bUrl);
        } catch (bErr) {
          console.warn('Blob URL could not be created:', bErr);
        }

        const loadingTask = pdf.getDocument({
          data: new Uint8Array(arrayBuffer),
          cMapUrl: origin ? `${origin}/cmaps/` : '/cmaps/',
          cMapPacked: true,
          useSystemFonts: true
        });

        const doc = await loadingTask.promise;
        if (isCancelled) return;

        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        setLoading(false);

        // KULLANICI İSTEĞİ: Sayfa açıldığında kontrol edilen talep carisi firma ünvanını PDF dosyası içinde bul ve o sayfaya git
        if (initialSearchTerm && initialSearchTerm.trim() !== '' && initialSearchTerm.trim() !== '-') {
          setSearchTerm(initialSearchTerm.trim());
          // Render page 1 first, then search in background so PDF is immediately visible!
          setTimeout(() => {
            if (!isCancelled) {
              executeSearchRef.current?.(doc, initialSearchTerm.trim(), true);
            }
          }, 150);
        }
      } catch (err: any) {
        if (isCancelled) return;
        console.error('PDF loading notice, activating browser embed mode:', err);
        // Seamless fallback to browser embed mode so the PDF is ALWAYS shown!
        setDisplayMode('embed');
        setLoading(false);
      }
    }

    if (url) {
      loadDocument();
    }

    return () => {
      isCancelled = true;
    };
  }, [url]);

  // Sayfa yüklendikten sonra arama terimi değişirse belgeyi yeniden indirmeden sadece arama yap
  useEffect(() => {
    if (pdfDoc && initialSearchTerm && initialSearchTerm.trim() !== '' && initialSearchTerm.trim() !== '-') {
      setSearchTerm(initialSearchTerm.trim());
      executeSearchRef.current?.(pdfDoc, initialSearchTerm.trim(), false);
    }
  }, [pdfDoc, initialSearchTerm]);

  // Aktif sayfayı HTML5 Canvas üzerine çiz
  const renderPage = useCallback(
    async (pageNum: number) => {
      if (!pdfDoc || !canvasRef.current) return;

      setRendering(true);
      try {
        // Wait for any previous in-flight render task to finish or cancel cleanly
        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel();
            await renderTaskRef.current.promise.catch(() => {});
          } catch {
            // ignore cancel
          }
          renderTaskRef.current = null;
        }

        const page = await pdfDoc.getPage(pageNum);
        const canvas = canvasRef.current;
        if (!canvas) return;

        const viewport = page.getViewport({ scale, rotation });
        const outputScale = window.devicePixelRatio || 1;

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = Math.floor(viewport.width) + 'px';
        canvas.style.height = Math.floor(viewport.height) + 'px';

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.scale(outputScale, outputScale);

        const renderContext = {
          canvasContext: ctx,
          viewport: viewport
        };

        const currentTask = page.render(renderContext);
        renderTaskRef.current = currentTask;
        await currentTask.promise;
        renderTaskRef.current = null;

        // Cari Satırını Canvas Üzerinde Vurgula ve Görüş Alanına Kaydır
        if (highlightTarget && highlightTarget.pageNumber === pageNum && highlightTarget.yRatio !== undefined) {
          const yPx = highlightTarget.yRatio * viewport.height;
          // Altın sarısı yarı-saydam vurgulama şeridi
          ctx.fillStyle = 'rgba(251, 191, 36, 0.28)';
          ctx.fillRect(0, Math.max(0, yPx - 14), viewport.width, 32);
          ctx.strokeStyle = 'rgba(217, 119, 6, 0.85)';
          ctx.lineWidth = 2;
          ctx.strokeRect(0, Math.max(0, yPx - 14), viewport.width, 32);

          if (containerRef.current) {
            const scrollTarget = yPx - 100;
            containerRef.current.scrollTo({ top: Math.max(0, scrollTarget), behavior: 'smooth' });
          }
        }

        ctx.restore();
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error('Page render error:', err);
        }
      } finally {
        setRendering(false);
      }
    },
    [pdfDoc, scale, rotation, highlightTarget]
  );

  useEffect(() => {
    if (pdfDoc && currentPage >= 1 && currentPage <= totalPages) {
      renderPage(currentPage);
      setPageInput(currentPage.toString());
    }
  }, [pdfDoc, currentPage, scale, rotation, renderPage, totalPages]);

  const handlePageInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(pageInput, 10);
    if (!isNaN(parsed)) {
      goToPage(parsed);
    } else {
      setPageInput(currentPage.toString());
    }
  };

  const handleManualSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!pdfDoc || !searchTerm.trim()) return;
    executeSearch(pdfDoc, searchTerm.trim(), false);
  };

  return (
    <div className="flex-1 flex flex-col bg-[#050c18] relative h-full">
      {/* OTOMATİK CARİ ARAMA BİLGİ VE DURUM BANNERI */}
      {autoSearchNotice && (
        <div
          className={`px-4 py-3 flex flex-wrap items-center justify-between text-xs font-bold transition-all duration-200 border-b ${
            autoSearchNotice.type === 'found'
              ? 'bg-emerald-950/95 text-emerald-200 border-emerald-600/80 shadow-md'
              : autoSearchNotice.type === 'searching'
              ? 'bg-blue-950/90 text-sky-200 border-blue-700/60'
              : 'bg-rose-950 text-rose-100 border-b-2 border-rose-500 shadow-xl'
          }`}
        >
          <div className="flex items-center gap-2.5 sm:gap-3">
            {autoSearchNotice.type === 'found' ? (
              <div className="w-7 h-7 rounded-lg bg-emerald-600/30 border border-emerald-500/50 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
              </div>
            ) : autoSearchNotice.type === 'searching' ? (
              <div className="w-7 h-7 rounded-lg bg-blue-600/30 border border-blue-500/50 flex items-center justify-center shrink-0">
                <RefreshCw className="w-4 h-4 text-sky-400 animate-spin shrink-0" />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-lg bg-rose-600 flex items-center justify-center text-white shrink-0 shadow-md">
                <XCircle className="w-5 h-5 text-white" />
              </div>
            )}
            <div>
              {autoSearchNotice.type === 'not_found' ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-black text-white bg-rose-700 px-2.5 py-0.5 rounded tracking-wide uppercase shadow-xs">
                    CARİ BULUNMAMAKTADIR
                  </span>
                  <span className="text-xs text-rose-200 font-medium">
                    &quot;{searchTerm || initialSearchTerm}&quot; isimli cari (Tam Ad, 25, 15, 10 karakter taramalarında) bulunamadı.
                  </span>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span>{autoSearchNotice.message}</span>
                  {autoSearchNotice.matchTierLabel && (
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wide border shadow-xs ${
                      autoSearchNotice.matchTier === 'tam_ad'
                        ? 'bg-emerald-800 text-emerald-100 border-emerald-400'
                        : autoSearchNotice.matchTier === '25_karakter'
                        ? 'bg-sky-800 text-sky-100 border-sky-400'
                        : autoSearchNotice.matchTier === '15_karakter'
                        ? 'bg-amber-800 text-amber-100 border-amber-400'
                        : 'bg-orange-800 text-orange-100 border-orange-400'
                    }`}>
                      {autoSearchNotice.matchTierLabel} İle Bulundu
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 mt-1 sm:mt-0">
            {autoSearchNotice.type === 'found' && autoSearchNotice.totalMatches && autoSearchNotice.totalMatches > 1 && (
              <button
                type="button"
                onClick={() => setShowSearchPanel(true)}
                className="px-2.5 py-1 rounded-lg bg-emerald-800/90 hover:bg-emerald-700 text-white text-[11px] font-bold underline cursor-pointer shadow-xs"
              >
                Tüm Sonuçları Gör ({autoSearchNotice.totalMatches} Sayfa)
              </button>
            )}
            <button
              type="button"
              onClick={() => setAutoSearchNotice(null)}
              className="p-1 text-slate-300 hover:text-white rounded-lg hover:bg-black/20 cursor-pointer"
              title="Bildirimi Kapat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* KONTROL ARAÇ ÇUBUĞU */}
      <div className="bg-[#0b172a] border-b border-blue-900/60 px-3 sm:px-5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs z-10 select-none shadow-md">
        {/* SOL: SAYFA GEZİNME BUTONLARI */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => goToPage(1)}
            disabled={currentPage <= 1 || loading}
            className="p-1.5 rounded-lg bg-blue-950/80 hover:bg-blue-900 text-slate-300 hover:text-white border border-blue-800/50 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition"
            title="İlk Sayfa (1)"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => goToPage(currentPage - 10)}
            disabled={currentPage <= 1 || loading}
            className="px-2 py-1 rounded-lg bg-blue-950/80 hover:bg-blue-900 text-slate-300 hover:text-white border border-blue-800/50 text-[11px] font-bold disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition hidden sm:inline"
            title="10 Sayfa Geri"
          >
            -10
          </button>

          <button
            type="button"
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1 || loading}
            className="p-1.5 rounded-lg bg-blue-950/80 hover:bg-blue-900 text-slate-300 hover:text-white border border-blue-800/50 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition"
            title="Önceki Sayfa"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* SAYFA GİRİŞİ */}
          <form onSubmit={handlePageInputSubmit} className="flex items-center gap-1.5">
            <span className="text-slate-400 font-medium text-[11px]">Sayfa:</span>
            <input
              type="text"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onBlur={() => setPageInput(currentPage.toString())}
              className="w-12 text-center bg-[#061120] border border-blue-700/60 rounded-md py-1 text-xs text-white font-mono font-bold focus:border-sky-400 focus:outline-none"
            />
            <span className="text-slate-400 font-mono font-semibold">/ {totalPages || 1}</span>
          </form>

          <button
            type="button"
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= totalPages || loading}
            className="p-1.5 rounded-lg bg-blue-950/80 hover:bg-blue-900 text-slate-300 hover:text-white border border-blue-800/50 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition"
            title="Sonraki Sayfa"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => goToPage(currentPage + 10)}
            disabled={currentPage >= totalPages || loading}
            className="px-2 py-1 rounded-lg bg-blue-950/80 hover:bg-blue-900 text-slate-300 hover:text-white border border-blue-800/50 text-[11px] font-bold disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition hidden sm:inline"
            title="10 Sayfa İleri"
          >
            +10
          </button>

          <button
            type="button"
            onClick={() => goToPage(totalPages)}
            disabled={currentPage >= totalPages || loading}
            className="p-1.5 rounded-lg bg-blue-950/80 hover:bg-blue-900 text-slate-300 hover:text-white border border-blue-800/50 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition"
            title={`Son Sayfa (${totalPages})`}
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>

        {/* ORTA: YAKINLAŞTIR / UZAKLAŞTIR / DÖNDÜR - %200 SEÇENEĞİ */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => setScale((s) => Math.max(0.6, Math.round((s - 0.2) * 10) / 10))}
            className="p-1.5 rounded-lg bg-blue-950/80 hover:bg-blue-900 text-slate-300 hover:text-white border border-blue-800/50 cursor-pointer transition"
            title="Uzaklaştır (%20)"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <span className="font-mono text-xs font-bold text-sky-400 min-w-[52px] text-center bg-blue-950/60 px-2 py-1 rounded border border-blue-900/50">
            %{Math.round(scale * 100)}
          </span>

          <button
            type="button"
            onClick={() => setScale((s) => Math.min(3.5, Math.round((s + 0.2) * 10) / 10))}
            className="p-1.5 rounded-lg bg-blue-950/80 hover:bg-blue-900 text-slate-300 hover:text-white border border-blue-800/50 cursor-pointer transition"
            title="Yakınlaştır (%20)"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setScale(1.0)}
            className={`px-2 py-1 rounded-lg border text-[11px] font-bold cursor-pointer transition hidden md:inline ${
              Math.round(scale * 100) === 100
                ? 'bg-blue-600 text-white border-blue-400'
                : 'bg-blue-950/80 hover:bg-blue-900 text-slate-300 hover:text-white border-blue-800/50'
            }`}
            title="Orijinal Boyut (%100)"
          >
            %100
          </button>

          <button
            type="button"
            onClick={() => setScale(1.5)}
            className={`px-2 py-1 rounded-lg border text-[11px] font-bold cursor-pointer transition hidden md:inline ${
              Math.round(scale * 100) === 150
                ? 'bg-blue-600 text-white border-blue-400'
                : 'bg-blue-950/80 hover:bg-blue-900 text-slate-300 hover:text-white border-blue-800/50'
            }`}
            title="Büyük Görünüm (%150)"
          >
            %150
          </button>

          {/* KULLANICI İSTEĞİ: %200 YAKINLAŞTIR BUTONU */}
          <button
            type="button"
            onClick={() => setScale(2.0)}
            className={`px-2.5 py-1 rounded-lg border text-[11px] font-black cursor-pointer transition shadow-xs ${
              Math.round(scale * 100) === 200
                ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white border-sky-300 ring-1 ring-sky-400'
                : 'bg-blue-950/80 hover:bg-blue-900 text-sky-300 hover:text-white border-blue-800/50'
            }`}
            title="Net Okuma Boyutu (%200)"
          >
            %200
          </button>

          <button
            type="button"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            className="p-1.5 rounded-lg bg-blue-950/80 hover:bg-blue-900 text-slate-300 hover:text-white border border-blue-800/50 cursor-pointer transition"
            title="Sayfayı 90° Döndür"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>

        {/* SAĞ: PDF İÇİNDE ARA VE SONUÇ PANELİ */}
        <div className="flex items-center gap-2">
          <form onSubmit={handleManualSearch} className="relative flex items-center">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="PDF içinde firma / cari ara..."
              className="w-44 sm:w-60 bg-[#061120] border border-blue-700/60 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-sky-400 focus:outline-none font-medium"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
            <button
              type="submit"
              disabled={searching || !searchTerm.trim() || !pdfDoc}
              className="ml-1 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs disabled:opacity-40 cursor-pointer transition flex items-center gap-1 shadow"
            >
              {searching ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Ara'}
            </button>
          </form>

          {searchResults.length > 0 && (
            <button
              type="button"
              onClick={() => setShowSearchPanel(!showSearchPanel)}
              className="px-2.5 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold text-xs cursor-pointer flex items-center gap-1.5"
            >
              <span>{searchResults.length} Sayfa Bulundu</span>
            </button>
          )}

          {/* GÖRÜNTÜLEME MODU SEÇİCİ: CANVAS / TARAYICI */}
          <div className="flex items-center gap-1 bg-[#061120] p-1 rounded-xl border border-blue-900/60 ml-1">
            <button
              type="button"
              onClick={() => setDisplayMode('canvas')}
              className={`px-2 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer ${
                displayMode === 'canvas'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Canvas Modu: Sayfa içi hızlı arama ve vurgulama"
            >
              <FileText className="w-3 h-3" />
              <span className="hidden sm:inline">Canvas</span>
            </button>
            <button
              type="button"
              onClick={() => setDisplayMode('embed')}
              className={`px-2 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer ${
                displayMode === 'embed'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Tarayıcı Modu: Yerleşik tarayıcı PDF görüntüleyici"
            >
              <ExternalLink className="w-3 h-3" />
              <span className="hidden sm:inline">Tarayıcı</span>
            </button>
          </div>
        </div>
      </div>

      {/* ARAMA SONUÇLARI AÇILIR PANELİ */}
      {showSearchPanel && (
        <div className="bg-[#091424] border-b border-blue-900/80 p-3 max-h-48 overflow-y-auto text-xs z-20 shadow-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-sky-400 flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5" />
              &quot;{searchTerm}&quot; için arama sonuçları ({searchResults.length} sayfada bulundu):
            </span>
            <button
              type="button"
              onClick={() => setShowSearchPanel(false)}
              className="text-slate-400 hover:text-white text-xs px-2 py-0.5 rounded bg-blue-950/60 cursor-pointer"
            >
              Kapat ✕
            </button>
          </div>

          {searching ? (
            <div className="text-slate-400 py-3 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
              <span>{searchProgress || 'Sayfalar taranıyor...'}</span>
            </div>
          ) : searchResults.length === 0 ? (
            <div className="text-slate-400 py-2">
              Bu muavin defterinde &quot;{searchTerm}&quot; ifadesi bulunamadı. Farklı bir kelime ile arayabilirsiniz.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {searchResults.map((res, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    goToPage(res.pageNumber, res.yRatio);
                    setShowSearchPanel(false);
                  }}
                  className={`text-left p-2 rounded-lg border transition cursor-pointer flex flex-col gap-0.5 ${
                    currentPage === res.pageNumber
                      ? 'bg-blue-900/60 border-sky-400 text-white'
                      : 'bg-blue-950/40 hover:bg-blue-900/40 border-blue-900/60 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between font-black text-sky-300 text-[11px]">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span>Sayfa {res.pageNumber}</span>
                      {res.matchTierLabel && (
                        <span className={`text-[9px] px-1.5 py-0.2 rounded font-black border ${
                          res.matchTier === 'tam_ad'
                            ? 'bg-emerald-900/80 text-emerald-200 border-emerald-500/50'
                            : res.matchTier === '25_karakter'
                            ? 'bg-sky-900/80 text-sky-200 border-sky-500/50'
                            : res.matchTier === '15_karakter'
                            ? 'bg-amber-900/80 text-amber-200 border-amber-500/50'
                            : 'bg-orange-900/80 text-orange-200 border-orange-500/50'
                        }`}>
                          {res.matchTierLabel}
                        </span>
                      )}
                      {res.isAccountHeader && (
                        <span className="text-[9px] bg-emerald-700/80 text-emerald-200 px-1.5 py-0.2 rounded font-bold border border-emerald-500/50">
                          Hesap Başlığı
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 font-normal">Gitmek için tıkla →</span>
                  </div>
                  <span className="text-[10px] text-slate-400 truncate line-clamp-2">
                    {res.snippet}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TUVAL (CANVAS) GÖVDE ALANI - %200 YAKINLAŞTIRMADA RAHAT KAYDIRMA İMKANI */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto flex flex-col items-center justify-start p-4 sm:p-8 bg-[#040812] relative min-h-[500px]"
      >
        {/* CARİ BULUNDU BAŞARI BİLDİRİMİ */}
        {autoSearchNotice?.type === 'found' && !loading && (
          <div className="w-full max-w-3xl mb-4 p-3 sm:p-4 rounded-2xl bg-gradient-to-r from-emerald-950/90 via-emerald-900/90 to-teal-950/90 border border-emerald-500/80 text-emerald-100 flex items-center justify-between shadow-xl shrink-0 animate-in fade-in duration-200">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center text-white shrink-0 shadow-md border border-emerald-400">
                <Check className="w-5 h-5 stroke-[3]" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs sm:text-sm font-black text-white tracking-wide">
                    ✓ CARİ BULUNDU (SAYFA {autoSearchNotice.pageNumber})
                  </span>
                  {autoSearchNotice.matchTierLabel && (
                    <span className={`text-[10px] uppercase font-black px-2 py-0.5 rounded-full border ${
                      autoSearchNotice.matchTier === 'tam_ad'
                        ? 'bg-emerald-800 text-emerald-100 border-emerald-500'
                        : autoSearchNotice.matchTier === '25_karakter'
                        ? 'bg-sky-800 text-sky-100 border-sky-400'
                        : autoSearchNotice.matchTier === '15_karakter'
                        ? 'bg-amber-800 text-amber-100 border-amber-400'
                        : 'bg-orange-800 text-orange-100 border-orange-400'
                    }`}>
                      {autoSearchNotice.matchTierLabel}
                    </span>
                  )}
                  <span className="text-[10px] uppercase font-bold bg-emerald-800 text-emerald-200 px-2 py-0.5 rounded-full border border-emerald-600">
                    %{Math.round(scale * 100)} Yakınlaştırma
                  </span>
                </div>
                <p className="text-xs text-emerald-200 truncate mt-0.5">
                  {autoSearchNotice.message}
                </p>
              </div>
            </div>
            {searchResults.length > 1 && (
              <button
                type="button"
                onClick={() => setShowSearchPanel(true)}
                className="px-3 py-1.5 rounded-xl bg-emerald-800/80 hover:bg-emerald-700 text-white font-bold text-xs border border-emerald-600/60 transition cursor-pointer shrink-0 ml-3"
              >
                Tüm Sayfalar ({searchResults.length})
              </button>
            )}
          </div>
        )}

        {/* CARİ BULUNMAMAKTADIR UYARI KARTLARI */}
        {autoSearchNotice?.type === 'not_found' && !loading && (
          <div className="w-full max-w-3xl mb-5 p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-rose-950 via-rose-900 to-red-950 border-2 border-rose-500 text-rose-100 flex items-start gap-4 shadow-2xl shrink-0 animate-in fade-in duration-200">
            <div className="w-11 h-11 rounded-xl bg-rose-600 flex items-center justify-center text-white shrink-0 shadow-lg border border-rose-400">
              <XCircle className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base sm:text-lg font-black text-white tracking-wide">
                  CARİ BULUNMAMAKTADIR
                </span>
                <span className="text-[10px] uppercase font-bold bg-rose-800 text-rose-200 px-2.5 py-0.5 rounded-full border border-rose-600">
                  Kayıt Yok
                </span>
              </div>
              <p className="text-xs sm:text-sm text-rose-100 mt-1.5 leading-relaxed">
                <strong>&quot;{searchTerm || initialSearchTerm}&quot;</strong> isimli cari; sırasıyla <strong>Tam Ad</strong>, <strong>25 Karakter</strong>, <strong>15 Karakter</strong> ve <strong>10 Karakter</strong> kademeli taramalarında bu muavin defterinde bulunamamıştır.
              </p>
              <div className="mt-3 pt-2.5 border-t border-rose-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-rose-300">
                <span>Muavindeki tüm <strong>{totalPages} sayfa</strong> taranmıştır.</span>
                <span>Aşağıda muavin dosyasının 1. sayfası incelenebilir olarak açık tutulmaktadır.</span>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center text-slate-300 gap-3 my-auto">
            <RefreshCw className="w-9 h-9 text-sky-400 animate-spin" />
            <p className="font-bold text-sm">PDF Dosyası İşleniyor...</p>
            <p className="text-xs text-slate-500 font-mono">{fileName || 'muavin.pdf'}</p>
          </div>
        ) : displayMode === 'embed' ? (
          <div className="w-full flex-1 flex flex-col min-h-[680px] rounded-xl overflow-hidden border border-blue-900/60 shadow-2xl bg-[#040812]">
            <object
              data={`${blobUrl || url}#page=${currentPage}&toolbar=1&navpanes=1`}
              type="application/pdf"
              className="w-full flex-1 min-h-[680px]"
            >
              <iframe
                src={`${blobUrl || url}#page=${currentPage}&toolbar=1&navpanes=1`}
                className="w-full flex-1 min-h-[680px] border-0 bg-slate-900"
                title="PDF Belgesi"
              />
            </object>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center max-w-lg text-center p-6 bg-rose-950/40 border border-rose-800/50 rounded-2xl gap-3 my-auto">
            <AlertCircle className="w-10 h-10 text-rose-400" />
            <h4 className="font-black text-rose-200">Görüntüleme Hatası</h4>
            <p className="text-xs text-slate-300 leading-relaxed">{error}</p>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDisplayMode('embed')}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Tarayıcı Modunda Aç (İçeride)</span>
              </button>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Yeni Sekmede Aç</span>
              </a>
              <a
                href={url}
                download={fileName || 'muavin.pdf'}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>İndir</span>
              </a>
            </div>
          </div>
        ) : (
          <div className="relative flex flex-col items-center justify-center my-2">
            {rendering && (
              <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px] flex items-center justify-center z-10 rounded-lg">
                <RefreshCw className="w-7 h-7 text-sky-400 animate-spin" />
              </div>
            )}
            <canvas
              ref={canvasRef}
              className="shadow-2xl rounded-sm border border-slate-700/80 bg-white max-w-none transition-all duration-100"
            />
          </div>
        )}
      </div>

      {/* ALT ÇUBUK: HIZLI BİLGİ */}
      <div className="bg-[#0b172a] border-t border-blue-900/60 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 select-none">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Yerleşik PDF Motoru Aktif
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-300">
            Yakınlaştırma: <strong className="text-sky-400 font-bold">%{Math.round(scale * 100)}</strong>
          </span>
          <span className="hidden sm:inline text-slate-600">|</span>
          <span className="hidden sm:inline text-slate-400">
            Toplam <span className="text-white font-bold">{totalPages}</span> Sayfa
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-slate-400">
            {initialSearchTerm && initialSearchTerm !== '-' ? (
              <span>
                Kontrol Edilen Cari: <strong className="text-white">{initialSearchTerm}</strong>
              </span>
            ) : (
              <span>Sayfalar arasında gezinmek için sol-sağ okları veya sayfa numarasını kullanabilirsiniz.</span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
};
