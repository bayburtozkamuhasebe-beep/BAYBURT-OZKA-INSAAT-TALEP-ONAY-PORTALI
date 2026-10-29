import React, { useState } from 'react';
import { TalepRecord, SiteConfig } from '../types';
import {
  getFirmaUnvani,
  getAciklama,
  getTutar,
  getIban,
  getTalepEden,
  formatCurrency
} from '../lib/recordUtils';
import {
  CreditCard,
  CheckCircle2,
  X,
  RefreshCw,
  Building2,
  Calendar,
  FileText,
  AlertCircle
} from 'lucide-react';

interface PaymentExecutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (details: { paymentMethod: string; paymentDate: string; note: string }) => Promise<void>;
  loading: boolean;
  recordsToPay: TalepRecord[];
  site: SiteConfig;
}

export const PaymentExecutionModal: React.FC<PaymentExecutionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  loading,
  recordsToPay,
  site
}) => {
  const [paymentMethod, setPaymentMethod] = useState<string>('Banka Havalesi / EFT');
  const [paymentDate, setPaymentDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [note, setNote] = useState<string>('');

  if (!isOpen || recordsToPay.length === 0) return null;

  const totalAmount = recordsToPay.reduce((sum, r) => sum + getTutar(r), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onConfirm({
      paymentMethod,
      paymentDate,
      note
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden text-slate-800 flex flex-col max-h-[90vh]">
        {/* Header with Emerald/Green Accent */}
        <div className="p-6 bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-600/90 text-white flex items-center justify-center flex-shrink-0 shadow-lg shadow-emerald-500/30 border border-emerald-400/40">
              <CreditCard className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-2">
                <span>Ödeme Yap & Onayla</span>
              </h3>
              <p className="text-xs text-emerald-200 mt-0.5">
                {site.name} • {recordsToPay.length} Adet Talep / Ödeme
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

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
            {/* Stats Badges */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 bg-emerald-50/80 rounded-2xl border border-emerald-200/80 flex flex-col">
                <span className="text-[11px] font-bold text-emerald-700 uppercase">Ödenecek Kayıt</span>
                <span className="text-xl font-black text-emerald-950 mt-1 font-mono">
                  {recordsToPay.length} <span className="text-xs font-semibold text-emerald-700">Talep</span>
                </span>
              </div>
              <div className="p-3.5 bg-teal-50/80 rounded-2xl border border-teal-200/80 flex flex-col">
                <span className="text-[11px] font-bold text-teal-700 uppercase">Toplam Ödeme Tutarı</span>
                <span className="text-xl font-black text-teal-950 mt-1 font-mono">
                  {formatCurrency(totalAmount)}
                </span>
              </div>
            </div>

            {/* Payment Details Form Inputs */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3.5">
              <div className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                Ödeme Bilgileri
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Payment Method */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5 text-slate-500" />
                    <span>Ödeme Türü</span>
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    disabled={loading}
                    className="w-full text-xs font-semibold px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-slate-800"
                  >
                    <option value="Banka Havalesi / EFT">Banka Havalesi / EFT</option>
                    <option value="Nakit / Elden Kasa">Nakit / Elden Kasa</option>
                    <option value="Şirket Kredi Kartı">Şirket Kredi Kartı</option>
                    <option value="Çek / Senet">Çek / Senet</option>
                    <option value="Diğer Ödeme">Diğer Ödeme</option>
                  </select>
                </div>

                {/* Payment Date */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    <span>Ödeme Tarihi</span>
                  </label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    disabled={loading}
                    className="w-full text-xs font-semibold px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-slate-800"
                  />
                </div>
              </div>

              {/* Note / Receipt Ref */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                  <span>Dekont No / Ödeme Notu (Opsiyonel)</span>
                </label>
                <input
                  type="text"
                  placeholder="Örn: Garanti Bankası Dekont No: 123456"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={loading}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-slate-800"
                />
              </div>
            </div>

            {/* Warning Message */}
            <div className="p-3.5 bg-emerald-50 rounded-2xl border border-emerald-200 flex items-start gap-3 text-emerald-900 text-xs">
              <AlertCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Ödeme Onayı: </span>
                Bu işlem onaylandığında seçili {recordsToPay.length} adet talebin durumu veritabanında <span className="font-black text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded">ÖDENDİ</span> olarak güncellenecek ve ödeme kaydı tamamlanacaktır.
              </div>
            </div>

            {/* List of items to be paid */}
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center justify-between">
                <span>Ödenecek Kayıtlar Listesi ({recordsToPay.length})</span>
              </div>
              <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 max-h-40 overflow-y-auto bg-slate-50/50">
                {recordsToPay.map((rec, index) => (
                  <div key={index} className="p-3 bg-white flex items-center justify-between gap-3 text-xs hover:bg-slate-50 transition">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-slate-900 truncate">
                        {index + 1}. {getFirmaUnvani(rec)}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate mt-0.5">
                        {getAciklama(rec)} {getIban(rec) ? `• IBAN: ${getIban(rec)}` : ''} {getTalepEden(rec) !== '-' ? `• Talep Eden: ${getTalepEden(rec)}` : ''}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-mono font-bold text-emerald-700 text-xs sm:text-sm">
                        {formatCurrency(getTutar(rec))}
                      </div>
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
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition flex items-center gap-2 shadow-md shadow-emerald-600/30 cursor-pointer active:scale-95 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-200" />
                  <span>Ödeme İşleniyor...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-white" />
                  <span>ÖDEMEYİ TAMAMLA & ONAYLA</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
