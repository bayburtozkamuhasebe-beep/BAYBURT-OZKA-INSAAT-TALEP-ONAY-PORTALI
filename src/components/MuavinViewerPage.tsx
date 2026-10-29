import React, { useState, useEffect, useCallback } from 'react';
import { TalepRecord } from '../types';
import { PdfCanvasViewer } from './PdfCanvasViewer';
import {
  MuavinSiteMapping,
  MUAVIN_SITE_MAPPINGS,
  MuavinFileInfo,
  getMuavinFilesForFolder
} from '../lib/muavinService';
import {
  getFirmaUnvani,
  getIban,
  getTutar,
  getTalepEden,
  getAciklama,
  getRecordStatus,
  formatCurrency
} from '../lib/recordUtils';
import { supabase } from '../lib/supabase';
import {
  ArrowLeft,
  FileText,
  Building2,
  ExternalLink,
  Download,
  RefreshCw,
  Copy,
  Check,
  Search,
  UploadCloud,
  AlertCircle,
  FolderOpen,
  CheckCircle2,
  Clock,
  XCircle,
  Maximize2,
  Sparkles
} from 'lucide-react';

interface MuavinViewerPageProps {
  initialSiteKey: string;
  record: TalepRecord | null;
  onBackToTalepList: () => void;
}

