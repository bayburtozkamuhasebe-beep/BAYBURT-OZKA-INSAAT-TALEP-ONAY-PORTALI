import React, { useState, useEffect } from 'react';
import {
  X,
  FileText,
  Building2,
  Loader2,
  FileX,
  Maximize2,
  Minimize2,
  RotateCw,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Layers
} from 'lucide-react';
import { TalepRecord } from '../types';
import {
  getFirmaUnvani,
  getTutar,
  getCariBakiye,
  getAciklama,
  getTalepEden,
  formatCurrency,
  formatCariBakiyeDisplay,
  isCariBakiyeLowerThanTutar
} from '../lib/recordUtils';
import { FaturaInfo, getFaturaListForRecord, invalidateBucketCache } from '../lib/faturaService';
import { FaturaDocumentViewer } from './FaturaDocumentViewer';

interface FaturaGosterModalProps {
  isOpen: boolean;
  record: TalepRecord | null;
  initialFatura?: FaturaInfo | null;
  faturaList?: FaturaInfo[];
  initialIndex?: number;
  siteName?: string;
  onClose: () => void;
}

export const FaturaGosterModal: React.FC<FaturaGosterModalProps> = ({
  isOpen,
  record,
  initialFatura,
  faturaList = [],
  initialIndex = 0,
  siteName,
  onClose
}) => {
  const [documents, setDocuments] = useState<FaturaInfo[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(initialIndex);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);

  const recordId = record?.id ?? record?._tempId ?? '';
  const firma = record ? getFirmaUnvani(record) : '';
  const tutar = record ? getTutar(record) : 0;
  const cariBakiye = record ? getCariBakiye(record) : null;
  const aciklama = record ? getAciklama(record) : '';
  const talepEden = record ? getTalepEden(record) : '';

  const isBakiyeDusuk = isCariBakiyeLowerThanTutar(cariBakiye, tutar);

  // Load documents when modal opens or record changes
  const loadDocuments = (forceRefresh = false) => {
    if (!isOpen || !recordId) {
      setDocuments([]);
      setIsLoading(false);
      return;
    }

    if (!forceRefresh && faturaList && faturaList.length > 0) {
      setDocuments(faturaList);
      setSelectedIndex(Math.min(initialIndex, faturaList.length - 1));
      setIsLoading(false);
      return;
    }

    if (!forceRefresh && initialFatura) {
      setDocuments([initialFatura]);
      setSelectedIndex(0);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    if (forceRefresh) {
      invalidateBucketCache();
    }

    getFaturaListForRecord(recordId, firma, forceRefresh)
      .then((list) => {
        setDocuments(list);
        setSelectedIndex((prev) => (prev >= list.length ? 0 : prev));
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Fatura list get error:', err);
        setDocuments([]);
        setIsLoading(false);
      });
  };

  useEffect(() => {
    loadDocuments(false);
  }, [isOpen, recordId, firma, faturaList, initialFatura, initialIndex]);

  // Handle ESC to close or exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFullScreen) {
          setIsFullScreen(false);
        } else {
          onClose();
        }
      } else if (e.key === 'ArrowRight' && documents.length > 1) {
        setSelectedIndex((prev) => (prev < documents.length - 1 ? prev + 1 : 0));
      } else if (e.key === 'ArrowLeft' && documents.length > 1) {
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : documents.length - 1));
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, isFullScreen, documents.length, onClose]);

  if (!isOpen || !record) return null;

  const currentFatura = documents[selectedIndex] || null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-3 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isFullScreen) onClose();
      }}
    >
      <div
        className={`bg-slate-900 shadow-2xl border border-slate-700 flex flex-col overflow-hidden text-slate-100 transition-all duration-200 ${
          isFullScreen
            ? 'fixed inset-0 w-screen h-screen rounded-none max-w-none max-h-none z-50'
            : 'w-full max-w-6xl h-[94vh] rounded-2xl'
        }`}
      >
        {/* MODAL HEADER */}
        <div className="px-4 py-3 bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-400/30 text-emerald-400 shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-black tracking-tight text-white truncate">
                  Fatura & Evrak Görüntüleme
                </h3>
                {siteName && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-white/10 text-indigo-200 border border-white/10">
                    {siteName}
                  </span>
                )}
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  CARIFATURALAR
                </span>
              </div>
              <p className="text-xs text-slate-300 truncate mt-0.5 font-medium flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="font-bold text-white tracking-wide">{firma}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* YENİLE BUTONU */}
            <button
              type="button"
              onClick={() => loadDocuments(true)}
              disabled={isLoading}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
              title="CARIFATURALAR deposunu yeniden tara"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
            </button>

            {/* TAM EKRAN BUTONU */}
            <button
              type="button"
              onClick={() => setIsFullScreen(!isFullScreen)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
              title={isFullScreen ? 'Tam Ekrandan Çık (ESC)' : 'Tam Ekran Görünüm'}
            >
              {isFullScreen ? (
                <Minimize2 className="w-4 h-4 text-amber-400" />
              ) : (
                <Maximize2 className="w-4 h-4 text-sky-400" />
              )}
            </button>

            {/* KAPAT BUTONU */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
              title="Kapat (ESC)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* BİLGİ VE TUTAR ŞERİDİ (SADECE FATURA ÖZETİ, CARİ MUAVİN BUTONU YOKTUR) */}
        {!isFullScreen && (
          <div className="px-4 py-2 bg-slate-950/60 border-b border-slate-800 shrink-0">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[10px] font-bold">ÖDENECEK TUTAR</span>
                <span className="font-mono font-black text-emerald-400 text-sm">
                  {formatCurrency(tutar)}
                </span>
              </div>
              <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[10px] font-bold">CARİ BAKİYE</span>
                <span
                  className={`font-mono font-black text-sm ${
                    isBakiyeDusuk ? 'text-rose-400' : 'text-slate-200'
                  }`}
                >
                  {formatCariBakiyeDisplay(cariBakiye)}
                </span>
              </div>
              <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[10px] font-bold">TALEP EDEN</span>
                <span className="font-bold text-slate-200 truncate block">{talepEden || '-'}</span>
              </div>
              <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[10px] font-bold">AÇIKLAMA</span>
                <span className="font-medium text-slate-300 truncate block" title={aciklama}>
                  {aciklama || '-'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ÇOKLU EVRAK SEÇİCİ SEKMELER (1, 2, 3... EVRAKLARI) */}
        {documents.length > 1 && (
          <div className="px-4 py-2 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-2 overflow-x-auto shrink-0 select-none">
            <div className="flex items-center gap-1.5 shrink-0 text-xs text-slate-400 font-semibold">
              <Layers className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Kayıtlı Evraklar:</span>
              <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-[11px]">
                {documents.length} Evrak
              </span>
            </div>

            {/* SEKMELER LİSTESİ */}
            <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
              {documents.map((doc, idx) => {
                const isSelected = idx === selectedIndex;
                const seq = doc.sequenceNumber ?? idx + 1;
                return (
                  <button
                    key={`${doc.fileName}-${idx}`}
                    type="button"
                    onClick={() => setSelectedIndex(idx)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap border ${
                      isSelected
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-md ring-1 ring-emerald-400/50'
                        : 'bg-slate-800/90 text-slate-300 hover:text-white hover:bg-slate-700 border-slate-700'
                    }`}
                    title={doc.fileName}
                  >
                    <span
                      className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-black ${
                        isSelected ? 'bg-white text-emerald-700' : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {seq}
                    </span>
                    <span className="max-w-[160px] truncate text-[11px]">
                      {doc.displayName || doc.fileName}
                    </span>
                    {doc.size && (
                      <span
                        className={`text-[9px] font-mono opacity-80 ${
                          isSelected ? 'text-emerald-100' : 'text-slate-400'
                        }`}
                      >
                        {(doc.size / 1024).toFixed(0)}KB
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* ÖNCEKİ / SONRAKİ EVRAK GEÇİŞİ */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setSelectedIndex((prev) => (prev > 0 ? prev - 1 : documents.length - 1))}
                className="p-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                title="Önceki Evrak (Sol Ok)"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setSelectedIndex((prev) => (prev < documents.length - 1 ? prev + 1 : 0))}
                className="p-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                title="Sonraki Evrak (Sağ Ok)"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* MODAL GÖVDE: FATURA GÖRÜNTÜLEME ALANI */}
        <div className="flex-1 flex flex-col min-h-0 bg-slate-900 overflow-hidden relative">
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center py-16 text-slate-400">
              <Loader2 className="w-9 h-9 animate-spin text-emerald-500 mb-2.5" />
              <p className="text-sm font-semibold text-slate-200">CARIFATURALAR Deposu Taranıyor...</p>
              <p className="text-xs text-slate-500 mt-1">{firma}</p>
            </div>
          ) : currentFatura ? (
            /* FATURA / EVRAK TAM GÖSTER & EKRANA SIĞDIR VIEWER */
            <FaturaDocumentViewer
              fatura={currentFatura}
              isFullScreen={isFullScreen}
              onToggleFullScreen={() => setIsFullScreen(!isFullScreen)}
            />
          ) : (
            /* EVRAK BULUNAMADI */
            <div className="flex-1 flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mb-3.5 shadow-sm">
                <FileX className="w-8 h-8" />
              </div>
              <h4 className="text-base font-bold text-white mb-1">Evrak Bulunamadı</h4>
              <p className="text-xs text-slate-400 max-w-md mb-4 leading-relaxed">
                <span className="font-semibold text-slate-200">{firma}</span> firması için{' '}
                <span className="font-semibold text-emerald-400">CARIFATURALAR</span> depolama klasöründe kayıtlı fatura veya evrak bulunamadı.
              </p>
              <button
                type="button"
                onClick={() => loadDocuments(true)}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border border-slate-700"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Tekrar Kontrol Et</span>
              </button>
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        {!isFullScreen && (
          <div className="px-4 py-2 bg-slate-950 border-t border-slate-800 flex items-center justify-between shrink-0 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span>
                Kayıt ID: <strong className="font-mono text-slate-300">{recordId}</strong>
              </span>
              {documents.length > 0 && (
                <>
                  <span>•</span>
                  <span>
                    Aktif:{' '}
                    <strong className="text-emerald-400">
                      {selectedIndex + 1} / {documents.length}
                    </strong>
                  </span>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold transition cursor-pointer"
            >
              Kapat
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
