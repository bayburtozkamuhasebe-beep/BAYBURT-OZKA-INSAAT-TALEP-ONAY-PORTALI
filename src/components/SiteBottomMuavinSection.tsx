import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  FileText,
  Search,
  RefreshCw,
  ExternalLink,
  Download,
  Maximize2,
  Minimize2,
  AlertCircle,
  Upload,
  CheckCircle2,
  FolderOpen,
  ChevronDown,
  ChevronUp,
  X
} from 'lucide-react';
import { SiteConfig } from '../types';
import {
  MuavinFileInfo,
  MuavinSiteMapping,
  MUAVIN_SITE_MAPPINGS,
  getDirectSiteMuavinFiles,
  uploadMuavinFileToFolder
} from '../lib/muavinService';
import { PdfCanvasViewer } from './PdfCanvasViewer';

interface SiteBottomMuavinSectionProps {
  site: SiteConfig;
}

export const SiteBottomMuavinSection: React.FC<SiteBottomMuavinSectionProps> = ({ site }) => {
  // If in 'all' sites mode, let user switch between sites, default to 'arnavutkoy'
  const [activeSiteKey, setActiveSiteKey] = useState<string>(
    site.id === 'all' ? 'arnavutkoy' : site.id
  );

  // Update activeSiteKey when site prop changes
  useEffect(() => {
    if (site.id !== 'all') {
      setActiveSiteKey(site.id);
    }
  }, [site.id]);

  const [loading, setLoading] = useState<boolean>(true);
  const [currentFile, setCurrentFile] = useState<MuavinFileInfo | null>(null);
  const [availableFiles, setAvailableFiles] = useState<MuavinFileInfo[]>([]);
  const [currentMapping, setCurrentMapping] = useState<MuavinSiteMapping>(
    MUAVIN_SITE_MAPPINGS[activeSiteKey] || MUAVIN_SITE_MAPPINGS.arnavutkoy
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  // Search Textbox State
  const [searchText, setSearchText] = useState<string>('');
  const [activeSearchQuery, setActiveSearchQuery] = useState<string>('');
  const [searchStatus, setSearchStatus] = useState<{
    status: 'idle' | 'searching' | 'found' | 'not_found';
    count?: number;
    page?: number;
  }>({ status: 'idle' });

  // Fullscreen and Collapsed state
  const [fullscreen, setFullscreen] = useState<boolean>(false);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const sectionRef = useRef<HTMLDivElement | null>(null);

  // Load PDF for the active site key
  const loadPdfForSite = useCallback(async (siteKey: string) => {
    setLoading(true);
    setErrorMessage(null);
    setUploadSuccess(null);

    try {
      const result = await getDirectSiteMuavinFiles(siteKey);
      setCurrentMapping(result.mapping);
      setAvailableFiles(result.files);

      if (result.files && result.files.length > 0) {
        setCurrentFile(result.files[0]);
      } else {
        setCurrentFile(null);
      }
    } catch (err: any) {
      console.error('Error fetching direct muavin file:', err);
      setErrorMessage('PDF aranırken bir hata oluştu: ' + (err.message || 'Bilinmeyen hata'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPdfForSite(activeSiteKey);
  }, [activeSiteKey, loadPdfForSite]);

  // Listen for jump events from the payment table (when user clicks a Cari bakiye badge)
  useEffect(() => {
    const handleJump = (e: any) => {
      if (e.detail?.query) {
        if (e.detail.siteKey && site.id === 'all') {
          setActiveSiteKey(e.detail.siteKey);
        }
        setIsCollapsed(false);
        setSearchText(e.detail.query);
        setActiveSearchQuery(e.detail.query);
        setSearchStatus({ status: 'searching' });
        setTimeout(() => {
          sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 60);
      }
    };
    window.addEventListener('muavin-jump-search', handleJump);
    return () => {
      window.removeEventListener('muavin-jump-search', handleJump);
    };
  }, [site.id]);

  // Handle Search Submission from the Prominent Search Textbox
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchText.trim();
    if (!query) return;
    setActiveSearchQuery(query);
    setSearchStatus({ status: 'searching' });
  };

  const handleClearSearch = () => {
    setSearchText('');
    setActiveSearchQuery('');
    setSearchStatus({ status: 'idle' });
  };

  // Search status change from viewer
  const handleSearchStatusChange = useCallback(
    (status: 'searching' | 'found' | 'not_found', count?: number, page?: number) => {
      setSearchStatus({ status, count, page });
    },
    []
  );

  // Handle manual file upload directly into this site's folder
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      alert('Lütfen yalnızca .pdf uzantılı bir dosya seçiniz.');
      return;
    }

    setUploading(true);
    setErrorMessage(null);
    setUploadSuccess(null);

    try {
      const res = await uploadMuavinFileToFolder(currentMapping.folderName, file);
      if (res.success) {
        setUploadSuccess(`"${file.name}" başarıyla MUAVINLER/${currentMapping.folderName} klasörüne yüklendi!`);
        // Reload folder
        await loadPdfForSite(activeSiteKey);
      } else {
        setErrorMessage('Yükleme başarısız: ' + (res.error || 'Bilinmeyen hata'));
      }
    } catch (err: any) {
      setErrorMessage('Dosya yüklenirken bir sorun oluştu: ' + (err.message || 'Hata'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // All sites list for switching when site.id === 'all'
  const siteListKeys = [
    { key: 'arnavutkoy', label: 'ARNAVUTKÖY' },
    { key: 'mamak', label: 'MAMAK-ANKARA' },
    { key: 'senbay_ozka', label: 'ŞENBAY-ÖZKA' },
    { key: 'merkez_ozka', label: 'MERKEZ ÖZKA' },
    { key: 'msb_ozka', label: 'MSB ÖZKA' },
    { key: 'seka', label: 'SEKA' },
    { key: 'diger', label: 'DİĞER' }
  ];

  return (
    <div
      ref={sectionRef}
      id="muavin-alt-bolum"
      className={`w-full mt-10 transition-all duration-300 ${
        fullscreen
          ? 'fixed inset-0 z-50 bg-[#040914] p-4 sm:p-6 overflow-y-auto'
          : 'relative'
      }`}
    >
      <div className="w-full max-w-[1750px] mx-auto bg-[#071329] border border-blue-800/60 rounded-2xl shadow-2xl overflow-hidden">
        {/* ÜST BAŞLIK & ŞANTİYE BİLGİSİ */}
        <div className="bg-gradient-to-r from-[#0a1b38] via-[#091a35] to-[#061226] border-b border-blue-800/70 p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-sky-400 shadow-inner">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-black text-white tracking-wide">
                  {currentMapping.siteName} MUAVİN DEFTERİ
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/20 text-sky-300 border border-blue-400/30">
                  MUAVINLER / {currentMapping.folderName}
                </span>
                {currentFile && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono text-emerald-300 bg-emerald-950/60 border border-emerald-500/30 hidden sm:inline">
                    {currentFile.name}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Şantiye muavin defteri PDF belgesi ve hızlı cari arama alanı
              </p>
            </div>
          </div>

          {/* SAĞ ÜST KONTROLLER: YENİLE, TAM EKRAN, DARALT/GENİŞLET */}
          <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end flex-wrap">
            {/* Şantiye Değiştirme Butonları (Tüm Şantiyeler modunda veya hızlı geçiş için) */}
            {site.id === 'all' && (
              <div className="flex items-center gap-1 overflow-x-auto max-w-full pb-1 md:pb-0">
                {siteListKeys.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setActiveSiteKey(s.key)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                      activeSiteKey === s.key
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-blue-950/60 text-slate-300 hover:text-white hover:bg-blue-900/60 border border-blue-800/40'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => loadPdfForSite(activeSiteKey)}
              disabled={loading}
              className="px-3 py-1.5 rounded-xl bg-blue-950/80 hover:bg-blue-900 text-blue-300 hover:text-white border border-blue-800/60 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Klasörü Yeniden Tara"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Yenile</span>
            </button>

            {currentFile && (
              <>
                <a
                  href={currentFile.publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-xl bg-blue-950/80 hover:bg-blue-900 text-blue-300 hover:text-white border border-blue-800/60 text-xs font-bold transition flex items-center gap-1.5"
                  title="PDF'i Yeni Sekmede Aç"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Yeni Sekme</span>
                </a>

                <a
                  href={currentFile.publicUrl}
                  download={currentFile.name}
                  className="px-3 py-1.5 rounded-xl bg-blue-950/80 hover:bg-blue-900 text-blue-300 hover:text-white border border-blue-800/60 text-xs font-bold transition flex items-center gap-1.5"
                  title="PDF Dosyasını İndir"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">İndir</span>
                </a>
              </>
            )}

            <button
              type="button"
              onClick={() => setFullscreen(!fullscreen)}
              className="px-3 py-1.5 rounded-xl bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 hover:text-white border border-indigo-800/60 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
              title={fullscreen ? 'Normal Görünüme Dön' : 'Tam Ekran Yap'}
            >
              {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{fullscreen ? 'Küçült' : 'Tam Ekran'}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-1.5 rounded-xl bg-blue-950/80 hover:bg-blue-900 text-slate-400 hover:text-white border border-blue-800/60 transition cursor-pointer"
              title={isCollapsed ? 'Genişlet' : 'Daralt'}
            >
              {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* BİR ADET TE ARAMA TEXBOKSU (KULLANICI İSTEĞİ) */}
        {!isCollapsed && currentFile && (
          <div className="bg-[#050e1e] border-b border-blue-800/50 p-3 sm:p-4">
            <form
              onSubmit={handleSearchSubmit}
              className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 max-w-4xl mx-auto"
            >
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-sky-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder={`${currentMapping.siteName} Muavin Defterinde Firma / Cari / Kelime Ara (Örn: ÇİMTAŞ, BETON, 120...)...`}
                  className="w-full bg-[#030914] border-2 border-blue-700/70 hover:border-blue-500 focus:border-sky-400 rounded-xl pl-10 pr-9 py-2.5 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 transition shadow-inner font-medium"
                />
                {searchText && (
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
                    title="Temizle"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={!searchText.trim()}
                  className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-black text-sm transition shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Search className="w-4 h-4" />
                  <span>PDF İçinde Ara</span>
                </button>

                {searchStatus.status === 'found' && (
                  <div className="px-3 py-2 rounded-xl bg-emerald-950/70 border border-emerald-500/50 text-emerald-300 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap animate-fade-in">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>✓ Sayfa {searchStatus.page}&apos;ye gidildi ({searchStatus.count} sonuç)</span>
                  </div>
                )}

                {searchStatus.status === 'not_found' && (
                  <div className="px-3 py-2 rounded-xl bg-amber-950/70 border border-amber-500/50 text-amber-300 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap animate-fade-in">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                    <span>Bu muavinde kayıt bulunamadı</span>
                  </div>
                )}

                {searchStatus.status === 'searching' && (
                  <div className="px-3 py-2 rounded-xl bg-sky-950/70 border border-sky-500/50 text-sky-300 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap animate-pulse">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Taranıyor...</span>
                  </div>
                )}
              </div>
            </form>
          </div>
        )}

        {/* GÖVDE: PDF AÇIK VEYA YÜKLEME UYARISI */}
        {!isCollapsed && (
          <div className="w-full">
            {loading ? (
              <div className="flex flex-col items-center justify-center p-16 text-slate-400 space-y-3">
                <RefreshCw className="w-9 h-9 text-sky-400 animate-spin" />
                <p className="font-bold text-sm text-slate-200">
                  MUAVINLER/{currentMapping.folderName} klasörü taranıyor...
                </p>
                <p className="text-xs text-slate-500">Lütfen bekleyiniz...</p>
              </div>
            ) : errorMessage ? (
              <div className="flex flex-col items-center justify-center p-12 text-center max-w-md mx-auto space-y-3">
                <AlertCircle className="w-10 h-10 text-rose-400" />
                <p className="font-bold text-slate-200 text-sm">{errorMessage}</p>
                <button
                  type="button"
                  onClick={() => loadPdfForSite(activeSiteKey)}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition cursor-pointer"
                >
                  Tekrar Dene
                </button>
              </div>
            ) : currentFile ? (
              /* PDF DOSYASI VARSA PROGRAMIN İÇİNDE EN ALTTA AÇ */
              <div className="w-full min-h-[650px] lg:min-h-[780px] flex flex-col bg-[#050a16]">
                <PdfCanvasViewer
                  key={currentFile.publicUrl}
                  url={currentFile.publicUrl}
                  fileName={currentFile.name}
                  initialSearchTerm={activeSearchQuery}
                  onSearchStatusChange={handleSearchStatusChange}
                />
              </div>
            ) : (
              /* PDF DOSYASI YOKSA ŞIK BİLGİLENDİRME VE YÜKLEME ALANI */
              <div className="flex flex-col items-center justify-center p-10 sm:p-16 text-center max-w-xl mx-auto space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-blue-950/80 border border-blue-800/60 flex items-center justify-center text-sky-400 shadow-lg">
                  <FolderOpen className="w-8 h-8" />
                </div>

                <div className="space-y-1">
                  <h4 className="text-base font-bold text-white">
                    {currentMapping.siteName} Muavin Dosyası Henüz Yüklenmemiş
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Supabase Storage üzerinde <span className="font-mono text-sky-300">MUAVINLER/{currentMapping.folderName}</span> klasöründe henüz bir PDF dosyası bulunmamaktadır.
                  </p>
                </div>

                {uploadSuccess && (
                  <div className="w-full p-3 rounded-xl bg-emerald-950/60 border border-emerald-600/50 text-emerald-300 text-xs font-bold flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{uploadSuccess}</span>
                  </div>
                )}

                <div className="pt-2 flex flex-col sm:flex-row items-center gap-3 w-full justify-center">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    onChange={handleFileUpload}
                    className="hidden"
                    id={`bottom-pdf-upload-${activeSiteKey}`}
                  />
                  <label
                    htmlFor={`bottom-pdf-upload-${activeSiteKey}`}
                    className={`w-full sm:w-auto px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-lg ${
                      uploading ? 'opacity-50 pointer-events-none' : ''
                    }`}
                  >
                    {uploading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Yükleniyor...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        <span>Bu Şantiye İçin PDF Muavin Yükle</span>
                      </>
                    )}
                  </label>

                  <button
                    type="button"
                    onClick={() => loadPdfForSite(activeSiteKey)}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-blue-950/80 hover:bg-blue-900 text-slate-300 hover:text-white border border-blue-800/60 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Yeniden Tara</span>
                  </button>
                </div>

                <p className="text-[11px] text-slate-500 pt-2">
                  Dosyayı Supabase panelinden doğrudan <span className="font-mono text-slate-400">MUAVINLER/{currentMapping.folderName}</span> klasörüne de yükleyebilirsiniz.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
