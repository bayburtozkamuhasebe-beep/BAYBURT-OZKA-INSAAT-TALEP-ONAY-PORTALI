import React from 'react';
import { TalepRecord } from '../types';
import {
  getFirmaUnvani,
  getAciklama,
  getTutar,
  getTalepEden,
  formatCurrency
} from '../lib/recordUtils';
import { AlertTriangle, Trash2, X, RefreshCw } from 'lucide-react';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: TalepRecord | null;
  tableName?: string;
  siteName?: string;
  onConfirm: () => Promise<void>;
  loading: boolean;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  onClose,
  record,
  tableName,
  siteName,
  onConfirm,
  loading
}) => {
  if (!isOpen || !record) return null;

  const targetTable = record._siteTable || tableName || 'Talep Tablosu';
  const targetSite = record._siteName || siteName || '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden text-slate-800">
        {/* Header with Warning Accent */}
        <div className="p-6 bg-rose-50 border-b border-rose-100 flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-600 text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-rose-600/30">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-black text-rose-950">
              Talep Kaydını Silmek İstiyor Musunuz?
            </h3>
            <p className="text-xs text-rose-700 mt-1">
              Bu işlem geri alınamaz. Kayıt veritabanındaki tablodan kalıcı olarak silinecektir.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Record Details */}
        <div className="p-6 space-y-3 bg-white text-sm">
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-500">HEDEF TABLO:</span>
              <span className="font-mono font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 text-xs">
                {targetTable} {targetSite ? `(${targetSite})` : ''}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs font-bold text-slate-500">FİRMA:</span>
              <span className="font-bold text-slate-900">{getFirmaUnvani(record)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs font-bold text-slate-500">AÇIKLAMA:</span>
              <span className="font-medium text-slate-800 text-right">{getAciklama(record)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs font-bold text-slate-500">TALEP EDEN:</span>
              <span className="font-medium text-slate-800">{getTalepEden(record)}</span>
            </div>
            <div className="flex justify-between pt-1 border-t border-slate-200">
              <span className="text-xs font-bold text-slate-500">ÖDENECEK TUTAR:</span>
              <span className="font-mono font-black text-emerald-700">{formatCurrency(getTutar(record))}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100 transition"
          >
            İptal
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black transition flex items-center gap-2 shadow-md shadow-rose-600/30"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Siliniyor...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                <span>EVET, KAYDI SİL</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
