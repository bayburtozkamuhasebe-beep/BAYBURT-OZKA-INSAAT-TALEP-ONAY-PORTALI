import React, { useState, useEffect, useId } from 'react';
import { SiteConfig, SITES } from '../types';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/recordUtils';
import { X, PlusCircle, Building2, DollarSign, MapPin, Lock, AlertCircle, Check, Loader2 } from 'lucide-react';

interface AddPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  site: SiteConfig;
  onSuccess: (newRecordId?: number | string) => void;
  showToast?: (message: string) => void;
}

export const AddPaymentModal: React.FC<AddPaymentModalProps> = ({
  isOpen,
  onClose,
  site,
  onSuccess,
  showToast
}) => {
  const firmaInputId = useId();
  const tutarInputId = useId();
  const santiyeInputId = useId();

  const [firmaUnvani, setFirmaUnvani] = useState('');
  const [odenecekTutar, setOdenecekTutar] = useState('');
  const [selectedSubSite, setSelectedSubSite] = useState<string>(
    site.id === 'all' ? SITES[0].id : site.id
  );
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // If site changes, update subsite default
  useEffect(() => {
    if (site.id !== 'all') {
      setSelectedSubSite(site.id);
    } else {
      setSelectedSubSite(SITES[0].id);
    }
  }, [site]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setFirmaUnvani('');
      setOdenecekTutar('');
      setErrorMessage(null);
      setLoading(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Compute active target site config and display name
  const isAllMode = site.id === 'all';
  const targetSiteConfig = isAllMode
    ? SITES.find((s) => s.id === selectedSubSite) || SITES[0]
    : site;

  // The displayed site name in the disabled textbox
  const displayedSantiye = site.name;

  // Parse numeric amount safely from Turkish formatted or standard number
  const parseAmount = (val: string): number => {
    if (!val) return 0;
    const clean = val
      .replace(/\s/g, '')
      .replace(/TL/gi, '')
      .replace(/₺/g, '');
    let numStr = clean;
    if (clean.includes('.') && clean.includes(',')) {
      numStr = clean.replace(/\./g, '').replace(',', '.');
    } else if (clean.includes(',')) {
      numStr = clean.replace(',', '.');
    }
    const num = parseFloat(numStr);
    return isNaN(num) ? 0 : num;
  };

  const currentParsedTutar = parseAmount(odenecekTutar);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedFirma = firmaUnvani.trim();
    if (!trimmedFirma) {
      setErrorMessage('Lütfen geçerli bir Firma Ünvanı giriniz.');
      return;
    }

    if (currentParsedTutar <= 0) {
      setErrorMessage('Lütfen 0\'dan büyük bir Ödenecek Tutar giriniz.');
      return;
    }

    setLoading(true);

    try {
      const targetTable = targetSiteConfig.tableName;

      // Primary insertion payload matching the exact table schema
      const payload: Record<string, any> = {
        firma_unvani: trimmedFirma,
        tutar: currentParsedTutar,
        durum: 'BEKLESİN',
        iban_no: '-',
        aciklama: 'Yeni Ödeme Talebi',
        talep_eden: 'Yönetim',
        cari_bakiye: 0
      };

      const { data, error } = await supabase
        .from(targetTable)
        .insert([payload])
        .select();

      if (error) {
        console.warn(`Primary insert on ${targetTable} failed, attempting fallback:`, error.message);
        // Fallback 1: with odenecek_tutar
        const fallbackPayload: Record<string, any> = {
          firma_unvani: trimmedFirma,
          odenecek_tutar: currentParsedTutar,
          durum: 'BEKLESİN',
          iban_no: '-',
          aciklama: 'Yeni Ödeme Talebi',
          talep_eden: 'Yönetim',
          cari_bakiye: 0
        };
        const { error: fbErr } = await supabase.from(targetTable).insert([fallbackPayload]);
        if (fbErr) {
          // Minimal fallback
          const minPayload: Record<string, any> = {
            firma_unvani: trimmedFirma,
            tutar: currentParsedTutar,
            durum: 'BEKLESİN',
            iban_no: '-'
          };
          const { error: minErr } = await supabase.from(targetTable).insert([minPayload]);
          if (minErr) {
            throw new Error(minErr.message || error.message);
          }
        }
      }

      if (showToast) {
        showToast(`"${trimmedFirma}" için ${targetSiteConfig.name} tablosuna ödeme kaydı başarıyla eklendi.`);
      }

      const insertedId = data && data[0] ? data[0].id : undefined;
      onSuccess(insertedId);
      onClose();
    } catch (err: any) {
      console.error('Error inserting payment record:', err);
      setErrorMessage(err.message || 'Ödeme kaydı eklenirken bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-800 transition-all transform scale-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-xs flex items-center justify-center border border-white/20 shadow-xs">
              <PlusCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 id="modal-title" className="text-base sm:text-lg font-black tracking-wide uppercase">
                ÖDEME EKLE
              </h3>
              <p className="text-xs text-indigo-100">
                {displayedSantiye} şantiyesi için yeni ödeme kaydı oluşturun
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
            aria-label="Kapat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{errorMessage}</div>
            </div>
          )}

          {/* 1. TEXTBOX: FİRMA ÜNVANI */}
          <div>
            <label
              htmlFor={firmaInputId}
              className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5"
            >
              <Building2 className="w-4 h-4 text-blue-600" />
              <span>FİRMA ÜNVANI</span>
              <span className="text-rose-500 font-bold">*</span>
            </label>
            <input
              id={firmaInputId}
              type="text"
              required
              autoFocus
              value={firmaUnvani}
              onChange={(e) => setFirmaUnvani(e.target.value)}
              placeholder="Firma veya şahıs ünvanını giriniz..."
              disabled={loading}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all placeholder:text-slate-400"
            />
          </div>

          {/* 2. TEXTBOX: ÖDENECEK TUTAR */}
          <div>
            <label
              htmlFor={tutarInputId}
              className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5"
            >
              <DollarSign className="w-4 h-4 text-emerald-600" />
              <span>ÖDENECEK TUTAR</span>
              <span className="text-rose-500 font-bold">*</span>
            </label>
            <div className="relative">
              <input
                id={tutarInputId}
                type="text"
                required
                value={odenecekTutar}
                onChange={(e) => setOdenecekTutar(e.target.value)}
                placeholder="Örn: 25.000,00"
                disabled={loading}
                className="w-full pl-3.5 pr-14 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono font-bold text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all placeholder:text-slate-400"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500 font-mono pointer-events-none">
                TL ₺
              </span>
            </div>

            {/* Live Currency Preview */}
            <div className="mt-1.5 flex items-center justify-between text-[11px] px-1">
              <span className="text-slate-500">Önizleme:</span>
              <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                {formatCurrency(currentParsedTutar)}
              </span>
            </div>
          </div>

          {/* 3. TEXTBOX: ŞANTİYE (ENABLED: FALSE / DISABLED) */}
          <div>
            <label
              htmlFor={santiyeInputId}
              className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between"
            >
              <div className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-amber-600" />
                <span>ŞANTİYE</span>
              </div>
              <span className="text-[10px] text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded border border-amber-200 flex items-center gap-1">
                <Lock className="w-3 h-3 text-amber-600" />
                Kilitli / Salt Okunur
              </span>
            </label>
            <div className="relative">
              <input
                id={santiyeInputId}
                type="text"
                value={displayedSantiye}
                disabled={true}
                readOnly={true}
                tabIndex={-1}
                className="w-full pl-3.5 pr-10 py-2.5 bg-slate-100 text-slate-600 border border-slate-300 rounded-xl font-bold text-sm cursor-not-allowed select-none focus:outline-none shadow-inner"
              />
              <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
              <span>Şantiye değeri bulunduğunuz sayfadan otomatik olarak alınmıştır (enabled: false).</span>
            </p>

            {/* If in All Mode, show which specific sub-table it targets */}
            {isAllMode && (
              <div className="mt-2.5 p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-xs flex flex-col gap-1.5">
                <span className="text-blue-800 font-bold">
                  Konsolide Sayfa: Kaydın Yazılacağı Şantiye Tablosu:
                </span>
                <select
                  value={selectedSubSite}
                  onChange={(e) => setSelectedSubSite(e.target.value)}
                  className="bg-white border border-blue-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  {SITES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.tableName})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Modal Actions */}
          <div className="pt-4 mt-6 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold text-xs transition-colors cursor-pointer"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={loading || !firmaUnvani.trim() || currentParsedTutar <= 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 hover:from-violet-500 hover:via-indigo-500 hover:to-purple-500 active:scale-95 disabled:from-slate-300 disabled:to-slate-300 disabled:cursor-not-allowed text-white font-black text-xs rounded-xl shadow-md shadow-indigo-500/25 transition-all cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Kaydediliyor...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 text-white" />
                  <span>Ödemeyi Kaydet</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
