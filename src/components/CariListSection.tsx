import React, { useState, useMemo } from 'react';
import {
  ParsedCariRecord,
  CariFileMetadata,
  parseCariWorkbook
} from '../lib/cariStorageService';
import { formatCurrency } from '../lib/recordUtils';
import {
  FileSpreadsheet,
  RefreshCw,
  Search,
  Upload,
  Building,
  TrendingDown,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Database,
  ExternalLink
} from 'lucide-react';

interface CariListSectionProps {
  siteName: string;
  bucketName: string;
  cariRecords: ParsedCariRecord[];
  fileMetadata: CariFileMetadata | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onManualUpload?: (records: ParsedCariRecord[], fileName: string) => void;
}

export const CariListSection: React.FC<CariListSectionProps> = ({
  siteName,
  bucketName,
  cariRecords,
  fileMetadata,
  loading,
  error,
  onRefresh,
  onManualUpload
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'BORÇLU' | 'ALACAKLI'>('ALL');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  // Search & Filter
  const filteredList = useMemo(() => {
    return cariRecords.filter((rec) => {
      const matchSearch =
        !searchTerm ||
        rec.firmaUnvani.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (rec.cariKodu && rec.cariKodu.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchFilter =
        filterType === 'ALL' ||
        (filterType === 'BORÇLU' && rec.bakiyeTuru === 'BORÇLU') ||
        (filterType === 'ALACAKLI' && rec.bakiyeTuru === 'ALACAKLI');

      return matchSearch && matchFilter;
    });
  }, [cariRecords, searchTerm, filterType]);

  const totalPages = Math.ceil(filteredList.length / pageSize) || 1;
  const paginatedList = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredList.slice(start, start + pageSize);
  }, [filteredList, page, pageSize]);

  // Overall totals
  const totalBorc = useMemo(() => cariRecords.reduce((s, r) => s + r.borc, 0), [cariRecords]);
  const totalAlacak = useMemo(() => cariRecords.reduce((s, r) => s + r.alacak, 0), [cariRecords]);
  const totalBorcluSayisi = useMemo(
    () => cariRecords.filter((r) => r.bakiyeTuru === 'BORÇLU').length,
    [cariRecords]
  );
  const totalAlacakliSayisi = useMemo(
    () => cariRecords.filter((r) => r.bakiyeTuru === 'ALACAKLI').length,
    [cariRecords]
  );

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const buffer = event.target?.result as ArrayBuffer;
        if (buffer) {
          const parsed = parseCariWorkbook(buffer);
          if (onManualUpload) {
            onManualUpload(parsed, file.name);
          }
        }
      } catch (err) {
        console.error('File parse error:', err);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div id="cari-hesap-ekstresi-bolumu" className="space-y-4 pt-4 border-t-2 border-slate-800">
      {/* SECTION HEADER */}
      <div className="bg-gradient-to-r from-black via-slate-950 to-black text-white rounded-2xl p-5 sm:p-6 shadow-2xl border border-slate-800">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-700 flex items-center justify-center text-cyan-400 shadow-inner flex-shrink-0">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-black tracking-tight uppercase text-white">
                  {siteName} — YÜKLENEN CARİ HESAP EKSTRESİ
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-slate-900 text-cyan-300 border border-slate-700 flex items-center gap-1">
                  <Database className="w-3 h-3" />
                  {bucketName}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Supabase Storage ({bucketName}) klasöründeki Excel tablosu okunarak talep tablosundaki firma borç/alacak analizleri otomatik yapılır.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* Supabase Storage Link info */}
            <a
              href={`https://supabase.com/dashboard/project/gboathwmaanqxuwsryud/storage/files/buckets/${bucketName}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 flex items-center gap-1.5 transition"
              title="Supabase Storage Bucket'ını yeni sekmede aç"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Storage Bucket</span>
            </a>

            {/* Manuel Excel Yükleme Butonu */}
            <label className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-cyan-300 hover:text-white border border-slate-700 flex items-center gap-1.5 transition cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>Excel Yükle</span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>

            {/* Yenile Butonu */}
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="px-4 py-2 rounded-xl text-xs font-black bg-cyan-700 hover:bg-cyan-600 text-white border border-cyan-500 shadow-md flex items-center gap-1.5 transition cursor-pointer active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Yenile</span>
            </button>
          </div>
        </div>

        {/* METADATA BAR */}
        {fileMetadata && (
          <div className="mt-4 pt-3.5 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400 font-medium">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="flex items-center gap-1 text-slate-200 font-bold">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                Dosya: {fileMetadata.name}
              </span>
              <span>•</span>
              <span className="text-cyan-300 font-semibold">{cariRecords.length} Cari Hesap Kaydı Yüklendi</span>
              {fileMetadata.size && (
                <>
                  <span>•</span>
                  <span>{(fileMetadata.size / 1024).toFixed(1)} KB</span>
                </>
              )}
            </div>
            {fileMetadata.updated_at && (
              <span className="text-[11px] text-slate-500">
                Son Güncelleme: {new Date(fileMetadata.updated_at).toLocaleString('tr-TR')}
              </span>
            )}
          </div>
        )}
      </div>

      {/* LOADING STATE */}
      {loading && (
        <div className="bg-black p-8 rounded-2xl border border-slate-800 shadow-xl flex flex-col items-center justify-center text-center space-y-3">
          <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
          <div className="text-sm font-bold text-slate-100">
            {siteName} için Storage ({bucketName}) Cari Kayıtları Okunuyor...
          </div>
          <div className="text-xs text-slate-400">Lütfen bekleyiniz, Excel cari verisi yükleniyor.</div>
        </div>
      )}

      {/* EMPTY STATE - CARİ KAYITLAR BULUNMAMAKTADIR */}
      {!loading && cariRecords.length === 0 && (
        <div className="bg-black p-8 sm:p-10 rounded-2xl border border-slate-800 shadow-xl flex flex-col items-center justify-center text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500">
            <FileSpreadsheet className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h4 className="text-base sm:text-lg font-black text-slate-100 uppercase tracking-wide">
              CARİ KAYITLAR BULUNMAMAKTADIR
            </h4>
            <p className="text-xs text-slate-400 max-w-lg">
              Supabase Storage <strong>{bucketName}</strong> bucket'ı içerisinde henüz bir <code>.xlsx</code> cari hesap ekstresi dosyası bulunamadı.
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <label className="px-4 py-2.5 rounded-xl text-xs font-bold bg-cyan-700 hover:bg-cyan-600 text-white shadow-md flex items-center gap-2 transition cursor-pointer">
              <Upload className="w-4 h-4" />
              <span>Excel Cari Dosyası Yükle</span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={onRefresh}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-2 transition cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Tekrar Kontrol Et</span>
            </button>
          </div>
        </div>
      )}

      {/* ERROR STATE */}
      {error && !loading && cariRecords.length === 0 && (
        <div className="p-4 bg-slate-950 rounded-2xl border border-amber-900/60 text-amber-200 flex items-start gap-3 text-xs shadow-md">
          <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-amber-300">
              Supabase Storage ({bucketName}) Bilgisi:
            </div>
            <div className="mt-0.5 text-amber-200/90">{error}</div>
          </div>
        </div>
      )}

      {/* KPI SUMMARY CARDS */}
      {cariRecords.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-black p-4 rounded-2xl border border-slate-800 shadow-xl">
            <div className="text-xs font-bold text-slate-400 uppercase flex items-center justify-between">
              <span>Toplam Cari</span>
              <Building className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-xl font-black text-white mt-1">
              {cariRecords.length}{' '}
              <span className="text-xs font-medium text-slate-400">Firma</span>
            </div>
          </div>

          <div className="bg-black p-4 rounded-2xl border border-rose-900/60 shadow-xl">
            <div className="text-xs font-bold text-rose-400 uppercase flex items-center justify-between">
              <span>Borçlu Cariler ({totalBorcluSayisi})</span>
              <TrendingDown className="w-4 h-4 text-rose-500" />
            </div>
            <div className="text-xl font-black text-rose-400 mt-1 font-mono">
              {formatCurrency(totalBorc)}
            </div>
            <div className="text-[10px] text-rose-400/80 mt-0.5 font-semibold">
              Talep tablosunda kırmızı renkle gösterilir
            </div>
          </div>

          <div className="bg-black p-4 rounded-2xl border border-emerald-900/60 shadow-xl">
            <div className="text-xs font-bold text-emerald-400 uppercase flex items-center justify-between">
              <span>Alacaklı Cariler ({totalAlacakliSayisi})</span>
              <TrendingUp className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-xl font-black text-emerald-400 mt-1 font-mono">
              {formatCurrency(totalAlacak)}
            </div>
            <div className="text-[10px] text-emerald-400/80 mt-0.5 font-semibold">
              Talep tablosunda yeşil renkle gösterilir
            </div>
          </div>

          <div className="bg-black text-white p-4 rounded-2xl border border-slate-800 shadow-xl">
            <div className="text-xs font-bold text-cyan-400 uppercase flex items-center justify-between">
              <span>Net Bakiye Durumu</span>
              <CheckCircle2 className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-xl font-black text-white mt-1 font-mono">
              {formatCurrency(Math.abs(totalAlacak - totalBorc))}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5 font-semibold">
              {totalAlacak >= totalBorc ? 'Genel Alacak Fazlası' : 'Genel Borç Fazlası'}
            </div>
          </div>
        </div>
      )}

      {/* CARI TABLE & CONTROLS */}
      {cariRecords.length > 0 && (
        <div className="bg-black rounded-2xl border border-slate-800 shadow-2xl overflow-hidden">
          {/* Table Toolbar */}
          <div className="p-4 bg-slate-950 border-b border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                placeholder="Firma ünvanı veya kod ara..."
                className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs font-medium text-slate-100 placeholder-slate-400 focus:outline-none focus:border-cyan-400 shadow-inner"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={() => {
                  setFilterType('ALL');
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  filterType === 'ALL'
                    ? 'bg-cyan-600 text-white shadow-md'
                    : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-700'
                }`}
              >
                Tümü ({cariRecords.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setFilterType('BORÇLU');
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  filterType === 'BORÇLU'
                    ? 'bg-rose-700 text-white shadow-md'
                    : 'bg-rose-950/50 text-rose-300 hover:bg-rose-950/80 border border-rose-900/60'
                }`}
              >
                Borçlu ({totalBorcluSayisi})
              </button>
              <button
                type="button"
                onClick={() => {
                  setFilterType('ALACAKLI');
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  filterType === 'ALACAKLI'
                    ? 'bg-emerald-700 text-white shadow-md'
                    : 'bg-emerald-950/50 text-emerald-300 hover:bg-emerald-950/80 border border-emerald-900/60'
                }`}
              >
                Alacaklı ({totalAlacakliSayisi})
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto max-h-[520px] overflow-y-auto border-t border-slate-800 bg-black">
            <table className="w-full text-left border-collapse border border-slate-800 text-xs bg-black">
              <thead className="sticky top-0 z-10 bg-slate-950 text-slate-300 uppercase tracking-wider text-[11px] font-bold border-b-2 border-slate-700 shadow-md">
                <tr>
                  <th className="py-3 px-3 w-12 text-center border-r border-slate-800 text-slate-400 bg-slate-950">#</th>
                  <th className="py-3 px-3 w-28 border-r border-slate-800 text-slate-300 bg-slate-950">CARİ KODU</th>
                  <th className="py-3 px-4 min-w-[240px] border-r border-slate-800 text-slate-200 bg-slate-950">FİRMA / CARİ ÜNVANI</th>
                  <th className="py-3 px-4 text-right border-r border-slate-800 bg-rose-950/60 text-rose-300 font-black">BORÇ TUTARI</th>
                  <th className="py-3 px-4 text-right border-r border-slate-800 bg-emerald-950/60 text-emerald-300 font-black">ALACAK TUTARI</th>
                  <th className="py-3 px-4 text-right font-black border-r border-slate-800 text-white bg-slate-950">BAKİYE</th>
                  <th className="py-3 px-4 text-center w-32 text-slate-300 bg-slate-950">DURUM</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-black text-slate-200">
                {paginatedList.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400 bg-black">
                      Aramanıza uygun cari kaydı bulunamadı.
                    </td>
                  </tr>
                ) : (
                  paginatedList.map((c, idx) => {
                    const rowNum = (page - 1) * pageSize + idx + 1;
                    const isBorclu = c.bakiyeTuru === 'BORÇLU';
                    const isAlacakli = c.bakiyeTuru === 'ALACAKLI';

                    return (
                      <tr
                        key={c.id || idx}
                        className="hover:bg-slate-900/90 transition-colors bg-black"
                      >
                        <td className="py-2.5 px-3 text-center text-slate-400 font-mono border-r border-b border-slate-800">
                          {rowNum}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-300 border-r border-b border-slate-800">
                          {c.cariKodu || '-'}
                        </td>
                        <td className="py-2.5 px-4 font-bold text-white border-r border-b border-slate-800">
                          <div className="flex items-center gap-1.5">
                            <Building className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                            <span className="text-white">{c.firmaUnvani}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-bold text-rose-400 bg-rose-950/30 border-r border-b border-slate-800">
                          {formatCurrency(c.borc)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-400 bg-emerald-950/30 border-r border-b border-slate-800">
                          {formatCurrency(c.alacak)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-black text-white border-r border-b border-slate-800">
                          {formatCurrency(c.bakiye)}
                        </td>
                        <td className="py-2.5 px-4 text-center border-b border-slate-800">
                          {isBorclu ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-rose-950 text-rose-300 border border-rose-600 shadow-sm">
                              <TrendingDown className="w-3 h-3 text-rose-400" /> BORÇLU
                            </span>
                          ) : isAlacakli ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-950 text-emerald-300 border border-emerald-500 shadow-sm">
                              <TrendingUp className="w-3 h-3 text-emerald-400" /> ALACAKLI
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-900 text-slate-400 border border-slate-700">
                              BAKİYESİZ
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <div>
                Toplam {filteredList.length} kayıttan {(page - 1) * pageSize + 1}-
                {Math.min(page * pageSize, filteredList.length)} arası gösteriliyor
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:bg-slate-800 text-white disabled:opacity-30 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-bold px-2 text-slate-200">
                  Sayfa {page} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:bg-slate-800 text-white disabled:opacity-30 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
