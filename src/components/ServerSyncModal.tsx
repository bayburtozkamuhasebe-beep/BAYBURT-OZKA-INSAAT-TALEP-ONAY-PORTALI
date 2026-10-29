import React from 'react';
import { ODENECEK_SITES, OdenecekSiteConfig, TalepRecord } from '../types';
import { formatCurrency, getTutar } from '../lib/recordUtils';
import { UploadCloud, Check, X, RefreshCw, AlertTriangle } from 'lucide-react';

interface ServerSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
  progressStep?: string;
  tablesData: Record<string, { records: TalepRecord[]; loading?: boolean }>;
  totalCount: number;
  totalAmount: number;
}

export const ServerSyncModal: React.FC<ServerSyncModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  loading,
  progressStep,
  tablesData,
  totalCount,
  totalAmount
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-2xl w-full overflow-hidden text-slate-900 transform transition-all animate-scale-up">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-blue-700 via-indigo-800 to-slate-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center text-white font-bold border border-white/25 shadow-inner">
              <UploadCloud className="w-6 h-6 text-cyan-300" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black uppercase tracking-tight">
                YAPILAN ÖDEMELERİ SERVERE GÖNDERME ONAYI
              </h3>
              <p className="text-xs text-blue-200">
                Ödemeler ilgili <strong>_odenenler</strong> tablolarına aktarılacak ve bu listeden silinecektir.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="p-1.5 rounded-xl hover:bg-white/20 text-white/80 hover:text-white transition cursor-pointer disabled:opacity-30"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-4 text-xs max-h-[75vh] overflow-y-auto">
          {/* Açıklama Kutusu */}
          <div className="p-3.5 bg-blue-50/90 rounded-2xl border border-blue-200 text-blue-950 leading-relaxed font-medium">
            Bu işlemi onayladığınızda, aşağıdaki tablolarda yer alan dolu şantiyelerin ödenecek kayıtları doğrudan sunucudaki <strong>_odenenler</strong> tablolarına yazılacak ve ödenecek listelerinden kaldırılacaktır.{' '}
            <span className="text-amber-800 font-bold underline">Boş olan tablolar için işlem yapılmayacaktır.</span>
          </div>

          {/* Şantiye Aktarım Listesi */}
          <div className="space-y-2">
            <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wider px-1">
              Şantiye ve Tablo Eşleşme Durumu:
            </div>
            <div className="bg-slate-50 rounded-2xl border border-slate-200 divide-y divide-slate-200 overflow-hidden">
              {ODENECEK_SITES.map((site, sIdx) => {
                const records = tablesData[site.tableName]?.records || [];
                const count = records.length;
                const amount = records.reduce((acc, r) => acc + getTutar(r), 0);
                const isEmpty = count === 0;

                return (
                  <div
                    key={site.id}
                    className={`p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition ${
                      isEmpty ? 'bg-slate-100/50 opacity-60' : 'bg-white hover:bg-blue-50/40'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-slate-400 font-bold text-[11px]">{sIdx + 1}.</span>
                        <span className="font-bold text-slate-900 text-xs sm:text-sm">{site.name}</span>
                      </div>
                      <div className="font-mono text-[11px] text-slate-500 flex items-center gap-1.5">
                        <span className="text-slate-700 font-semibold">{site.tableName}</span>
                        <span className="text-blue-600 font-bold">➔</span>
                        <span className="text-emerald-700 font-bold">{site.odenenlerTableName}</span>
                      </div>
                    </div>

                    <div className="flex items-center sm:justify-end gap-2.5">
                      {isEmpty ? (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-200 text-slate-600 border border-slate-300">
                          BOŞ (ATLANACAK)
                        </span>
                      ) : (
                        <div className="text-right">
                          <div className="font-mono font-black text-emerald-700 text-xs">
                            {formatCurrency(amount)}
                          </div>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <Check className="w-3 h-3 text-emerald-600" /> {count} Kayıt Aktarılacak
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Konsolide Özet Kartı */}
          <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl p-4 border border-indigo-500/40 flex flex-wrap items-center justify-between gap-3 shadow-lg">
            <div>
              <div className="text-xs text-indigo-300 font-semibold">Toplam Aktarılacak Ödeme:</div>
              <div className="text-base sm:text-xl font-black font-mono text-white">
                {formatCurrency(totalAmount)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-indigo-300 font-semibold">Toplam Kayıt:</div>
              <div className="text-base sm:text-xl font-mono font-black text-emerald-400">
                {totalCount} Kayıt
              </div>
            </div>
          </div>

          {/* Yükleme / İlerleme Durumu */}
          {loading && (
            <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-200 flex items-center gap-3 text-indigo-900 animate-pulse">
              <RefreshCw className="w-5 h-5 animate-spin text-indigo-600 flex-shrink-0" />
              <div className="text-xs font-semibold">
                {progressStep || 'Ödemeler sunucuya aktarılıyor, lütfen bekleyin...'}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-100 px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-5 py-2.5 rounded-xl bg-white hover:bg-slate-200 text-slate-700 font-bold border border-slate-300 transition cursor-pointer text-xs disabled:opacity-40"
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading || totalCount === 0}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-700 hover:from-blue-500 hover:to-purple-600 text-white font-black text-xs sm:text-sm border border-indigo-400/50 shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <RefreshCw className="w-4 h-4 animate-spin text-white" />
            ) : (
              <UploadCloud className="w-4 h-4 text-white" />
            )}
            <span>EVET, SUNUCUYA GÖNDER VE AKTAR</span>
          </button>
        </div>
      </div>
    </div>
  );
};
