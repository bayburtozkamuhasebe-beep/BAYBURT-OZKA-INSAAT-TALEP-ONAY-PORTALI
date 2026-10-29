import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  AlertCircle,
  Scan
} from 'lucide-react';
import { FaturaInfo } from '../lib/faturaService';

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
  if (lib?.GlobalWorkerOptions) {
    lib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
  }
} catch {
  // worker initialization notice
}

type FitMode = 'fit-page' | 'fit-width' | 'custom';

interface FaturaDocumentViewerProps {
  fatura: FaturaInfo;
  isFullScreen?: boolean;
  onToggleFullScreen?: () => void;
}

export const FaturaDocumentViewer: React.FC<FaturaDocumentViewerProps> = ({
  fatura,
  isFullScreen,
  onToggleFullScreen
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [fitMode, setFitMode] = useState<FitMode>('fit-page');
  const [customScale, setCustomScale] = useState<number>(1.0);
  const [computedScale, setComputedScale] = useState<number>(1.0);

  const [loading, setLoading] = useState<boolean>(true);
  const [rendering, setRendering] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Unscaled page dimensions for scale calculations
  const [unscaledSize, setUnscaledSize] = useState<{ width: number; height: number } | null>(null);

  // Load PDF document when URL changes
  useEffect(() => {
    if (fatura.fileType !== 'pdf') {
      setLoading(false);
      return;
    }

    let isCancelled = false;
    setLoading(true);
    setLoadError(null);
    setPdfDoc(null);
    setCurrentPage(1);

    const lib = getPdfLib();
    if (!lib || !lib.getDocument) {
      setLoadError('PDF görüntüleyici kütüphanesi başlatılamadı.');
      setLoading(false);
      return;
    }

    const loadingTask = lib.getDocument({
      url: fatura.url,
      cMapUrl: '/cmaps/',
      cMapPacked: true
    });

    loadingTask.promise
      .then((doc: any) => {
        if (isCancelled) return;
        setPdfDoc(doc);
        setTotalPages(doc.numPages || 1);
        setLoading(false);
      })
      .catch((err: any) => {
        if (isCancelled) return;
        console.error('PDF document load error:', err);
        setLoadError('Evrak PDF formatında doğrudan yüklenemedi. Tarayıcıda veya yeni sekmede açabilirsiniz.');
        setLoading(false);
      });

    return () => {
      isCancelled = true;
      try {
        loadingTask.destroy();
      } catch {
        // ignore
      }
    };
  }, [fatura.url, fatura.fileType]);

  // Read unscaled page size when doc or page changes
  useEffect(() => {
    if (!pdfDoc) return;
    let isCancelled = false;

    pdfDoc
      .getPage(currentPage)
      .then((page: any) => {
        if (isCancelled) return;
        const viewport = page.getViewport({ scale: 1.0, rotation });
        setUnscaledSize({ width: viewport.width, height: viewport.height });
      })
      .catch((err: any) => {
        console.error('Get page error:', err);
      });

    return () => {
      isCancelled = true;
    };
  }, [pdfDoc, currentPage, rotation]);

  // Calculate effective scale based on fitMode and container dimensions
  const updateEffectiveScale = useCallback(() => {
    if (!containerRef.current || !unscaledSize) return;

    const containerW = containerRef.current.clientWidth;
    const containerH = containerRef.current.clientHeight;

    // Available space with 32px safety margin
    const availW = Math.max(containerW - 32, 200);
    const availH = Math.max(containerH - 32, 200);

    const scaleW = availW / unscaledSize.width;
    const scaleH = availH / unscaledSize.height;

    if (fitMode === 'fit-page') {
      // Fit entire page in screen
      const fitScale = Math.min(scaleW, scaleH);
      setComputedScale(Math.max(fitScale, 0.2));
    } else if (fitMode === 'fit-width') {
      // Fit width, allow vertical scroll
      setComputedScale(Math.max(scaleW, 0.2));
    } else {
      // Custom zoom
      setComputedScale(customScale);
    }
  }, [fitMode, customScale, unscaledSize]);

  // Recalculate on container resize or layout shifts
  useEffect(() => {
    updateEffectiveScale();

    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      updateEffectiveScale();
    });
    observer.observe(el);

    return () => observer.disconnect();
  }, [updateEffectiveScale, isFullScreen]);

  // Render current page onto canvas
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || !unscaledSize) return;

    let isCancelled = false;
    let renderTask: any = null;

    setRendering(true);

    pdfDoc
      .getPage(currentPage)
      .then((page: any) => {
        if (isCancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        const viewport = page.getViewport({ scale: computedScale, rotation });
        const dpr = window.devicePixelRatio || 1;

        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        renderTask = page.render({
          canvasContext: ctx,
          viewport
        });

        return renderTask.promise;
      })
      .then(() => {
        if (!isCancelled) setRendering(false);
      })
      .catch((err: any) => {
        if (err?.name !== 'RenderingCancelledException') {
          console.warn('PDF page render error:', err);
        }
        if (!isCancelled) setRendering(false);
      });

    return () => {
      isCancelled = true;
      if (renderTask) {
        try {
          renderTask.cancel();
        } catch {
          // ignore
        }
      }
    };
  }, [pdfDoc, currentPage, computedScale, rotation, unscaledSize]);

  // Zoom handlers
  const handleZoomIn = () => {
    setFitMode('custom');
    setCustomScale((prev) => Math.min(prev + 0.25, 4.0));
  };

  const handleZoomOut = () => {
    setFitMode('custom');
    setCustomScale((prev) => Math.max(prev - 0.25, 0.3));
  };

  const handleFitPage = () => {
    setFitMode('fit-page');
  };

  const handleFitWidth = () => {
    setFitMode('fit-width');
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage((p) => p - 1);
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage((p) => p + 1);
  };

  const currentScalePct = Math.round(computedScale * 100);

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-900 text-slate-200 overflow-hidden relative select-none">
      {/* TOOLBAR */}
      <div className="px-3 py-2 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-2 flex-wrap text-xs shrink-0 z-10">
        {/* SOL: SAYFA GEZİNTİSİ */}
        <div className="flex items-center gap-1.5">
          {totalPages > 1 && (
            <div className="flex items-center gap-1 bg-slate-900 px-1.5 py-0.5 rounded-lg border border-slate-700">
              <button
                type="button"
                onClick={handlePrevPage}
                disabled={currentPage <= 1}
                className="p-1 rounded text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                title="Önceki Sayfa"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="font-mono font-bold text-slate-200 px-1">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={handleNextPage}
                disabled={currentPage >= totalPages}
                className="p-1 rounded text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                title="Sonraki Sayfa"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="hidden sm:flex items-center gap-1 text-[11px] text-slate-400 bg-slate-900/80 px-2 py-1 rounded-md border border-slate-800">
            <FileText className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="font-medium text-slate-300 truncate max-w-[200px]" title={fatura.fileName}>
              {fatura.fileName}
            </span>
          </div>
        </div>

        {/* ORTA: YAKINLAŞTIRMA & EKRANA SIĞDIR BUTONLARI */}
        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
          <button
            type="button"
            onClick={handleZoomOut}
            className="p-1 rounded text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer transition"
            title="Uzaklaştır (-)"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          <span
            className="font-mono font-bold text-[11px] text-emerald-300 px-1.5 min-w-[44px] text-center"
            title="Geçerli Yakınlaştırma Oranı"
          >
            %{currentScalePct}
          </span>

          <button
            type="button"
            onClick={handleZoomIn}
            className="p-1 rounded text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer transition"
            title="Yakınlaştır (+)"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          <div className="w-[1px] h-4 bg-slate-700 mx-0.5" />

          {/* EKRANA SIĞDIR (FIT TO SCREEN) */}
          <button
            type="button"
            onClick={handleFitPage}
            className={`px-2 py-0.5 rounded text-[11px] font-bold transition flex items-center gap-1 cursor-pointer ${
              fitMode === 'fit-page'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
            title="Faturayı Ekrana Sığdır (Tüm sayfa tek ekranda görünür)"
          >
            <Scan className="w-3 h-3" />
            <span>Ekrana Sığdır</span>
          </button>

          {/* GENİŞLİĞE SIĞDIR (FIT TO WIDTH) */}
          <button
            type="button"
            onClick={handleFitWidth}
            className={`px-2 py-0.5 rounded text-[11px] font-bold transition flex items-center gap-1 cursor-pointer ${
              fitMode === 'fit-width'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
            title="Genişliğe Sığdır"
          >
            <Maximize2 className="w-3 h-3" />
            <span className="hidden sm:inline">Genişlik</span>
          </button>

          <div className="w-[1px] h-4 bg-slate-700 mx-0.5" />

          {/* DÖNDÜR */}
          <button
            type="button"
            onClick={handleRotate}
            className="p-1 rounded text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer transition"
            title="90° Saat Yönünde Döndür"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* SAĞ: TAM EKRAN, YENİ SEKME, İNDİR */}
        <div className="flex items-center gap-1">
          {onToggleFullScreen && (
            <button
              type="button"
              onClick={onToggleFullScreen}
              className="px-2 py-1 rounded-lg text-[11px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 transition flex items-center gap-1 cursor-pointer"
              title={isFullScreen ? 'Tam Ekrandan Çık' : 'Tam Ekran Görünüm'}
            >
              {isFullScreen ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden md:inline">Küçült</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5 text-sky-400" />
                  <span className="hidden md:inline">Tam Ekran</span>
                </>
              )}
            </button>
          )}

          <a
            href={fatura.url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2 py-1 rounded-lg text-[11px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition flex items-center gap-1 cursor-pointer"
            title="Yeni Sekmede Tam Boyut Aç"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Sekmede Aç</span>
          </a>

          <a
            href={fatura.url}
            download={fatura.fileName}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center gap-1 cursor-pointer shadow-xs"
            title="Evrakı Bilgisayara İndir"
          >
            <Download className="w-3.5 h-3.5" />
            <span>İndir</span>
          </a>
        </div>
      </div>

      {/* VIEWPORT ALANI */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-[#0b1120] relative flex items-center justify-center p-2 sm:p-4 min-h-[420px]"
        tabIndex={0}
      >
        {/* YÜKLENİYOR DURUMU */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Loader2 className="w-9 h-9 animate-spin text-emerald-500 mb-2.5" />
            <p className="text-sm font-semibold text-slate-200">Evrak Yükleniyor...</p>
            <p className="text-xs text-slate-500 mt-1">CARIFATURALAR deposundan getiriliyor</p>
          </div>
        )}

        {/* HATA DURUMU */}
        {!loading && loadError && (
          <div className="flex flex-col items-center justify-center py-12 px-4 max-w-md text-center bg-slate-950/80 p-6 rounded-2xl border border-slate-800">
            <AlertCircle className="w-10 h-10 text-amber-400 mb-2.5" />
            <h5 className="font-bold text-sm text-slate-200 mb-1">Evrak Önizlenemedi</h5>
            <p className="text-xs text-slate-400 mb-4">{loadError}</p>
            <div className="flex items-center gap-2">
              <a
                href={fatura.url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Tarayıcıda Doğrudan Aç</span>
              </a>
              <a
                href={fatura.url}
                download={fatura.fileName}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>İndir</span>
              </a>
            </div>
          </div>
        )}

        {/* PDF RENDER EDİLEN CANVAS */}
        {!loading && !loadError && fatura.fileType === 'pdf' && (
          <div className="relative inline-block shadow-2xl rounded-sm transition-all duration-150">
            <canvas
              ref={canvasRef}
              className="block bg-white shadow-2xl rounded-sm"
              style={{
                maxWidth: 'none',
                maxHeight: 'none'
              }}
            />
            {rendering && (
              <div className="absolute inset-0 bg-slate-950/30 backdrop-blur-2xs flex items-center justify-center rounded-sm">
                <Loader2 className="w-7 h-7 animate-spin text-emerald-400" />
              </div>
            )}
          </div>
        )}

        {/* RESİM FORMATI ÖNİZLEME */}
        {!loading && !loadError && fatura.fileType === 'image' && (
          <div
            className="flex items-center justify-center transition-all duration-150"
            style={{
              transform: `scale(${computedScale}) rotate(${rotation}deg)`,
              transformOrigin: 'center center'
            }}
          >
            <img
              src={fatura.url}
              alt={fatura.fileName}
              className="max-w-[90vw] max-h-[80vh] object-contain rounded shadow-2xl bg-white/5 border border-slate-700"
            />
          </div>
        )}

        {/* HTML FORMATI ÖNİZLEME (E-ARŞİV / E-FATURA HTML) */}
        {!loading && !loadError && fatura.fileType === 'html' && (
          <div className="w-full h-full flex-1 min-h-[540px] bg-white rounded-lg shadow-2xl overflow-hidden border border-slate-700 flex flex-col">
            <iframe
              src={fatura.url}
              title={fatura.fileName}
              className="w-full h-full min-h-[540px] flex-1 border-0 bg-white"
              sandbox="allow-same-origin allow-scripts allow-popups"
            />
          </div>
        )}

        {/* DİĞER DOSYA FORMATLARI */}
        {!loading && !loadError && fatura.fileType === 'other' && (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center bg-slate-950/80 p-8 rounded-2xl border border-slate-800">
            <FileText className="w-14 h-14 text-emerald-400 mb-3" />
            <h5 className="font-bold text-base text-white mb-1">{fatura.fileName}</h5>
            <p className="text-xs text-slate-400 mb-4">Bu dosya formatı yerleşik canvas ile görüntülenemiyor.</p>
            <a
              href={fatura.url}
              download={fatura.fileName}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>Dosyayı İndir ve Aç</span>
            </a>
          </div>
        )}
      </div>
    </div>
  );
};