export const MuavinViewerPage: React.FC<MuavinViewerPageProps> = ({
  initialSiteKey,
  record,
  onBackToTalepList
}) => {
  const [selectedSiteKey, setSelectedSiteKey] = useState<string>(initialSiteKey);
  const [files, setFiles] = useState<MuavinFileInfo[]>([]);
  const [selectedFile, setSelectedFile] = useState<MuavinFileInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [uploading, setUploading] = useState<boolean>(false);
  const [copiedFirma, setCopiedFirma] = useState<boolean>(false);
  const [fullscreen, setFullscreen] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [viewerMode, setViewerMode] = useState<'canvas' | 'browser'>('canvas');
  const [cariStatus, setCariStatus] = useState<{
    status: 'idle' | 'searching' | 'found' | 'not_found';
    page?: number;
    count?: number;
    matchTierLabel?: string;
  }>({ status: 'idle' });

  const firmaUnvani = record ? getFirmaUnvani(record) : null;
  const tutar = record ? getTutar(record) : null;
  const iban = record ? getIban(record) : null;
  const talepEden = record ? getTalepEden(record) : null;
  const aciklama = record ? getAciklama(record) : null;
  const status = record ? getRecordStatus(record) : null;

  const currentMapping: MuavinSiteMapping =
    MUAVIN_SITE_MAPPINGS[selectedSiteKey] || MUAVIN_SITE_MAPPINGS.arnavutkoy;

  // Load files for selected site
  const loadFiles = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const list = await getMuavinFilesForFolder(currentMapping);
      setFiles(list);
      if (list.length > 0) {
        setSelectedFile(list[0]);
      } else {
        setSelectedFile(null);
      }
    } catch (err: any) {
      console.error('Error loading muavin files:', err);
      setErrorMessage('PDF dosyası yüklenirken bir hata oluştu: ' + (err.message || 'Bilinmeyen hata'));
    } finally {
      setLoading(false);
    }
  }, [currentMapping]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    if (firmaUnvani && firmaUnvani !== '-') {
      setCariStatus({ status: 'searching' });
    } else {
      setCariStatus({ status: 'idle' });
    }
  }, [selectedFile?.publicUrl, firmaUnvani]);

  const handleSearchStatusChange = useCallback(
    (status: 'searching' | 'found' | 'not_found', count?: number, page?: number, matchTierLabel?: string) => {
      setCariStatus({ status, count, page, matchTierLabel });
    },
    []
  );

  const handleCopyFirma = (text: string) => {
    if (!text || text === '-') return;
    navigator.clipboard.writeText(text);
    setCopiedFirma(true);
    setTimeout(() => setCopiedFirma(false), 2000);
  };

  // Upload fallback if user wants to upload directly into the folder
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      alert('Lütfen sadece PDF formatında bir dosya seçiniz.');
      return;
    }

    setUploading(true);
    try {
      const folder = currentMapping.folderName;
      const targetPath = `${folder}/${file.name}`;

      const { error } = await supabase.storage
        .from('MUAVINLER')
        .upload(targetPath, file, { upsert: true });

      if (error) throw error;

      await loadFiles();
    } catch (err: any) {
      alert('Dosya yüklenirken hata oluştu: ' + (err.message || 'Bilinmeyen hata'));
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div
      className={`min-h-screen bg-[#070e1b] text-slate-100 flex flex-col font-['Plus_Jakarta_Sans',sans-serif] ${
        fullscreen ? 'fixed inset-0 z-50 p-0' : 'p-3 sm:p-5 lg:p-6'
      }`}
    >
      {/* TOP BAR / NAVIGATION - KOYU MAVİ TEMALI */}
      <div className="w-full max-w-[1920px] mx-auto mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#0c182b] border border-blue-900/60 p-3 sm:p-4 rounded-2xl shadow-xl backdrop-blur-md">
        {/* GERİ DÖN BUTONU */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToTalepList}
            className="px-4 sm:px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-xs sm:text-sm transition-all duration-150 flex items-center gap-2.5 shadow-lg shadow-blue-950/60 border border-blue-400/30 cursor-pointer active:scale-95"
            title="Talep Listesi Tablosuna Geri Dön"
          >
            <ArrowLeft className="w-4 h-4 stroke-[3]" />
            <span>TALEP ONAY LİSTESİNE GERİ DÖN</span>
          </button>

          <div className="hidden md:block h-7 w-[1px] bg-blue-800/60" />

          <div className="hidden md:flex items-center gap-2 text-xs font-semibold text-blue-300/80">
            <span className="text-slate-400">Depolama:</span>
            <span className="font-mono text-sky-400 bg-blue-950/80 px-2 py-0.5 rounded border border-blue-800/60">
              MUAVINLER / {currentMapping.folderName}
            </span>
          </div>
        </div>

        {/* SAĞ ÜST KONTROLLER: YENİLE, TAM EKRAN, YENİ SEKME */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          <button
            type="button"
            onClick={loadFiles}
            disabled={loading}
            className="px-3 py-2 rounded-xl bg-blue-950/80 hover:bg-blue-900 text-blue-300 hover:text-white border border-blue-800/60 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Dosyaları Yeniden Tara"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden xs:inline">Yenile</span>
          </button>

          {selectedFile && (
            <>
              <a
                href={selectedFile.publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 rounded-xl bg-blue-950/80 hover:bg-blue-900 text-blue-300 hover:text-white border border-blue-800/60 text-xs font-bold transition flex items-center gap-1.5"
                title="Yeni Sekmede Aç"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Yeni Sekmede Aç</span>
              </a>

              <a
                href={selectedFile.publicUrl}
                download={selectedFile.name}
                className="px-3 py-2 rounded-xl bg-blue-950/80 hover:bg-blue-900 text-blue-300 hover:text-white border border-blue-800/60 text-xs font-bold transition flex items-center gap-1.5"
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
            className="px-3 py-2 rounded-xl bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 hover:text-white border border-indigo-800/60 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
            title={fullscreen ? 'Normal Görünüm' : 'Tam Ekran'}
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{fullscreen ? 'Küçült' : 'Tam Ekran'}</span>
          </button>
        </div>
      </div>

      {/* ŞANTİYE SEKMELERİ - KOYU MAVİ TASARIM */}
      <div className="w-full max-w-[1920px] mx-auto mb-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-blue-800">
          {Object.values(MUAVIN_SITE_MAPPINGS).map((mapping) => {
            const isActive = selectedSiteKey === mapping.siteKey;
            return (
              <button
                key={mapping.siteKey}
                type="button"
                onClick={() => setSelectedSiteKey(mapping.siteKey)}
                className={`px-4 py-2 rounded-xl text-xs font-black tracking-wide whitespace-nowrap transition-all duration-150 flex items-center gap-2 border cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white border-blue-400 shadow-md shadow-blue-950/80 scale-[1.02]'
                    : 'bg-[#0c182b] hover:bg-[#12233f] text-slate-300 hover:text-white border-blue-900/50'
                }`}
              >
                <FolderOpen className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-blue-400'}`} />
                <span>{mapping.siteName}</span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                    isActive
                      ? 'bg-blue-800/80 text-blue-100'
                      : 'bg-blue-950/60 text-blue-300/80 border border-blue-900/60'
                  }`}
                >
                  {mapping.folderName}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* SEÇİLİ TALEP DETAY KARTI (VARSA) - HANGİ FİRMA KONTROL EDİLİYORSA EN ÜSTTE BELİRGİN VE KOPYALANABİLİR */}
      {record && firmaUnvani && (
        <div className="w-full max-w-[1920px] mx-auto mb-4 bg-gradient-to-r from-[#0c192e] via-[#0f203b] to-[#0c192e] border border-blue-800/50 rounded-2xl p-4 shadow-xl">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-blue-600/20 border border-blue-500/40 text-blue-400 flex items-center justify-center flex-shrink-0 shadow-inner">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold tracking-wider uppercase text-blue-400">
                    KONTROL EDİLEN TALEP CARİSİ
                  </span>
                  {status && (
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full border ${
                        status === 'ÖDENSİN'
                          ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60'
                          : status === 'ÖDENMESİN'
                          ? 'bg-rose-950/80 text-rose-300 border-rose-700/60'
                          : 'bg-amber-950/80 text-amber-300 border-amber-700/60'
                      }`}
                    >
                      {status === 'ÖDENSİN' && <CheckCircle2 className="w-3 h-3" />}
                      {status === 'ÖDENMESİN' && <XCircle className="w-3 h-3" />}
                      {status === 'BEKLESİN' && <Clock className="w-3 h-3" />}
                      {status}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <h2 className="text-base sm:text-lg font-black text-white tracking-tight">
                    {firmaUnvani}
                  </h2>
                  <button
                    type="button"
                    onClick={() => handleCopyFirma(firmaUnvani)}
                    className="p-1.5 rounded-lg bg-blue-900/60 hover:bg-blue-800 text-blue-200 hover:text-white transition cursor-pointer border border-blue-700/40"
                    title="Firma Ünvanını Kopyala (PDF içinde aramak için)"
                  >
                    {copiedFirma ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                  {copiedFirma && (
                    <span className="text-[11px] font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                      Kopyalandı!
                    </span>
                  )}
                  {cariStatus.status === 'not_found' ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-600 text-white font-black text-xs shadow-md border border-rose-400 animate-pulse">
                      <XCircle className="w-3.5 h-3.5 text-white" />
                      CARİ BULUNMAMAKTADIR
                    </span>
                  ) : cariStatus.status === 'found' ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-600/90 text-white font-bold text-xs shadow-sm border border-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                      <span>Cari Bulundu {cariStatus.page ? `(Sayfa ${cariStatus.page})` : ''}</span>
                      {cariStatus.matchTierLabel && (
                        <span className="bg-emerald-950/80 text-emerald-200 px-1.5 py-0.2 rounded text-[10px] font-mono border border-emerald-500/40">
                          {cariStatus.matchTierLabel}
                        </span>
                      )}
                    </span>
                  ) : cariStatus.status === 'searching' ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-950/90 text-sky-300 font-semibold text-xs border border-blue-700/60">
                      <RefreshCw className="w-3 h-3 text-sky-400 animate-spin" />
                      Muavinde Kademeli Aranıyor (Tam Ad/25/15/10)...
                    </span>
                  ) : (
                    <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold text-sky-300 bg-blue-950/80 px-2.5 py-0.5 rounded-full border border-blue-700/50">
                      <Sparkles className="w-3 h-3 text-sky-400" />
                      Kademeli Arama (Tam Ad &gt; 25 &gt; 15 &gt; 10 Karakter)
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* TALEP BİLGİLERİ IZGARASI */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs">
              {tutar !== null && (
                <div className="bg-[#081220] border border-blue-900/60 px-3.5 py-2 rounded-xl">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Talep Tutarı:</span>
                  <span className="font-mono font-black text-sm text-emerald-400">
                    {formatCurrency(tutar)}
                  </span>
                </div>
              )}

              {iban && iban !== '-' && (
                <div className="bg-[#081220] border border-blue-900/60 px-3.5 py-2 rounded-xl">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">IBAN No:</span>
                  <span className="font-mono font-semibold text-slate-200">{iban}</span>
                </div>
              )}

              {talepEden && (
                <div className="bg-[#081220] border border-blue-900/60 px-3.5 py-2 rounded-xl">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Talep Eden:</span>
                  <span className="font-bold text-slate-200">{talepEden}</span>
                </div>
              )}

              {aciklama && (
                <div className="bg-[#081220] border border-blue-900/60 px-3.5 py-2 rounded-xl max-w-xs">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Açıklama:</span>
                  <span className="font-medium text-slate-300 truncate block">{aciklama}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ANA GÖVDE: PDF GÖRÜNTÜLEYİCİ - PROGRAMIN İÇİNDE AÇILIŞ */}
      <div className="w-full max-w-[1920px] mx-auto flex-1 flex flex-col bg-[#0c182b] border border-blue-900/60 rounded-2xl shadow-2xl overflow-hidden min-h-[600px] lg:min-h-[750px]">
        {/* PDF BAŞLIK / SEÇİM BARI */}
        <div className="bg-[#081220] border-b border-blue-900/60 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-sky-400" />
            <span className="font-black text-slate-200 text-sm tracking-wide">
              {currentMapping.siteName} MUAVİN DEFTERİ
            </span>
            <span className="font-mono text-[11px] text-sky-300/80 bg-blue-950/70 border border-blue-800/40 px-2 py-0.5 rounded">
              Klasör: MUAVINLER/{currentMapping.folderName}
            </span>
          </div>

          {/* Görüntüleyici Modu ve Dışa Aktarma Butonları */}
          {selectedFile && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 bg-[#061120] p-1 rounded-xl border border-blue-900/60">
                <button
                  type="button"
                  onClick={() => setViewerMode('canvas')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    viewerMode === 'canvas'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="HTML5 Yerleşik PDF Okuyucu (Önerilen - Engellenmez)"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Yerleşik Okuyucu (Canvas)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setViewerMode('browser')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    viewerMode === 'browser'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Tarayıcı PDF Görüntüleyicisi (iframe)"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Tarayıcı Görünümü</span>
                </button>
              </div>

              {/* Dışarıda Aç & İndir Doğrudan Butonları */}
              <div className="flex items-center gap-1.5">
                <a
                  href={selectedFile.publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 hover:text-white font-bold text-xs flex items-center gap-1.5 border border-slate-700/60 transition shadow-xs"
                  title="PDF dosyasını yeni tarayıcı sekmesinde tam boy aç"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Yeni Sekmede Aç</span>
                </a>
                <a
                  href={selectedFile.publicUrl}
                  download={selectedFile.name}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs flex items-center gap-1.5 border border-slate-700/60 transition shadow-xs"
                  title="PDF dosyasını bilgisayara indir"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>İndir</span>
                </a>
              </div>
            </div>
          )}

          {/* Klasördeki veya Sistemdeki Muavin PDF'leri Seçim Dropdown */}
          {files.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-bold">Açık Defter:</span>
              <select
                value={selectedFile?.fullPath || ''}
                onChange={(e) => {
                  const f = files.find((item) => item.fullPath === e.target.value);
                  if (f) setSelectedFile(f);
                }}
                className="bg-[#0f2139] border border-blue-700/60 text-white font-bold rounded-lg px-2.5 py-1 text-xs outline-none focus:border-sky-400"
              >
                {files.map((f) => (
                  <option key={f.fullPath} value={f.fullPath}>
                    {f.siteLabel ? `[${f.siteLabel}] ${f.name}` : f.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {selectedFile && (
            <div className="text-slate-400 font-mono text-[11px] flex items-center gap-3">
              <span>{selectedFile.name}</span>
              {selectedFile.size && (
                <span>{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</span>
              )}
            </div>
          )}
        </div>

        {/* İÇERİK: YÜKLENİYOR / HATA / PDF IFRAME / BOŞ DURUM */}
        <div className="flex-1 relative flex flex-col bg-[#050b14]">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-slate-400 space-y-3">
              <RefreshCw className="w-8 h-8 text-sky-400 animate-spin" />
              <p className="font-bold text-sm text-slate-300">
                MUAVINLER/{currentMapping.folderName} klasöründeki PDF taranıyor...
              </p>
              <p className="text-xs text-slate-500">Lütfen bekleyiniz...</p>
            </div>
          ) : errorMessage ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center max-w-md mx-auto space-y-3">
              <AlertCircle className="w-10 h-10 text-amber-400" />
              <p className="font-bold text-slate-200">{errorMessage}</p>
              <button
                type="button"
                onClick={loadFiles}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition"
              >
                Tekrar Dene
              </button>
            </div>
          ) : selectedFile ? (
            <div className="w-full flex-1 h-full min-h-[650px] lg:min-h-[780px] flex flex-col">
              {viewerMode === 'canvas' ? (
                <PdfCanvasViewer
                  key={selectedFile.publicUrl}
                  url={selectedFile.publicUrl}
                  fileName={selectedFile.name}
                  initialSearchTerm={firmaUnvani || ''}
                  onSearchStatusChange={handleSearchStatusChange}
                />
              ) : (
                <div className="w-full flex-1 flex flex-col relative">
                  <div className="bg-amber-950/40 border-b border-amber-800/40 p-2 text-center text-xs text-amber-300">
                    Tarayıcınız veya önizleme penceresi iframe içinde PDF açmayı engelliyorsa yukarıdaki{' '}
                    <button
                      type="button"
                      onClick={() => setViewerMode('canvas')}
                      className="font-bold underline text-white hover:text-sky-300 cursor-pointer"
                    >
                      &quot;Yerleşik Okuyucu (Canvas)&quot;
                    </button>{' '}
                    moduna geçebilir veya{' '}
                    <a
                      href={selectedFile.publicUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold underline text-white hover:text-sky-300"
                    >
                      Yeni Sekmede Aç
                    </a>{' '}
                    bağlantısını kullanabilirsiniz.
                  </div>
                  <object
                    data={`${selectedFile.publicUrl}#toolbar=1&navpanes=1&statusbar=1`}
                    type="application/pdf"
                    className="w-full flex-1 border-0 rounded-b-2xl bg-[#1e293b]"
                    style={{ height: fullscreen ? 'calc(100vh - 160px)' : '750px' }}
                  >
                    <iframe
                      id="muavin-pdf-viewer"
                      src={`${selectedFile.publicUrl}#toolbar=1&navpanes=1&statusbar=1`}
                      title={`${currentMapping.siteName} Muavin PDF`}
                      className="w-full flex-1 border-0 rounded-b-2xl bg-[#1e293b]"
                      style={{ height: fullscreen ? 'calc(100vh - 160px)' : '750px' }}
                    />
                  </object>
                </div>
              )}
            </div>
          ) : (
            /* DOSYA BULUNAMADIĞINDA ŞIK BİLGİLENDİRME & ANINDA YÜKLEME ALANI */
            <div className="flex-1 flex flex-col items-center justify-center p-8 sm:p-12 text-center max-w-xl mx-auto space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-blue-950/60 border border-blue-800/60 text-blue-400 flex items-center justify-center shadow-lg">
                <FolderOpen className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-black text-white">
                  Henüz Muavin PDF Dosyası Yüklenmemiş
                </h3>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                  Supabase Storage <span className="font-mono text-sky-400 font-bold">MUAVINLER/{currentMapping.folderName}</span> klasöründe henüz bir PDF dosyası bulunmamaktadır.
                </p>
              </div>

              {/* Hızlı Yükleme Seçeneği */}
              <div className="pt-2 w-full">
                <label className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-blue-950/80 border border-blue-400/40 cursor-pointer transition active:scale-95">
                  {uploading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Yükleniyor...</span>
                    </>
                  ) : (
                    <>
                      <UploadCloud className="w-4 h-4" />
                      <span>Bu Şantiyeye Muavin PDF Yükle</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept=".pdf"
                    disabled={uploading}
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
                <p className="text-[11px] text-slate-500 mt-2">
                  Dosya Supabase Storage&#39;daki <span className="font-mono text-slate-400">{currentMapping.folderName}</span> klasörüne kaydedilir ve anında burada açılır.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
