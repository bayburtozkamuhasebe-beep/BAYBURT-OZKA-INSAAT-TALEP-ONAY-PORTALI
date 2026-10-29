import React, { useState, useRef, useEffect } from 'react';
import { SITES, SiteConfig } from '../types';
import {
  Building2,
  Layers,
  Database,
  CreditCard,
  ArrowLeft,
  FileText,
  ChevronDown,
  CheckCircle2,
  RefreshCw,
  Trash2,
  FileCheck2
} from 'lucide-react';
import { exportAllSitesToPDF, exportOdensinlerToPDF } from '../lib/exportUtils';
import { FaturaSilModal } from './FaturaSilModal';

interface HeaderProps {
  activeSite: SiteConfig;
  onSelectSite: (site: SiteConfig) => void;
  siteCounts?: Record<string, number>;
  totalAllRecords?: number;
  currentView?: 'talepler' | 'odemeler' | 'muavin';
  onViewChange?: (view: 'talepler' | 'odemeler') => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeSite,
  onSelectSite,
  siteCounts = {},
  currentView = 'talepler',
  onViewChange
}) => {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);
  const [pdfActionType, setPdfActionType] = useState<'all' | 'odensinler' | null>(null);
  const [pdfProgress, setPdfProgress] = useState<string>('');
  const [showPdfMenu, setShowPdfMenu] = useState<boolean>(false);
  const [showFaturaSilModal, setShowFaturaSilModal] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowPdfMenu(false);
      }
    };
    if (showPdfMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showPdfMenu]);

  const handleExportAllPdf = async (mode: 'talepler' | 'odemeler' | 'current' = 'current') => {
    const targetMode = mode === 'current'
      ? (currentView === 'odemeler' ? 'odemeler' : 'talepler')
      : mode;

    setIsGeneratingPdf(true);
    setPdfActionType('all');
    setShowPdfMenu(false);
    setErrorMsg(null);
    setPdfProgress('Tüm tablolar taranıyor...');

    try {
      const res = await exportAllSitesToPDF({
        viewMode: targetMode,
        onProgress: (msg) => setPdfProgress(msg)
      });
      setSuccessMsg(res.message);
      setTimeout(() => setSuccessMsg(null), 6000);
    } catch (err: any) {
      console.error('PDF export error:', err);
      setErrorMsg('PDF oluşturulurken bir sorun oluştu: ' + (err?.message || 'Bilinmeyen hata'));
      setTimeout(() => setErrorMsg(null), 6000);
    } finally {
      setIsGeneratingPdf(false);
      setPdfActionType(null);
      setPdfProgress('');
    }
  };

  const handleExportOdensinlerPdf = async (mode: 'talepler' | 'odemeler' | 'current' = 'current') => {
    const targetMode = mode === 'current'
      ? (currentView === 'odemeler' ? 'odemeler' : 'talepler')
      : mode;

    setIsGeneratingPdf(true);
    setPdfActionType('odensinler');
    setShowPdfMenu(false);
    setErrorMsg(null);
    setPdfProgress('Ödensin & Beklesin kayıtları taranıyor...');

    try {
      const res = await exportOdensinlerToPDF({
        viewMode: targetMode,
        onProgress: (msg) => setPdfProgress(msg)
      });
      setSuccessMsg(res.message);
      setTimeout(() => setSuccessMsg(null), 6000);
    } catch (err: any) {
      console.error('Ödensinler PDF export error:', err);
      setErrorMsg('PDF oluşturulurken bir sorun oluştu: ' + (err?.message || 'Bilinmeyen hata'));
      setTimeout(() => setErrorMsg(null), 6000);
    } finally {
      setIsGeneratingPdf(false);
      setPdfActionType(null);
      setPdfProgress('');
    }
  };

  return (
    <header className="bg-[#091322] border-b border-blue-900/40 sticky top-0 z-30 shadow-xl shadow-black/20">
      <div className="w-full max-w-[98%] xl:max-w-[1780px] 2xl:max-w-[1900px] mx-auto px-2 sm:px-4 lg:px-6">
        {/* Title Bar */}
        <div className="py-3.5 flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b border-blue-950/80">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-lg shadow-blue-900/40 border border-blue-400/30 flex-shrink-0">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white uppercase flex items-center gap-2">
                BAYBURT ÖZKA İNŞAAT
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 tracking-wider">
                  {currentView === 'odemeler'
                    ? 'ÖDEMELERİ GERÇEKLEŞTİR'
                    : currentView === 'muavin'
                    ? 'CARİ KONTROL & MUAVİN DEFTERİ'
                    : 'TALEP PORTALI'}
                </span>
              </h1>
              <p className="text-xs text-blue-300/80 mt-0.5">
                {currentView === 'odemeler'
                  ? '7 Şantiye ve Birim Ödeme Listeleri Yönetimi'
                  : currentView === 'muavin'
                  ? 'Şantiye Muavin Defteri ve Cari Belgeleri İnceleme'
                  : 'Şantiye ve Birim Talep & Ödeme Takip Sistemi'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-blue-200/90 self-start md:self-auto">
            {/* View Switcher Button */}
            {onViewChange && (
              <button
                type="button"
                onClick={() =>
                  onViewChange(currentView === 'odemeler' || currentView === 'muavin' ? 'talepler' : 'odemeler')
                }
                className={`px-3.5 py-1.5 rounded-xl font-bold border transition flex items-center gap-2 cursor-pointer shadow-md ${
                  currentView === 'odemeler' || currentView === 'muavin'
                    ? 'bg-blue-600 hover:bg-blue-500 text-white border-blue-400'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400 shadow-emerald-600/30'
                }`}
              >
                {currentView === 'odemeler' || currentView === 'muavin' ? (
                  <>
                    <ArrowLeft className="w-4 h-4 text-blue-200" />
                    <span>TALEPLERE GERİ DÖN</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4 text-emerald-100" />
                    <span>ÖDEMELERİ GERÇEKLEŞTİR</span>
                  </>
                )}
              </button>
            )}

            {/* FATURALARI SİL BUTONU (ÖDEMELERİ GERÇEKLEŞTİR VE SUPABASE CANLI ARASINDA) */}
            <button
              id="btn-header-faturalari-sil"
              type="button"
              onClick={() => setShowFaturaSilModal(true)}
              title="Portaldaki durumu ÖDENMESİN olan firmalar hariç diğer evrakları CARIFATURALAR deposundan sil (Silmeden önce onay alır)"
              className="px-3.5 py-1.5 rounded-xl font-black border border-rose-500/70 bg-gradient-to-r from-red-700 via-rose-700 to-red-800 hover:from-red-600 hover:to-rose-600 text-white transition flex items-center gap-1.5 cursor-pointer shadow-md shadow-red-950/50 text-xs active:scale-95 group flex-shrink-0"
            >
              <Trash2 className="w-4 h-4 text-rose-200 group-hover:scale-110 transition-transform" />
              <span>FATURALARI SİL</span>
            </button>

            {/* Supabase Canlı Göstergesi */}
            <div className="flex items-center gap-3 bg-[#0e1d35] px-3.5 py-1.5 rounded-lg border border-blue-800/40">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="font-semibold text-emerald-300">Supabase Canlı</span>
              </div>
              <span className="text-blue-700">|</span>
              <div className="flex items-center gap-1 text-slate-300">
                <Database className="w-3.5 h-3.5 text-blue-400" />
                <span>
                  {currentView === 'odemeler' ? (
                    <strong className="text-emerald-300 font-mono font-bold">
                      7 Adet _odenecek Tablosu
                    </strong>
                  ) : (
                    <>
                      Tablo:{' '}
                      <strong className="text-cyan-300 font-mono font-bold">
                        {activeSite.name} ({activeSite.tableName})
                      </strong>
                    </>
                  )}
                </span>
              </div>
            </div>

            {/* TÜMÜNÜ PDF YAP BUTONU (BÜTÜN SAYFALARDA SUPABASE CANLI YANINDA) */}
            <div className="relative inline-flex items-center">
              <div className="inline-flex rounded-lg shadow-md shadow-red-950/40 border border-red-500/40 overflow-hidden">
                <button
                  id="btn-export-all-pdf"
                  type="button"
                  onClick={() => handleExportAllPdf('current')}
                  disabled={isGeneratingPdf}
                  title="Bütün sayfaların (7 Şantiye) tablolarını ayrı başlık ve alt toplamları ile tek bir PDF dosyasına aktar"
                  className="bg-gradient-to-r from-red-600 via-rose-600 to-red-700 hover:from-red-500 hover:to-rose-500 text-white font-extrabold px-3.5 py-1.5 flex items-center gap-1.5 cursor-pointer transition active:scale-95 text-xs uppercase tracking-wider flex-shrink-0 disabled:opacity-60 disabled:cursor-not-allowed group"
                >
                  {isGeneratingPdf ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                      <span className="font-bold">{pdfProgress || 'PDF HAZIRLANIYOR...'}</span>
                    </>
                  ) : (
                    <>
                      <FileText className="w-4 h-4 text-rose-200 group-hover:scale-110 transition-transform" />
                      <span>TÜMÜNÜ PDF YAP</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPdfMenu(!showPdfMenu)}
                  disabled={isGeneratingPdf}
                  title="PDF Aktarma Seçenekleri"
                  className="bg-red-700 hover:bg-red-600 text-rose-100 px-2 py-1.5 border-l border-red-500/50 flex items-center justify-center cursor-pointer transition"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Açılır Seçenek Menüsü */}
              {showPdfMenu && (
                <div
                  ref={menuRef}
                  className="absolute right-0 top-full mt-1.5 w-64 bg-[#0a1526] border border-blue-800/80 rounded-xl shadow-2xl p-1.5 z-50 animate-fade-in text-xs"
                >
                  <div className="px-2.5 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-blue-900/60 mb-1">
                    PDF Dışa Aktarma Seçenekleri
                  </div>
                  <button
                    type="button"
                    onClick={() => handleExportAllPdf('talepler')}
                    className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-blue-600/30 text-slate-200 hover:text-white flex items-center gap-2 transition cursor-pointer"
                  >
                    <FileText className="w-4 h-4 text-rose-400" />
                    <div className="flex flex-col">
                      <span className="font-bold">Tüm Şantiyeler Talep Listesi</span>
                      <span className="text-[10px] text-slate-400">7 şantiyenin talep tabloları</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportAllPdf('odemeler')}
                    className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-blue-600/30 text-slate-200 hover:text-white flex items-center gap-2 transition cursor-pointer"
                  >
                    <CreditCard className="w-4 h-4 text-emerald-400" />
                    <div className="flex flex-col">
                      <span className="font-bold">Tüm Şantiyeler Ödenecek Listesi</span>
                      <span className="text-[10px] text-slate-400">7 şantiyenin ödenecek tabloları</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleExportOdensinlerPdf('current')}
                    className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-emerald-600/30 text-slate-200 hover:text-white flex items-center gap-2 transition cursor-pointer border-t border-blue-900/50 mt-1 pt-2"
                  >
                    <FileCheck2 className="w-4 h-4 text-emerald-400" />
                    <div className="flex flex-col">
                      <span className="font-bold text-emerald-300">Ödensinleri PDF İndir</span>
                      <span className="text-[10px] text-slate-400">Sadece ÖDENSİN ve BEKLESİN olanlar</span>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* ÖDENSİNLERİ PDF İNDİR BUTONU (TÜMÜNÜ PDF YAP YANINDA) */}
            <button
              id="btn-export-odensinler-pdf"
              type="button"
              onClick={() => handleExportOdensinlerPdf('current')}
              disabled={isGeneratingPdf}
              title="Bütün sayfalardaki durumu ÖDENSİN ve BEKLESİN olan talepleri her şantiye başlığı ve alt toplamlarıyla tek bir PDF olarak indir"
              className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold px-3.5 py-1.5 rounded-lg border border-emerald-400/50 shadow-md shadow-emerald-950/40 flex items-center gap-1.5 cursor-pointer transition active:scale-95 text-xs uppercase tracking-wider flex-shrink-0 disabled:opacity-60 disabled:cursor-not-allowed group"
            >
              {isGeneratingPdf && pdfActionType === 'odensinler' ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                  <span className="font-bold">{pdfProgress || 'PDF HAZIRLANIYOR...'}</span>
                </>
              ) : (
                <>
                  <FileCheck2 className="w-4 h-4 text-emerald-200 group-hover:scale-110 transition-transform" />
                  <span>ÖDENSİNLERİ PDF İNDİR</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Global Toast Notifications */}
        {successMsg && (
          <div className="fixed bottom-6 right-6 z-50 bg-[#06241b] border-2 border-emerald-500 text-emerald-100 px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 text-xs font-semibold animate-fade-in">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <span>{successMsg}</span>
            <button
              type="button"
              onClick={() => setSuccessMsg(null)}
              className="ml-2 text-emerald-400 hover:text-white p-1 rounded-md"
            >
              ✕
            </button>
          </div>
        )}
        {errorMsg && (
          <div className="fixed bottom-6 right-6 z-50 bg-[#280c14] border-2 border-rose-500 text-rose-100 px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 text-xs font-semibold animate-fade-in">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-400 animate-ping"></span>
            <span>{errorMsg}</span>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              className="ml-2 text-rose-400 hover:text-white p-1 rounded-md"
            >
              ✕
            </button>
          </div>
        )}

        {/* Navigation Tabs (7 Individual Sites) - Shown when in talepler mode */}
        {currentView === 'talepler' && (
          <div className="py-2.5">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-blue-800">
              {SITES.map((site) => {
                const isActive = activeSite.id === site.id;
                const count = siteCounts[site.id];

                return (
                  <button
                    key={site.id}
                    id={`btn-tab-${site.id}`}
                    onClick={() => onSelectSite(site)}
                    type="button"
                    className={`flex-shrink-0 px-4 py-2 rounded-xl font-black text-xs sm:text-sm tracking-wide uppercase transition-all duration-200 flex items-center gap-2 border ${
                      isActive
                        ? 'bg-blue-600 text-white border-blue-400 shadow-lg shadow-blue-600/30 scale-[1.02]'
                        : 'bg-[#0f213d]/80 text-blue-200 hover:text-white hover:bg-blue-900/50 border-blue-900/50 hover:border-blue-700'
                    }`}
                  >
                    <Layers className={`w-4 h-4 ${isActive ? 'text-white' : 'text-blue-400'}`} />
                    <span>{site.name}</span>
                    {typeof count === 'number' && (
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                          isActive
                            ? 'bg-white/25 text-white'
                            : count > 0
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'bg-blue-950 text-blue-300 border border-blue-800/60'
                        }`}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* FATURALARI SİL MODALI */}
      <FaturaSilModal
        isOpen={showFaturaSilModal}
        onClose={() => setShowFaturaSilModal(false)}
        onSuccess={() => {
          setSuccessMsg('Fatura temizleme işlemi başarıyla tamamlandı.');
          setTimeout(() => setSuccessMsg(null), 5000);
        }}
      />
    </header>
  );
};
