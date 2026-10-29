import React from 'react';
import { TalepRecord, SiteConfig } from '../types';
import {
  getFirmaUnvani,
  getAciklama,
  getTutar,
  getTalepEden,
  formatCurrency
} from '../lib/recordUtils';
import { ArrowRight, AlertCircle, CheckCircle, X, RefreshCw, Layers } from 'lucide-react';

interface MoveToPaymentConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  loading: boolean;
  recordsToMove: TalepRecord[];
  site: SiteConfig;
}

export const MoveToPaymentConfirmModal: React.FC<MoveToPaymentConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  loading,
  recordsToMove,
  site
}) => {
  if (!isOpen || recordsToMove.length === 0) return null;

  const totalAmount = recordsToMove.reduce((sum, r) => sum + getTutar(r), 0);

  // Group by source & target table for display
  const tablePairs = Array.from(
    new Set<string>(
      recordsToMove.map((r) => {
        const src = r._siteTable || site.tableName;
        const tgt = src.replace(/_talep$/, '_odenecek');
        return JSON.stringify({ src, tgt });
      })
    )
  ).map((str: string) => JSON.parse(str) as { src: string; tgt: string });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden text-slate-800 flex flex-col max-h-[90vh]">
        {/* Header with Blue/Indigo Accent */}
        <div className="p-6 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-blue-600/90 text-white flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-500/30 border border-blue-400/40">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-2">
                <span>Ödeme Listesine Taşıma Onayı</span>
              </h3>
              <p className="text-xs text-blue-200 mt-0.5">
                {site.name} • {recordsToMove.length} Adet ÖDENSİN Talebi
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {/* Transfer Route Box */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Veritabanı Taşıma Güzergahı
            </div>
            {tablePairs.map((pair, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-2 p-2.5 bg-white rounded-xl border border-slate-200 text-xs font-mono font-bold shadow-2xs"
              >
                <div className="flex items-center gap-1.5 text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200">
                  <span>{pair.src}</span>
                </div>
                <div className="flex items-center gap-1 text-slate-400 px-1">
                  <ArrowRight className="w-4 h-4 text-blue-600 font-black animate-pulse" />
                </div>
                <div className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                  <span>{pair.tgt}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Stats Badges */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 bg-blue-50/70 rounded-2xl border border-blue-100 flex flex-col">
              <span className="text-[11px] font-bold text-blue-700 uppercase">Taşınacak Kayıt</span>
              <span className="text-xl font-black text-blue-950 mt-1 font-mono">
                {recordsToMove.length} <span className="text-xs font-semibold text-blue-700">Talep</span>
              </span>
            </div>
            <div className="p-3.5 bg-emerald-50/70 rounded-2xl border border-emerald-100 flex flex-col">
              <span className="text-[11px] font-bold text-emerald-700 uppercase">Toplam Tutar</span>
              <span className="text-xl font-black text-emerald-950 mt-1 font-mono">
                {formatCurrency(totalAmount)}
              </span>
            </div>
          </div>

          {/* Warning Message */}
          <div className="p-3.5 bg-amber-50 rounded-2xl border border-amber-200/80 flex items-start gap-3 text-amber-900 text-xs">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Önemli Bilgilendirme: </span>
              Onay verdiğinizde, tablodaki durumu <span className="font-black text-emerald-800 bg-emerald-100/80 px-1.5 py-0.5 rounded">ÖDENSİN</span> olan bu {recordsToMove.length} talep <span className="font-mono font-bold text-slate-800">_talep</span> tablosundan silinip ilgili <span className="font-mono font-bold text-slate-800">_odenecek</span> tablosuna aktarılacaktır.
            </div>
          </div>

          {/* Preview list of items to be moved */}
          <div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>Taşınacak Talepler Listesi ({recordsToMove.length})</span>
            </div>
            <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 max-h-48 overflow-y-auto bg-slate-50/50">
              {recordsToMove.map((rec, index) => (
                <div key={index} className="p-3 bg-white flex items-center justify-between gap-3 text-xs hover:bg-slate-50 transition">
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-slate-900 truncate">
                      {index + 1}. {getFirmaUnvani(rec)}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate mt-0.5">
                      {getAciklama(rec)} {getTalepEden(rec) !== '-' ? `• Talep Eden: ${getTalepEden(rec)}` : ''}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-mono font-bold text-emerald-700">
                      {formatCurrency(getTutar(rec))}
                    </div>
                    <span className="inline-block text-[9px] font-black uppercase px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 border border-emerald-200 mt-0.5">
                      ÖDENSİN
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-bold hover:bg-slate-100 transition cursor-pointer shadow-xs disabled:opacity-50"
          >
            İptal
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black transition flex items-center gap-2 shadow-md shadow-blue-600/30 cursor-pointer active:scale-95 disabled:opacity-50"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-blue-200" />
                <span>Ödeme Listesine Taşınıyor...</span>
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4 text-white" />
                <span>EVET, ÖDEME LİSTESİNE TAŞI</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
