import React from 'react';
import { TalepRecord, PaymentStatus } from '../types';
import {
  getFirmaUnvani,
  getIban,
  formatIbanDisplay,
  getTalepEden,
  getAciklama,
  getTutar,
  getRecordStatus,
  getTarih,
  formatCurrency
} from '../lib/recordUtils';
import {
  ParsedCariRecord,
  matchCariStatus
} from '../lib/cariStorageService';
import {
  X,
  Building,
  CreditCard,
  User,
  Copy,
  Check,
  CheckCircle2,
  XCircle,
  Clock,
  SearchCheck,
  FileSpreadsheet,
  TrendingDown,
  TrendingUp,
  AlertCircle
} from 'lucide-react';

interface CariKontrolModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: TalepRecord | null;
  allRecords: TalepRecord[];
  cariRecords?: ParsedCariRecord[];
  onUpdateStatus?: (record: TalepRecord, status: PaymentStatus) => void;
  showToast: (msg: string) => void;
}

export const CariKontrolModal: React.FC<CariKontrolModalProps> = ({
  isOpen,
  onClose,
  record,
  allRecords,
  cariRecords = [],
  onUpdateStatus,
  showToast
}) => {
  const [copied, setCopied] = React.useState(false);

  if (!isOpen || !record) return null;

  const currentFirma = getFirmaUnvani(record);
  const currentIban = getIban(record);
  const currentTutar = getTutar(record);
  const currentStatus = getRecordStatus(record);

  // Match with loaded xlsx Cari records
  const cariMatch = matchCariStatus(currentFirma, cariRecords);

  // Find all requests belonging to this supplier / firma, sorted by ÖDENSİN -> BEKLESİN -> ÖDENMESİN
  const relatedRecords = allRecords
    .filter((r) => {
      const f = getFirmaUnvani(r).toLowerCase().trim();
      const cur = currentFirma.toLowerCase().trim();
      if (!cur || cur === '-') return r.id === record.id;
      return f === cur || f.includes(cur) || cur.includes(f);
    })
    .sort((a, b) => {
      const priorityOrder: Record<string, number> = { 'ÖDENSİN': 1, 'BEKLESİN': 2, 'ÖDENMESİN': 3 };
      const pA = priorityOrder[getRecordStatus(a)] ?? 4;
      const pB = priorityOrder[getRecordStatus(b)] ?? 4;
      if (pA !== pB) return pA - pB;
      const idA = typeof a.id === 'number' ? a.id : parseInt(String(a.id), 10) || 0;
      const idB = typeof b.id === 'number' ? b.id : parseInt(String(b.id), 10) || 0;
      return idB - idA;
    });

  const totalFirmaTutar = relatedRecords.reduce((sum, r) => sum + getTutar(r), 0);
  const odensinTotal = relatedRecords
    .filter((r) => getRecordStatus(r) === 'ÖDENSİN')
    .reduce((sum, r) => sum + getTutar(r), 0);
  const beklesinTotal = relatedRecords
    .filter((r) => getRecordStatus(r) === 'BEKLESİN')
    .reduce((sum, r) => sum + getTutar(r), 0);
  const odenmesinTotal = relatedRecords
    .filter((r) => getRecordStatus(r) === 'ÖDENMESİN')
    .reduce((sum, r) => sum + getTutar(r), 0);

  const handleCopy = () => {
    if (!currentIban || currentIban === '-') return;
    const clean = currentIban.replace(/\s+/g, '');
    navigator.clipboard.writeText(clean);
    setCopied(true);
    showToast(`İBAN Kopyalandı: ${clean}`);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center shadow-md">
              <SearchCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base">Cari & Firma Kontrol Paneli</h3>
              <p className="text-xs text-purple-200">
                Tedarikçi ödeme mutabakatı ve Storage Cari analizi
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 text-slate-800">
          {/* Main Info Card */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5">
                  <Building className="w-4 h-4 text-purple-600" />
                  FİRMA / CARİ ÜNVANI
                </div>
                <div className="text-lg font-black text-slate-900 mt-1">
                  {currentFirma || 'Belirtilmedi'}
                </div>
                <div className="text-xs text-slate-600 mt-0.5 flex items-center gap-2">
                  <span>Talep Eden: <strong>{getTalepEden(record)}</strong></span>
                  <span>•</span>
                  <span>Şantiye: <strong>{record._siteName || 'Aktif Şantiye'}</strong></span>
                </div>
              </div>

              {/* Status Badge */}
              <div>
                {currentStatus === 'ÖDENSİN' && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ÖDENSİN (Onaylandı)
                  </div>
                )}
                {currentStatus === 'ÖDENMESİN' && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black bg-rose-100 text-rose-800 border border-rose-300">
                    <XCircle className="w-4 h-4 text-rose-600" />
                    ÖDENMESİN (Reddedildi)
                  </div>
                )}
                {currentStatus === 'BEKLESİN' && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black bg-amber-100 text-amber-900 border border-amber-300">
                    <Clock className="w-4 h-4 text-amber-600" />
                    BEKLESİN (İnceleniyor)
                  </div>
                )}
              </div>
            </div>

            {/* IBAN Display with copy button */}
            <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between gap-2 bg-white px-3.5 py-2.5 rounded-lg border">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-blue-600 flex-shrink-0" />
                <span className="text-xs text-slate-500 font-bold">İBAN:</span>
                <span className="font-mono text-sm font-bold text-slate-800">
                  {formatIbanDisplay(currentIban)}
                </span>
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className="px-2.5 py-1 text-xs font-bold bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-md border border-slate-300 flex items-center gap-1.5 transition cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Kopyalandı' : 'Kopyala'}</span>
              </button>
            </div>
          </div>

          {/* STORAGE XLSX CARI ANALİZİ KUTUSU */}
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-xl p-4 border border-indigo-500/40 shadow-md">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-indigo-800/60">
              <div className="flex items-center gap-2 text-xs font-bold text-cyan-300 uppercase">
                <FileSpreadsheet className="w-4 h-4 text-cyan-400" />
                <span>Yüklenen Excel Cari Hesap Durumu</span>
              </div>
              {cariMatch.matched ? (
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-black tracking-wide border ${
                    cariMatch.status === 'BORÇLU'
                      ? 'bg-rose-950 text-rose-300 border-rose-600'
                      : cariMatch.status === 'ALACAKLI'
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-600'
                      : 'bg-slate-800 text-slate-300 border-slate-600'
                  }`}
                >
                  {cariMatch.status}
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                  Eşleşme Bulunamadı
                </span>
              )}
            </div>

            {cariMatch.matched && cariMatch.cariRecord ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-white/10 rounded-lg p-2.5 border border-white/10">
                  <div className="text-[11px] text-slate-300 font-semibold">Borç Tutarı:</div>
                  <div className="text-sm font-mono font-bold text-rose-300 mt-0.5">
                    {formatCurrency(cariMatch.cariRecord.borc)}
                  </div>
                </div>
                <div className="bg-white/10 rounded-lg p-2.5 border border-white/10">
                  <div className="text-[11px] text-slate-300 font-semibold">Alacak Tutarı:</div>
                  <div className="text-sm font-mono font-bold text-emerald-300 mt-0.5">
                    {formatCurrency(cariMatch.cariRecord.alacak)}
                  </div>
                </div>
                <div className="bg-white/10 rounded-lg p-2.5 border border-white/10">
                  <div className="text-[11px] text-slate-300 font-semibold">Cari Bakiye:</div>
                  <div
                    className={`text-sm font-mono font-black mt-0.5 ${
                      cariMatch.status === 'BORÇLU'
                        ? 'text-rose-400'
                        : cariMatch.status === 'ALACAKLI'
                        ? 'text-emerald-400'
                        : 'text-white'
                    }`}
                  >
                    {formatCurrency(cariMatch.cariRecord.bakiye)} ({cariMatch.status})
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-indigo-200/80 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <span>
                  Bu firma ünvanı yüklenen cari tablosunda doğrudan eşleşmedi. Cari listesinden tam ünvanı kontrol edebilirsiniz.
                </span>
              </div>
            )}
          </div>

          {/* Firm Stats Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-100 rounded-xl p-3 border border-slate-200">
              <div className="text-[11px] text-slate-500 font-bold uppercase">Toplam Talep</div>
              <div className="text-lg font-black text-slate-900 mt-0.5">
                {relatedRecords.length} <span className="text-xs font-normal">Kayıt</span>
              </div>
              <div className="text-xs text-slate-600 font-mono font-bold mt-1">
                {formatCurrency(totalFirmaTutar)}
              </div>
            </div>
            <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-200">
              <div className="text-[11px] text-emerald-700 font-bold uppercase">ÖDENSİN Toplamı</div>
              <div className="text-base font-black text-emerald-800 mt-0.5 font-mono">
                {formatCurrency(odensinTotal)}
              </div>
            </div>
            <div className="bg-amber-50 rounded-xl p-3 border border-amber-200">
              <div className="text-[11px] text-amber-700 font-bold uppercase">BEKLESİN Toplamı</div>
              <div className="text-base font-black text-amber-800 mt-0.5 font-mono">
                {formatCurrency(beklesinTotal)}
              </div>
            </div>
            <div className="bg-rose-50 rounded-xl p-3 border border-rose-200">
              <div className="text-[11px] text-rose-700 font-bold uppercase">ÖDENMESİN Toplamı</div>
              <div className="text-base font-black text-rose-800 mt-0.5 font-mono">
                {formatCurrency(odenmesinTotal)}
              </div>
            </div>
          </div>

          {/* Records Table for this Supplier */}
          <div>
            <div className="text-xs font-bold text-slate-700 uppercase mb-2 flex items-center gap-1.5">
              <FileSpreadsheet className="w-4 h-4 text-slate-500" />
              <span>Bu Firmaya Ait Talepler ({relatedRecords.length})</span>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-600 font-bold sticky top-0">
                  <tr>
                    <th className="p-2.5">Açıklama</th>
                    <th className="p-2 w-28 min-w-[90px] max-w-[110px]">Talep Eden</th>
                    <th className="p-2.5 text-right">Tutar</th>
                    <th className="p-2.5 text-center">Durum</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {relatedRecords.map((r, i) => {
                    const st = getRecordStatus(r);
                    return (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="p-2.5 text-slate-800 font-medium">{getAciklama(r)}</td>
                        <td className="p-2 text-slate-600 truncate max-w-[110px]" title={getTalepEden(r)}>{getTalepEden(r)}</td>
                        <td className="p-2.5 text-right font-mono font-bold text-emerald-700">
                          {formatCurrency(getTutar(r))}
                        </td>
                        <td className="p-2.5 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-black ${
                              st === 'ÖDENSİN'
                                ? 'bg-emerald-100 text-emerald-800'
                                : st === 'ÖDENMESİN'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {st}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer with Quick Status Change and Close */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-600">Hızlı Durum Ata:</span>
            {onUpdateStatus && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onUpdateStatus(record, 'ÖDENSİN');
                    onClose();
                  }}
                  className="px-2.5 py-1 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition cursor-pointer"
                >
                  ÖDENSİN
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onUpdateStatus(record, 'ÖDENMESİN');
                    onClose();
                  }}
                  className="px-2.5 py-1 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition cursor-pointer"
                >
                  ÖDENMESİN
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onUpdateStatus(record, 'BEKLESİN');
                    onClose();
                  }}
                  className="px-2.5 py-1 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg transition cursor-pointer"
                >
                  BEKLESİN
                </button>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold transition cursor-pointer"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};
