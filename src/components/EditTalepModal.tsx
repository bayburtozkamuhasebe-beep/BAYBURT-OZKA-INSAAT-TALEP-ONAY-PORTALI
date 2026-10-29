import React, { useState, useEffect } from 'react';
import { TalepRecord, PaymentStatus } from '../types';
import { supabase } from '../lib/supabase';
import {
  getFirmaUnvani,
  getIban,
  getTalepEden,
  getAciklama,
  getTutar,
  getRecordStatus,
  getTarih,
  getNotlar,
  getCariBakiye,
  formatCurrencyPreview
} from '../lib/recordUtils';
import { X, Save, Edit3, Building, CreditCard, User, AlignLeft, DollarSign, Calendar, RefreshCw, CheckCircle2 } from 'lucide-react';

interface EditTalepModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: TalepRecord | null;
  siteTableName?: string;
  defaultTableName?: string;
  onSaved?: () => void;
  onSuccess?: () => void;
  showToast?: (msg: string) => void;
}

export const EditTalepModal: React.FC<EditTalepModalProps> = ({
  isOpen,
  onClose,
  record,
  siteTableName,
  defaultTableName,
  onSaved,
  onSuccess,
  showToast
}) => {
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    firma_unvani: '',
    iban: '',
    aciklama: '',
    odenecek_tutar: '',
    cari_bakiye: '',
    talep_eden: '',
    durum: 'BEKLESİN' as PaymentStatus,
    tarih: '',
    notlar: ''
  });

  useEffect(() => {
    if (record) {
      const bakiyeVal = getCariBakiye(record);
      setFormData({
        firma_unvani: getFirmaUnvani(record) === '-' ? '' : getFirmaUnvani(record),
        iban: getIban(record) === '-' ? '' : getIban(record),
        aciklama: getAciklama(record) === '-' ? '' : getAciklama(record),
        odenecek_tutar: String(getTutar(record) || ''),
        cari_bakiye: bakiyeVal === '-' || bakiyeVal === undefined || bakiyeVal === null ? '' : String(bakiyeVal),
        talep_eden: getTalepEden(record) === '-' ? '' : getTalepEden(record),
        durum: (getRecordStatus(record) || 'BEKLESİN') as PaymentStatus,
        tarih: getTarih(record) || new Date().toISOString().split('T')[0],
        notlar: getNotlar(record)
      });
    }
  }, [record]);

  if (!isOpen || !record) return null;

  const targetTable = record._siteTable || siteTableName || defaultTableName || 'arnavutkoy_talep';

  const notify = (msg: string) => {
    if (showToast) showToast(msg);
  };

  const handleExecuteSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!record.id) return;
    setSaving(true);

    const tutarNum = parseFloat(String(formData.odenecek_tutar).replace(',', '.')) || 0;
    const cleanIban = formData.iban.replace(/\s+/g, '').trim() || null;
    const recordId = record.id;

    // Parse and sanitize cari_bakiye value
    let cariBakiyeValue: number | string | null = null;
    const rawBakiye = String(formData.cari_bakiye ?? '').trim();
    if (rawBakiye !== '' && rawBakiye !== '-') {
      const cleaned = rawBakiye
        .replace(/\s/g, '')
        .replace(/TL/gi, '')
        .replace(/₺/g, '');
      let numStr = cleaned;
      if (cleaned.includes('.') && cleaned.includes(',')) {
        numStr = cleaned.replace(/\./g, '').replace(',', '.');
      } else if (cleaned.includes(',')) {
        numStr = cleaned.replace(',', '.');
      }
      const parsedNum = parseFloat(numStr);
      cariBakiyeValue = !isNaN(parsedNum) ? parsedNum : cleaned;
    } else {
      cariBakiyeValue = null;
    }

    try {
      console.log(`[EditTalepModal] Starting update on table: ${targetTable}, recordId: ${recordId}, cari_bakiye:`, cariBakiyeValue);

      // Build primary payload matching known table fields
      const payload: Record<string, any> = {
        firma_unvani: formData.firma_unvani.trim() || null,
        iban_no: cleanIban,
        aciklama: formData.aciklama.trim(),
        tutar: tutarNum,
        cari_bakiye: cariBakiyeValue,
        talep_eden: formData.talep_eden.trim(),
        durum: formData.durum
      };

      // Only add tarih and notlar if they actually exist in the record/schema to prevent postgrest column errors
      if ('tarih' in record && record.tarih !== undefined && formData.tarih) {
        payload.tarih = formData.tarih;
      }

      if ('notlar' in record && record.notlar !== undefined && formData.notlar !== undefined) {
        payload.notlar = formData.notlar ? formData.notlar.trim() : null;
      }

      // Try combined primary update
      const { error: primaryError } = await supabase
        .from(targetTable)
        .update(payload)
        .eq('id', recordId);

      if (primaryError) {
        console.warn(`[EditTalepModal] Primary combined update returned error:`, primaryError.message);

        // Resilient atomic field updates
        // 1. Tutar
        const r1 = await supabase.from(targetTable).update({ tutar: tutarNum }).eq('id', recordId);
        if (r1.error) {
          await supabase.from(targetTable).update({ odenecek_tutar: tutarNum }).eq('id', recordId);
        }

        // 2. Cari Bakiye (Atomic Guaranteed Update)
        const rCari = await supabase.from(targetTable).update({ cari_bakiye: cariBakiyeValue }).eq('id', recordId);
        if (rCari.error) {
          console.warn(`[EditTalepModal] cari_bakiye atomic update fallback on ${targetTable}:`, rCari.error.message);
          await supabase.from(targetTable).update({ cari_bakiye: cariBakiyeValue !== null ? String(cariBakiyeValue) : null }).eq('id', recordId);
        }

        // 3. Firma
        const r2 = await supabase.from(targetTable).update({ firma_unvani: formData.firma_unvani.trim() || null }).eq('id', recordId);
        if (r2.error) {
          await supabase.from(targetTable).update({ firma: formData.firma_unvani.trim() || null }).eq('id', recordId);
        }

        // 4. IBAN
        const r3 = await supabase.from(targetTable).update({ iban_no: cleanIban }).eq('id', recordId);
        if (r3.error) {
          await supabase.from(targetTable).update({ iban: cleanIban }).eq('id', recordId);
        }

        // 5. Açıklama
        const r4 = await supabase.from(targetTable).update({ aciklama: formData.aciklama.trim() }).eq('id', recordId);
        if (r4.error) {
          await supabase.from(targetTable).update({ malzeme: formData.aciklama.trim() }).eq('id', recordId);
        }

        // 6. Talep Eden
        await supabase.from(targetTable).update({ talep_eden: formData.talep_eden.trim() }).eq('id', recordId);

        // 7. Durum
        const r6 = await supabase.from(targetTable).update({ durum: formData.durum }).eq('id', recordId);
        if (r6.error) {
          await supabase.from(targetTable).update({ odeme_durumu: formData.durum }).eq('id', recordId);
        }

        // 8. Tarih (if applicable)
        if ('tarih' in record && formData.tarih) {
          await supabase.from(targetTable).update({ tarih: formData.tarih }).eq('id', recordId);
        }

        // 9. Notlar (if applicable)
        if ('notlar' in record && formData.notlar) {
          await supabase.from(targetTable).update({ notlar: formData.notlar.trim() || null }).eq('id', recordId);
        }
      } else {
        // Even when primary succeeded, make sure cari_bakiye is explicitly persisted
        await supabase.from(targetTable).update({ cari_bakiye: cariBakiyeValue }).eq('id', recordId);
      }

      // Update in-memory record so UI reflects immediately
      (record as any).cari_bakiye = cariBakiyeValue;
      (record as any).tutar = tutarNum;
      (record as any).firma_unvani = formData.firma_unvani.trim();
      (record as any).iban_no = cleanIban;
      (record as any).aciklama = formData.aciklama.trim();
      (record as any).talep_eden = formData.talep_eden.trim();
      (record as any).durum = formData.durum;

      notify(`Talep kaydı "${targetTable}" tablosunda başarıyla güncellendi.`);
      if (onSaved) onSaved();
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Update error:', err);
      notify(`Güncelleme sırasında hata oluştu: ${err.message || 'Bilinmeyen hata'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
              <Edit3 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base">Talep Bilgilerini Güncelle</h3>
              <p className="text-xs text-slate-300">
                Hedef Tablo: <span className="font-mono font-bold text-blue-300 bg-slate-800 px-2 py-0.5 rounded">{targetTable}</span> • Kayıt #{record.id}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleExecuteSave} className="p-6 space-y-4 overflow-y-auto flex-1 text-slate-800">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Firma Ünvanı */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-blue-600" />
                1. Firma Ünvanı
              </label>
              <input
                type="text"
                value={formData.firma_unvani}
                onChange={(e) => setFormData({ ...formData, firma_unvani: e.target.value })}
                placeholder="Firma / Tedarikçi Ünvanı"
                className="w-full bg-slate-50 border border-slate-300 focus:border-blue-600 focus:bg-white rounded-xl px-3.5 py-2 text-sm text-slate-900 outline-none transition font-medium"
              />
            </div>

            {/* İban */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                2. İBAN No
              </label>
              <input
                type="text"
                value={formData.iban}
                onChange={(e) => setFormData({ ...formData, iban: e.target.value })}
                placeholder="TR000000000000000000000000"
                className="w-full bg-slate-50 border border-slate-300 focus:border-blue-600 focus:bg-white rounded-xl px-3.5 py-2 text-sm text-slate-900 outline-none transition font-mono font-semibold"
              />
            </div>
          </div>

          {/* Açıklama */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 flex items-center gap-1.5">
              <AlignLeft className="w-3.5 h-3.5 text-blue-600" />
              3. Açıklama
            </label>
            <input
              type="text"
              required
              value={formData.aciklama}
              onChange={(e) => setFormData({ ...formData, aciklama: e.target.value })}
              placeholder="Talep edilen malzeme / hizmet açıklaması"
              className="w-full bg-slate-50 border border-slate-300 focus:border-blue-600 focus:bg-white rounded-xl px-3.5 py-2 text-sm text-slate-900 outline-none transition font-medium"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Ödenecek Tutar */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                4. Ödenecek Tutar (₺)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={formData.odenecek_tutar}
                onChange={(e) => setFormData({ ...formData, odenecek_tutar: e.target.value })}
                placeholder="0,00"
                className="w-full bg-slate-50 border border-slate-300 focus:border-emerald-600 focus:bg-white rounded-xl px-3.5 py-2 text-sm text-slate-900 outline-none transition font-mono font-bold"
              />
              {/* Formatlı Önizleme & Virgülle Ayrılış Rehberi */}
              <div className="mt-1.5 space-y-1">
                {formatCurrencyPreview(formData.odenecek_tutar) && (
                  <div className="text-[11px] font-mono font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 flex items-center justify-between shadow-xs">
                    <span className="text-[10px] text-emerald-700 uppercase font-sans font-bold">Ayrılmış:</span>
                    <span className="text-xs font-black">{formatCurrencyPreview(formData.odenecek_tutar)}</span>
                  </div>
                )}
                <div className="text-[10px] text-slate-500 leading-tight">
                  Örn: <span className="font-mono font-bold text-slate-700">125.450,50 ₺</span> (Kuruş için virgül <span className="font-bold text-emerald-700">","</span>)
                </div>
              </div>
            </div>

            {/* Cari Bakiye */}
            <div>
              <label className="block text-xs font-bold text-slate-900 uppercase mb-1.5 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-slate-700" />
                <span className="bg-slate-200 text-slate-800 px-1.5 py-0.5 rounded text-[10px] font-black border border-slate-300">CARİ BAKİYE (₺)</span>
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={formData.cari_bakiye}
                onChange={(e) => setFormData({ ...formData, cari_bakiye: e.target.value })}
                placeholder="0,00"
                className="w-full bg-slate-50 text-slate-900 border border-slate-300 focus:border-slate-500 focus:bg-white rounded-xl px-3.5 py-2 text-sm outline-none transition font-mono font-bold"
              />
              {/* Formatlı Önizleme & Virgülle Ayrılış Rehberi */}
              <div className="mt-1.5 space-y-1">
                {formatCurrencyPreview(formData.cari_bakiye) && (
                  <div className="text-[11px] font-mono font-bold text-blue-800 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 flex items-center justify-between shadow-xs">
                    <span className="text-[10px] text-blue-700 uppercase font-sans font-bold">Ayrılmış:</span>
                    <span className="text-xs font-black">{formatCurrencyPreview(formData.cari_bakiye)}</span>
                  </div>
                )}
                <div className="text-[10px] text-slate-500 leading-tight">
                  Örn: <span className="font-mono font-bold text-slate-700">125.450,50 ₺</span> (Kuruş için virgül <span className="font-bold text-blue-700">","</span>)
                </div>
              </div>
            </div>

            {/* Talep Eden */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-blue-600" />
                5. Talep Eden
              </label>
              <input
                type="text"
                required
                value={formData.talep_eden}
                onChange={(e) => setFormData({ ...formData, talep_eden: e.target.value })}
                placeholder="Talep eden kişi / birim"
                className="w-full bg-slate-50 border border-slate-300 focus:border-blue-600 focus:bg-white rounded-xl px-3.5 py-2 text-sm text-slate-900 outline-none transition font-medium"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Durum */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                6. Durum (Ödeme Onayı)
              </label>
              <select
                value={formData.durum}
                onChange={(e) => setFormData({ ...formData, durum: e.target.value as PaymentStatus })}
                className="w-full bg-slate-50 border border-slate-300 focus:border-blue-600 focus:bg-white rounded-xl px-3.5 py-2 text-sm text-slate-900 outline-none transition font-bold"
              >
                <option value="ÖDENSİN">🟢 ÖDENSİN (Onaylandı)</option>
                <option value="BEKLESİN">🟡 BEKLESİN (İnceleniyor)</option>
                <option value="ÖDENMESİN">🔴 ÖDENMESİN (Reddedildi)</option>
              </select>
            </div>

            {/* Tarih */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                Tarih
              </label>
              <input
                type="date"
                value={formData.tarih}
                onChange={(e) => setFormData({ ...formData, tarih: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 focus:border-blue-600 focus:bg-white rounded-xl px-3.5 py-2 text-sm text-slate-900 outline-none transition font-medium"
              />
            </div>
          </div>

          {/* Notlar */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
              Ek Notlar / Açıklamalar
            </label>
            <input
              type="text"
              value={formData.notlar}
              onChange={(e) => setFormData({ ...formData, notlar: e.target.value })}
              placeholder="Varsa özel notlar..."
              className="w-full bg-slate-50 border border-slate-300 focus:border-blue-600 focus:bg-white rounded-xl px-3.5 py-2 text-sm text-slate-900 outline-none transition"
            />
          </div>

          {/* Footer Buttons */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100 transition cursor-pointer"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black transition flex items-center gap-2 shadow-md cursor-pointer disabled:opacity-50 active:scale-95"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>VERİTABANINA KAYDEDİLİYOR...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>DEĞİŞİKLİKLERİ KAYDET VE GÜNCELLE</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

