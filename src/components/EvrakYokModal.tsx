import React from 'react';
import { FileX, AlertCircle, X } from 'lucide-react';

interface EvrakYokModalProps {
  isOpen: boolean;
  firmaUnvani: string;
  onClose: () => void;
}

export const EvrakYokModal: React.FC<EvrakYokModalProps> = ({
  isOpen,
  firmaUnvani,
  onClose
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 w-full max-w-md overflow-hidden text-slate-800 animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between border-b border-slate-700">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30">
              <FileX className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold tracking-tight text-white">
              Evrak Durumu
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
            title="Kapat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 text-center flex flex-col items-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mb-3.5 shadow-xs">
            <AlertCircle className="w-7 h-7" />
          </div>

          <h4 className="text-base font-extrabold text-slate-900 mb-1">
            Evrak Yok
          </h4>

          <p className="text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 max-w-full truncate mb-2">
            {firmaUnvani}
          </p>

          <p className="text-xs text-slate-500 leading-relaxed max-w-xs">
            Bu cari / firma ünvanı ile ilgili <span className="font-semibold text-slate-700">CARIFATURALAR</span> depolama klasöründe kayıtlı herhangi bir fatura veya evrak bulunmamaktadır.
          </p>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition cursor-pointer shadow-xs active:scale-95"
          >
            Tamam
          </button>
        </div>
      </div>
    </div>
  );
};
