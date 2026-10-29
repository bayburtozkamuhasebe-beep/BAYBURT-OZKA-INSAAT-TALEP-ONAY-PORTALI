import React, { useState, useEffect, useCallback } from 'react';
import { ODENECEK_SITES, OdenecekSiteConfig, TalepRecord } from '../types';
import { supabase } from '../lib/supabase';
import {
  getFirmaUnvani,
  getAciklama,
  getTutar,
  getIban,
  getTalepEden,
  getTarih,
  getNotlar,
  formatCurrency,
  getCariBakiye,
  formatCariBakiyeDisplay,
  getCariBakiyeTextStyle,
  getCariBakiyeTitle,
  isCariBakiyeLowerThanTutar
} from '../lib/recordUtils';
import {
  exportToExcel,
  exportToPDF,
  exportOdenecekTableToPDF,
  exportAllOdenecekTablesToSingleSheetExcel
} from '../lib/exportUtils';
import { executeServerSyncAllOdenecekToOdenenler } from '../lib/serverSyncService';
import {
  fetchCariFileFromBucket,
  matchCariStatus,
  ParsedCariRecord,
  SITE_CARI_BUCKET_MAP
} from '../lib/cariStorageService';
import { ServerSyncModal } from './ServerSyncModal';
import { EditTalepModal } from './EditTalepModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { CariKontrolModal } from './CariKontrolModal';
import { FaturaGosterButton } from './FaturaGosterButton';
import { FaturaGosterModal } from './FaturaGosterModal';
import { EvrakYokModal } from './EvrakYokModal';
import { FaturaInfo } from '../lib/faturaService';
import { resolveMuavinMapping } from '../lib/muavinService';
import {
  ArrowLeft,
  RefreshCw,
  CreditCard,
  Building2,
  AlertCircle,
  Copy,
  Check,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  Trash2,
  RotateCcw,
  Search,
  SearchCheck,
  CheckCheck,
  HelpCircle,
  X,
  Send,
  Server,
  UploadCloud,
  ShieldAlert,
  Layers,
  TrendingDown,
  TrendingUp,
  Edit3
} from 'lucide-react';

interface PaymentExecutionPageProps {
  onBackToRequests: () => void;
  onOpenMuavinPage?: (siteKey: string, record: TalepRecord | null) => void;
}

interface TableDataState {
  loading: boolean;
  records: TalepRecord[];
  error?: string;
}

interface ReturnModalState {
  isOpen: boolean;
  site: OdenecekSiteConfig | null;
  record: TalepRecord | null;
  loading: boolean;
}

interface ServerSyncModalState {
  isOpen: boolean;
  loading: boolean;
  progressStep?: string;
}

export const PaymentExecutionPage: React.FC<PaymentExecutionPageProps> = ({
  onBackToRequests,
  onOpenMuavinPage
}) => {
  const [tablesData, setTablesData] = useState<Record<string, TableDataState>>({});
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [copiedIban, setCopiedIban] = useState<string | null>(null);
  const [searchQueries, setSearchQueries] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Return to Talep Confirmation Modal State
  const [returnModal, setReturnModal] = useState<ReturnModalState>({
    isOpen: false,
    site: null,
    record: null,
    loading: false
  });

  // Edit Modal State
  const [editingRecord, setEditingRecord] = useState<TalepRecord | null>(null);
  const [editingSiteTable, setEditingSiteTable] = useState<string>('');
  const [editModalOpen, setEditModalOpen] = useState(false);

  // Cari Kontrol Modal State
  const [cariModalOpen, setCariModalOpen] = useState(false);
  const [cariRecord, setCariRecord] = useState<TalepRecord | null>(null);

  // Fatura & Evrak Modal State
  const [selectedFaturaRecord, setSelectedFaturaRecord] = useState<TalepRecord | null>(null);
  const [selectedFaturaInfo, setSelectedFaturaInfo] = useState<FaturaInfo | null>(null);
  const [selectedFaturaList, setSelectedFaturaList] = useState<FaturaInfo[]>([]);
  const [evrakYokFirma, setEvrakYokFirma] = useState<string | null>(null);

  const handleOpenFatura = (rec: TalepRecord, info: FaturaInfo, list: FaturaInfo[] = []) => {
    setSelectedFaturaRecord(rec);
    setSelectedFaturaInfo(info);
    setSelectedFaturaList(list && list.length > 0 ? list : (info ? [info] : []));
  };

  const handleNoFatura = (firmaName: string) => {
    setEvrakYokFirma(firmaName);
  };

  // Delete Confirmation Modal State
  const [deletingRecord, setDeletingRecord] = useState<TalepRecord | null>(null);
  const [deletingSiteTable, setDeletingSiteTable] = useState<string>('');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Server Sync (_odenenler) Confirmation Modal State
  const [serverSyncModal, setServerSyncModal] = useState<ServerSyncModalState>({
    isOpen: false,
    loading: false,
    progressStep: ''
  });

  // Supabase Storage Cari Verileri Haritası (Bucket -> Records)
  const [cariDataMap, setCariDataMap] = useState<Record<string, ParsedCariRecord[]>>({});

  const handleOpenCari = (record: TalepRecord) => {
    if (onOpenMuavinPage) {
      const siteKey = record._siteTable || record._siteId || 'arnavutkoy';
      const mapping = resolveMuavinMapping(siteKey, record);
      onOpenMuavinPage(mapping.siteKey, record);
    } else {
      setCariRecord(record);
      setCariModalOpen(true);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Tüm Şantiyeler İçin İlgili Supabase Storage Cari XLSX Dosyalarını Çek
  const fetchAllCariBuckets = useCallback(async () => {
    const bucketsToFetch = [
      'ARNAVUTKOYCARILER',
      'MAMAKCARILER',
      'BURSACARILER',
      'MERKEZOZKACARILER'
    ];

    const results: Record<string, ParsedCariRecord[]> = {};

    await Promise.all(
      bucketsToFetch.map(async (bucket) => {
        try {
          const res = await fetchCariFileFromBucket(bucket);
          results[bucket] = res.records || [];
        } catch {
          results[bucket] = [];
        }
      })
    );

    setCariDataMap(results);
  }, []);

  // Fetch data for all 7 _odenecek tables
  const fetchAllOdenecekTables = useCallback(async () => {
    setRefreshing(true);
    const newStates: Record<string, TableDataState> = {};

    await Promise.all(
      ODENECEK_SITES.map(async (site) => {
        try {
          const { data, error } = await supabase
            .from(site.tableName)
            .select('*')
            .order('id', { ascending: false });

          if (error) {
            newStates[site.tableName] = {
              loading: false,
              records: [],
              error: error.message
            };
          } else {
            newStates[site.tableName] = {
              loading: false,
              records: data || []
            };
          }
        } catch (err: any) {
          newStates[site.tableName] = {
            loading: false,
            records: [],
            error: err.message || 'Veri yüklenemedi'
          };
        }
      })
    );

    setTablesData(newStates);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchAllOdenecekTables();
    fetchAllCariBuckets();
  }, [fetchAllOdenecekTables, fetchAllCariBuckets]);

  const handleCopyIban = (iban: string) => {
    if (!iban || iban === '-') return;
    navigator.clipboard.writeText(iban);
    setCopiedIban(iban);
    showToast(`IBAN panoya kopyalandı: ${iban}`);
    setTimeout(() => setCopiedIban(null), 2500);
  };

  // Single Record: Mark as Paid
  const handleMarkAsPaid = async (tableName: string, recordId: string | number) => {
    const actionKey = `${tableName}-${recordId}`;
    setActionLoading((prev) => ({ ...prev, [actionKey]: true }));

    try {
      const { error } = await supabase
        .from(tableName)
        .update({ durum: 'ÖDENDİ', odeme_durumu: 'ÖDENDİ' })
        .eq('id', recordId);

      if (error) {
        await supabase.from(tableName).update({ durum: 'ÖDENDİ' }).eq('id', recordId);
      }

      setTablesData((prev) => {
        const current = prev[tableName];
        if (!current) return prev;
        return {
          ...prev,
          [tableName]: {
            ...current,
            records: current.records.map((r) =>
              r.id === recordId ? { ...r, durum: 'ÖDENDİ', odeme_durumu: 'ÖDENDİ' } : r
            )
          }
        };
      });

      showToast('Kayıt durumu başarıyla "ÖDENDİ" olarak güncellendi.');
    } catch (err: any) {
      showToast(`Hata: ${err.message || 'Güncellenemedi'}`);
    } finally {
      setActionLoading((prev) => ({ ...prev, [actionKey]: false }));
    }
  };

  // Open confirmation modal for returning a record to _talep
  const openReturnModal = (site: OdenecekSiteConfig, record: TalepRecord) => {
    setReturnModal({
      isOpen: true,
      site,
      record,
      loading: false
    });
  };

  const closeReturnModal = () => {
    setReturnModal({
      isOpen: false,
      site: null,
      record: null,
      loading: false
    });
  };

  // Execute confirmed transfer from _odenecek to _talep
  const handleConfirmMoveBackToTalep = async () => {
    const { site, record } = returnModal;
    if (!site || !record) return;

    setReturnModal((prev) => ({ ...prev, loading: true }));
    const actionKey = `moveback-${site.tableName}-${record.id}`;
    setActionLoading((prev) => ({ ...prev, [actionKey]: true }));

    try {
      const firma = getFirmaUnvani(record);
      const ibanVal = getIban(record);
      const aciklamaVal = getAciklama(record);
      const tutarVal = getTutar(record);
      const talepEdenVal = getTalepEden(record);

      const payload = {
        firma_unvani: firma !== '-' ? firma : (record.firma_unvani || ''),
        iban_no: ibanVal || record.iban_no || record.iban || '',
        aciklama: aciklamaVal !== '-' ? aciklamaVal : (record.aciklama || ''),
        tutar: tutarVal || 0,
        talep_eden: talepEdenVal !== '-' ? talepEdenVal : (record.talep_eden || ''),
        durum: 'ÖDENSİN'
      };

      // 1. Insert into destination _talep table
      const { error: insErr } = await supabase.from(site.talepTableName).insert([payload]);
      if (insErr) throw insErr;

      // 2. Delete from source _odenecek table
      if (record.id) {
        const { error: delErr } = await supabase.from(site.tableName).delete().eq('id', record.id);
        if (delErr) {
          console.warn('Delete warning:', delErr);
        }
      }

      // 3. Update UI state locally
      setTablesData((prev) => {
        const current = prev[site.tableName];
        if (!current) return prev;
        return {
          ...prev,
          [site.tableName]: {
            ...current,
            records: current.records.filter((r) => r.id !== record.id)
          }
        };
      });

      closeReturnModal();
      showToast(`Kayıt "${firma}", ${site.tableName} tablosundan ${site.talepTableName} tablosuna başarıyla geri taşındı.`);
    } catch (err: any) {
      showToast(`Geri taşıma hatası: ${err.message || 'İşlem gerçekleştirilemedi'}`);
      setReturnModal((prev) => ({ ...prev, loading: false }));
    } finally {
      setActionLoading((prev) => ({ ...prev, [actionKey]: false }));
    }
  };

  // Open Edit Modal for a record in _odenecek table
  const handleOpenEdit = (site: OdenecekSiteConfig, record: TalepRecord) => {
    setEditingRecord(record);
    setEditingSiteTable(site.tableName);
    setEditModalOpen(true);
  };

  // Callback when edit modal finishes saving to Supabase
  const handleEditSaved = () => {
    showToast('Kayıt ve cari bakiye veritabanında başarıyla güncellendi.');
    fetchAllOdenecekTables();
  };

  // Open Delete Confirmation Modal for a record in _odenecek table
  const handleOpenDelete = (site: OdenecekSiteConfig, record: TalepRecord) => {
    setDeletingRecord(record);
    setDeletingSiteTable(site.tableName);
    setDeleteModalOpen(true);
  };

  // Execute Confirmed Delete from _odenecek table
  const handleConfirmDelete = async () => {
    if (!deletingRecord || deletingRecord.id === undefined || !deletingSiteTable) return;
    const recordId = deletingRecord.id;
    const tableName = deletingSiteTable;
    setDeleteLoading(true);

    try {
      const { error } = await supabase.from(tableName).delete().eq('id', recordId);
      if (error) throw error;

      setTablesData((prev) => {
        const current = prev[tableName];
        if (!current) return prev;
        return {
          ...prev,
          [tableName]: {
            ...current,
            records: current.records.filter((r) => r.id !== recordId)
          }
        };
      });

      showToast('Kayıt veritabanından kalıcı olarak silindi.');
      setDeleteModalOpen(false);
      setDeletingRecord(null);
      setDeletingSiteTable('');
    } catch (err: any) {
      showToast(`Silme hatası: ${err.message || 'Hata'}`);
    } finally {
      setDeleteLoading(false);
    }
  };

  // Bulk: Mark All as Paid for a table
  const handleMarkAllTableAsPaid = async (tableName: string) => {
    const current = tablesData[tableName];
    if (!current || current.records.length === 0) return;

    if (!window.confirm(`Bu tablodaki tüm ${current.records.length} adet kaydı "ÖDENDİ" olarak işaretlemek istiyor musunuz?`)) {
      return;
    }

    const actionKey = `bulkpaid-${tableName}`;
    setActionLoading((prev) => ({ ...prev, [actionKey]: true }));

    try {
      const ids = current.records.map((r) => r.id).filter((id) => id !== undefined && id !== null);
      if (ids.length > 0) {
        await supabase
          .from(tableName)
          .update({ durum: 'ÖDENDİ', odeme_durumu: 'ÖDENDİ' })
          .in('id', ids);
      }

      setTablesData((prev) => {
        const curr = prev[tableName];
        if (!curr) return prev;
        return {
          ...prev,
          [tableName]: {
            ...curr,
            records: curr.records.map((r) => ({ ...r, durum: 'ÖDENDİ', odeme_durumu: 'ÖDENDİ' }))
          }
        };
      });

      showToast(`Tüm ${ids.length} kayıt "ÖDENDİ" olarak güncellendi.`);
    } catch (err: any) {
      showToast(`Güncelleme hatası: ${err.message}`);
    } finally {
      setActionLoading((prev) => ({ ...prev, [actionKey]: false }));
    }
  };

  // Calculate global summary stats across all 7 tables
  const allTableStates = Object.values(tablesData) as TableDataState[];
  const totalAllOdenecekCount = allTableStates.reduce(
    (acc: number, t: TableDataState) => acc + (t.records ? t.records.length : 0),
    0
  );

  const totalAllOdenecekAmount = allTableStates.reduce(
    (acc: number, t: TableDataState) =>
      acc + (t.records ? t.records.reduce((sum, r) => sum + getTutar(r), 0) : 0),
    0
  );

  // Export all 7 tables into a single Excel sheet with separate sub-tables
  const handleExportAllTablesToSingleExcel = () => {
    const tablesToExport = ODENECEK_SITES.map((site) => ({
      siteName: site.name,
      tableName: site.tableName,
      records: tablesData[site.tableName]?.records || []
    }));

    const res = exportAllOdenecekTablesToSingleSheetExcel(
      tablesToExport,
      'Tum_Santiyeler_Odenecek_Konsolide'
    );

    if (res.success) {
      showToast(res.message);
    }
  };

  // Export single site table to formatted landscape PDF with Turkish font, subtotals, and total count/amount
  const handleExportOdenecekTablePDF = (siteName: string, recordsToExport: TalepRecord[]) => {
    if (!recordsToExport || recordsToExport.length === 0) {
      showToast(`${siteName} tablosunda dışa aktarılacak kayıt bulunamadı.`);
      return;
    }
    const res = exportOdenecekTableToPDF(siteName, recordsToExport);
    if (res.success) {
      showToast(res.message);
    }
  };

  // Open Server Sync Modal
  const handleOpenServerSyncModal = () => {
    if (totalAllOdenecekCount === 0) {
      showToast('Sunucuya aktarılacak herhangi bir ödenecek kayıt bulunmamaktadır.');
      return;
    }
    setServerSyncModal({
      isOpen: true,
      loading: false,
      progressStep: ''
    });
  };

  const handleCloseServerSyncModal = () => {
    if (!serverSyncModal.loading) {
      setServerSyncModal({
        isOpen: false,
        loading: false,
        progressStep: ''
      });
    }
  };

  // Bulk Transfer all non-empty _odenecek tables to their corresponding _odenenler tables
  const handleConfirmSendAllToOdenenlerServer = async () => {
    setServerSyncModal((prev) => ({ ...prev, loading: true }));

    // Prepare current records map from tablesData
    const preloadedMap: Record<string, TalepRecord[]> = {};
    Object.entries(tablesData).forEach(([tbl, val]) => {
      preloadedMap[tbl] = (val as TableDataState)?.records || [];
    });

    try {
      const syncResult = await executeServerSyncAllOdenecekToOdenenler(
        (progressStep) => {
          setServerSyncModal((prev) => ({ ...prev, progressStep }));
        },
        preloadedMap
      );

      if (!syncResult.success) {
        showToast(syncResult.message);
        setServerSyncModal((prev) => ({ ...prev, loading: false }));
        return;
      }

      // Update local state: clear the transferred tables
      setTablesData((prev) => {
        const next = { ...prev };
        syncResult.results.forEach((r) => {
          if (r.status === 'transferred' && next[r.site.tableName]) {
            next[r.site.tableName] = {
              ...next[r.site.tableName],
              records: []
            };
          }
        });
        return next;
      });

      setServerSyncModal({
        isOpen: false,
        loading: false,
        progressStep: ''
      });

      showToast(syncResult.message);
      // Refresh to ensure full sync
      fetchAllOdenecekTables(false);
    } catch (err: any) {
      console.error('Server sync error:', err);
      showToast(`Sunucuya aktarım sırasında hata oluştu: ${err.message || 'İşlem tamamlanamadı'}`);
      setServerSyncModal((prev) => ({ ...prev, loading: false }));
    }
  };

  return (
    <div className="w-full max-w-[98%] xl:max-w-[1780px] 2xl:max-w-[1900px] mx-auto px-2 sm:px-4 lg:px-6 py-6 space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-4 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl border border-emerald-500/50 flex items-center gap-3 animate-bounce">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <span className="text-xs font-bold">{toastMessage}</span>
        </div>
      )}

      {/* TOP HEADER & ACTION BAR */}
      <div className="bg-gradient-to-r from-[#0b172a] via-[#112240] to-[#0b172a] rounded-3xl p-6 border border-blue-900/50 shadow-2xl text-white">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={onBackToRequests}
                className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-2 border border-blue-400/40 shadow-lg shadow-blue-600/30 transition-all cursor-pointer active:scale-95"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>TALEPLERE GERİ DÖN</span>
              </button>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold">
                <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
                <span>MERKEZİ ÖDEME YÖNETİMİ</span>
              </div>
            </div>
            <h1 className="text-xl sm:text-3xl font-black tracking-tight text-white uppercase pt-1 flex items-center gap-2">
              <span>ÖDEMELERİ GERÇEKLEŞTİR</span>
            </h1>
            <p className="text-xs text-blue-200/80">
              7 Şantiye ve birimin ödenecek listeleri alt alta listelenmiştir. Tablolardaki kayıtları ödendi yapabilir, Excel/PDF formatında indirebilir veya ilgili talep tablosuna geri gönderebilirsiniz.
            </p>
          </div>

          {/* Right Summary Chips & Refresh */}
          <div className="flex flex-wrap items-center gap-3 self-start md:self-auto">
            <div className="bg-slate-900/80 px-4 py-2 rounded-2xl border border-blue-800/40 text-right">
              <div className="text-[10px] uppercase font-bold text-blue-300 tracking-wider">
                Genel Ödenecek Sayısı
              </div>
              <div className="text-base sm:text-lg font-mono font-black text-white">
                {totalAllOdenecekCount}{' '}
                <span className="text-xs font-normal text-slate-400">Kayıt</span>
              </div>
            </div>

            <div className="bg-emerald-950/60 px-4 py-2 rounded-2xl border border-emerald-600/40 text-right">
              <div className="text-[10px] uppercase font-bold text-emerald-300 tracking-wider">
                Genel Toplam Tutar
              </div>
              <div className="text-base sm:text-lg font-mono font-black text-emerald-400">
                {formatCurrency(totalAllOdenecekAmount)}
              </div>
            </div>

            <button
              type="button"
              onClick={fetchAllOdenecekTables}
              disabled={refreshing}
              className="p-3 rounded-2xl bg-blue-900/60 hover:bg-blue-800 text-blue-200 hover:text-white border border-blue-700/50 transition cursor-pointer active:scale-95 disabled:opacity-50"
              title="Tüm tabloları yenile"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-emerald-300' : ''}`} />
            </button>
          </div>
        </div>

        {/* Quick Table Navigation Chips */}
        <div className="mt-5 pt-4 border-t border-blue-900/40 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          <span className="text-[11px] font-bold text-blue-300/80 uppercase tracking-wider mr-1 whitespace-nowrap">
            Hızlı Atlama:
          </span>
          {ODENECEK_SITES.map((site) => {
            const tableRecords = tablesData[site.tableName]?.records || [];
            const count = tableRecords.length;
            return (
              <a
                key={site.id}
                href={`#table-${site.tableName}`}
                className="px-3 py-1 rounded-xl text-xs font-bold bg-[#0d1e38] hover:bg-blue-900/70 text-blue-200 hover:text-white border border-blue-800/40 flex items-center gap-1.5 whitespace-nowrap transition"
              >
                <span>{site.name}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    count > 0 ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {count}
                </span>
              </a>
            );
          })}
        </div>
      </div>

      {/* 7 ODENECEK TABLES RENDERED SEQUENTIALLY */}
      <div className="space-y-8">
        {ODENECEK_SITES.map((site, siteIndex) => {
          const tableState = tablesData[site.tableName] || { loading: true, records: [] };
          const rawRecords = tableState.records || [];
          const query = searchQueries[site.tableName] || '';

          // Filter by search query
          const records = rawRecords.filter((rec) => {
            if (!query) return true;
            const q = query.toLowerCase();
            return (
              getFirmaUnvani(rec).toLowerCase().includes(q) ||
              getIban(rec).toLowerCase().includes(q) ||
              getAciklama(rec).toLowerCase().includes(q) ||
              getTalepEden(rec).toLowerCase().includes(q)
            );
          });

          const tableTotalAmount = rawRecords.reduce((sum, r) => sum + getTutar(r), 0);

          return (
            <div
              key={site.tableName}
              id={`table-${site.tableName}`}
              className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden text-slate-800 transition-all scroll-mt-24"
            >
              {/* Table Card Header with Site Theme */}
              <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-4 sm:p-5 border-b border-slate-700 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-blue-600/90 text-white flex items-center justify-center font-black text-sm shadow-md border border-blue-400/40 flex-shrink-0">
                    {siteIndex + 1}
                  </div>
                  <div>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h2 className="text-base sm:text-lg font-black tracking-tight text-white uppercase flex items-center gap-2">
                        <span>{site.name}</span>
                      </h2>
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-blue-950/80 text-cyan-300 border border-cyan-500/30">
                        {site.tableName}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Toplam {rawRecords.length} adet ödenecek kaydı • Toplam Tutar:{' '}
                      <strong className="text-emerald-400 font-mono">
                        {formatCurrency(tableTotalAmount)}
                      </strong>
                    </p>
                  </div>
                </div>

                {/* Table Control Actions (Top Bar) */}
                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Search Bar inside table */}
                  {rawRecords.length > 0 && (
                    <div className="relative flex-1 sm:w-56">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Tabloda ara..."
                        value={query}
                        onChange={(e) =>
                          setSearchQueries((prev) => ({
                            ...prev,
                            [site.tableName]: e.target.value
                          }))
                        }
                        className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-800/90 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-blue-400"
                      />
                    </div>
                  )}

                  {/* Bulk Mark All Paid */}
                  {rawRecords.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleMarkAllTableAsPaid(site.tableName)}
                      disabled={actionLoading[`bulkpaid-${site.tableName}`]}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs border border-emerald-400/40 flex items-center gap-1.5 transition cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
                      title="Tümünü Ödendi Yap"
                    >
                      {actionLoading[`bulkpaid-${site.tableName}`] ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCheck className="w-3.5 h-3.5" />
                      )}
                      <span className="hidden sm:inline">Tümünü</span> Ödendi Yap
                    </button>
                  )}

                  {/* Top Export Excel */}
                  {rawRecords.length > 0 && (
                    <button
                      type="button"
                      onClick={() => exportToExcel(records, `${site.name}_Odenecekler`)}
                      className="px-3 py-1.5 rounded-xl bg-emerald-700/80 hover:bg-emerald-700 text-white font-bold text-xs border border-emerald-500/40 flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                      title="Excel İndir"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-200" />
                      <span className="hidden sm:inline">Excel</span>
                    </button>
                  )}

                  {/* Top Export PDF - HER TABLONUN ÜZERİNDE PDF AKTAR BUTONU */}
                  {rawRecords.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        handleExportOdenecekTablePDF(
                          site.name,
                          records.length > 0 ? records : rawRecords
                        )
                      }
                      className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-bold text-xs border border-rose-400/50 shadow-md hover:shadow-rose-600/30 flex items-center gap-1.5 transition cursor-pointer active:scale-95"
                      title={`${site.name} tablosunu PDF formatında aktar`}
                    >
                      <Download className="w-3.5 h-3.5 text-rose-100" />
                      <span>PDF AKTAR</span>
                    </button>
                  )}
                </div>
              </div>

              {/* TABLE BODY CONTENT */}
              <div>
                {tableState.loading ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-500">
                    <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
                    <span className="text-xs font-bold">
                      {site.name} tablosu verileri yükleniyor...
                    </span>
                  </div>
                ) : rawRecords.length === 0 ? (
                  /* VERİ BULUNMAMAKTADIR YAZISI */
                  <div className="py-12 px-6 flex flex-col items-center justify-center text-center bg-slate-50/70 border-b border-slate-100">
                    <div className="w-14 h-14 rounded-2xl bg-slate-200/80 text-slate-400 flex items-center justify-center mb-3">
                      <AlertCircle className="w-7 h-7" />
                    </div>
                    <div className="text-base sm:text-lg font-black text-slate-700 tracking-wide uppercase">
                      VERİ BULUNMAMAKTADIR
                    </div>
                    <p className="text-xs text-slate-500 max-w-md mt-1">
                      {site.name} ({site.tableName}) tablosunda henüz ödenecek kayıt bulunmamaktadır.
                      Talepler sayfasından &ldquo;Ödenecekleri Ödeme Listesine Ekle&rdquo; butonu ile buraya veri aktarabilirsiniz.
                    </p>
                  </div>
                ) : records.length === 0 ? (
                  /* Search filter empty state */
                  <div className="py-8 text-center text-xs text-slate-500 bg-slate-50">
                    Arama kriterinize uygun kayıt bulunamadı.
                  </div>
                ) : (
                  /* Responsive Rich Data Table */
                  <div className="overflow-x-auto border border-slate-300 rounded-xl">
                    <table className="w-full text-left border-collapse border border-slate-300 text-xs">
                      <thead>
                        <tr className="bg-slate-100 text-slate-800 border-b-2 border-slate-300 font-black text-[11px] uppercase tracking-wider">
                          <th className="py-3.5 px-3.5 text-center w-12 border-r border-slate-300">#</th>
                          <th className="py-3.5 px-4 min-w-[220px] 2xl:min-w-[260px] border-r border-slate-300">FİRMA ÜNVANI</th>
                          <th className="py-3.5 px-2.5 font-black w-[150px] min-w-[135px] max-w-[160px] border-r border-slate-300">IBAN NO</th>
                          <th className="py-3.5 px-3 font-black w-[175px] min-w-[150px] max-w-[195px] border-r border-slate-300">AÇIKLAMA</th>
                          <th className="py-3.5 px-4 text-right min-w-[130px] 2xl:min-w-[150px] border-r border-slate-300">TUTAR (TL)</th>
                          <th className="py-3.5 px-4 text-right min-w-[150px] 2xl:min-w-[170px] border-r border-slate-300 bg-slate-200/60 text-slate-800 font-black tracking-wide shadow-2xs">
                            <div className="flex flex-col items-end">
                              <span>CARİ BAKİYE</span>
                              <span className="text-[9px] font-bold text-slate-500 tracking-normal normal-case">≥ Tutar: Yeşil • &lt; Tutar: Kırmızı (Yanıp Sönen)</span>
                            </div>
                          </th>
                          <th className="py-3.5 px-2.5 font-black w-[110px] min-w-[100px] max-w-[125px] border-r border-slate-300">TALEP EDEN</th>
                          <th className="py-3.5 px-3.5 text-center min-w-[110px] border-r border-slate-300">DURUM</th>
                          <th className="py-3.5 px-3.5 text-center min-w-[100px] border-r border-slate-300">TARİH</th>
                          <th className="py-3.5 px-3.5 text-center min-w-[340px]">İŞLEMLER</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-300 bg-white">
                        {records.map((rec, index) => {
                          const firma = getFirmaUnvani(rec);
                          const iban = getIban(rec);
                          const aciklama = getAciklama(rec);
                          const tutar = getTutar(rec);
                          const cariBakiye = getCariBakiye(rec);
                          const talepEden = getTalepEden(rec);
                          const isPaid = (rec.durum || '').toUpperCase() === 'ÖDENDİ';
                          const actionKeyPaid = `${site.tableName}-${rec.id}`;
                          const actionKeyMoveBack = `moveback-${site.tableName}-${rec.id}`;

                          return (
                            <tr
                              key={rec.id || index}
                              className={`hover:bg-blue-50/70 transition-colors ${
                                isPaid ? 'bg-emerald-50/40' : ''
                              }`}
                            >
                              {/* Sıra No */}
                              <td className="py-3.5 px-3.5 text-center font-mono font-bold text-slate-500 border-r border-b border-slate-300">
                                {index + 1}
                              </td>

                              {/* Firma Ünvanı */}
                              <td className="py-3 px-3.5 font-bold text-slate-900 border-r border-b border-slate-300">
                                <div className="flex flex-col gap-1.5">
                                  <div className="leading-snug text-xs sm:text-sm">{firma}</div>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <button
                                      type="button"
                                      onClick={() => handleOpenCari(rec)}
                                      className="inline-flex items-center gap-1 self-start px-2 py-0.5 rounded-md text-[10.5px] font-bold transition-all bg-purple-50 text-purple-700 hover:bg-purple-600 hover:text-white border border-purple-200 cursor-pointer shadow-2xs hover:shadow-xs active:scale-95 whitespace-nowrap"
                                      title={`${firma} için Cari Hesap ve Tedarikçi Geçmişini Kontrol Et`}
                                    >
                                      <SearchCheck className="w-3 h-3" />
                                      <span>CARİ KONTROL ET</span>
                                    </button>

                                    <FaturaGosterButton
                                      rowId={rec.id || index}
                                      firmaUnvani={firma}
                                      record={rec}
                                      onOpenFatura={handleOpenFatura}
                                      onNoFatura={handleNoFatura}
                                    />
                                  </div>
                                </div>
                              </td>

                              {/* IBAN No with Copy (Daraltılmış) */}
                              <td className="py-2.5 px-2.5 w-[150px] min-w-[135px] max-w-[160px] font-mono text-[11px] text-slate-700 border-r border-b border-slate-300">
                                {iban && iban !== '-' ? (
                                  <div className="flex items-center gap-1.5 justify-between w-full">
                                    <span
                                      className="font-semibold text-slate-900 select-all tracking-tight break-all leading-tight bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200/80 flex-1 min-w-0"
                                      title={iban}
                                    >
                                      {iban}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleCopyIban(iban)}
                                      className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-100 rounded transition cursor-pointer flex-shrink-0"
                                      title="IBAN Kopyala"
                                    >
                                      {copiedIban === iban ? (
                                        <Check className="w-3.5 h-3.5 text-emerald-600 font-bold" />
                                      ) : (
                                        <Copy className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-slate-400">-</span>
                                )}
                              </td>

                              {/* Açıklama (Daraltılmış) */}
                              <td className="py-2.5 px-3 w-[175px] min-w-[150px] max-w-[195px] text-slate-700 border-r border-b border-slate-300">
                                <div
                                  className="leading-snug text-xs font-medium line-clamp-3 hover:line-clamp-none transition-all break-words"
                                  title={aciklama}
                                >
                                  {aciklama}
                                </div>
                              </td>

                              {/* Tutar */}
                              <td className="py-3.5 px-4 text-right font-mono font-black text-xs sm:text-sm text-emerald-700 whitespace-nowrap border-r border-b border-slate-300 bg-emerald-50/10">
                                {formatCurrency(tutar)}
                              </td>

                              {/* Cari Bakiye */}
                              <td
                                className="py-2.5 px-3 text-right whitespace-nowrap border-r border-b border-slate-300 bg-slate-100/60 shadow-2xs"
                                title={getCariBakiyeTitle(cariBakiye, tutar)}
                              >
                                <div className={`font-mono font-black text-xs sm:text-sm tracking-tight ${getCariBakiyeTextStyle(cariBakiye, tutar)}`}>
                                  {formatCariBakiyeDisplay(cariBakiye)}
                                </div>
                              </td>

                              {/* Talep Eden (Daraltılmış) */}
                              <td className="py-2.5 px-2.5 w-[110px] min-w-[100px] max-w-[125px] font-medium text-xs text-slate-700 border-r border-b border-slate-300">
                                <div className="truncate leading-tight" title={talepEden}>
                                  {talepEden}
                                </div>
                              </td>

                              {/* Durum */}
                              <td className="py-3.5 px-3.5 text-center whitespace-nowrap border-r border-b border-slate-300">
                                {isPaid ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>ÖDENDİ</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-blue-100 text-blue-800 border border-blue-300">
                                    <Clock className="w-3.5 h-3.5 text-blue-600" />
                                    <span>ÖDENSİN</span>
                                  </span>
                                )}
                              </td>

                              {/* Tarih */}
                              <td className="py-3.5 px-3.5 text-center text-[11px] text-slate-500 whitespace-nowrap border-r border-b border-slate-300">
                                {getTarih(rec)}
                              </td>

                              {/* İşlemler (GÜNCELLE & SİL & GERİ GÖNDER & Ödendi Yap) */}
                              <td className="py-3.5 px-3.5 text-center whitespace-nowrap border-b border-slate-300">
                                <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                  {/* GÜNCELLE BUTONU */}
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEdit(site, rec)}
                                    className="px-2.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-200 font-bold text-[11px] transition flex items-center gap-1 cursor-pointer shadow-xs active:scale-95"
                                    title="Kaydı Düzenle ve Güncelle (Önce Onay Alır)"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                    <span>GÜNCELLE</span>
                                  </button>

                                  {/* SİL BUTONU */}
                                  <button
                                    type="button"
                                    onClick={() => handleOpenDelete(site, rec)}
                                    className="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 font-bold text-[11px] transition flex items-center gap-1 cursor-pointer shadow-xs active:scale-95"
                                    title="Kaydı Veritabanından Sil (Önce Onay Alır)"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>SİL</span>
                                  </button>

                                  {/* GERİ GÖNDER BUTONU */}
                                  <button
                                    type="button"
                                    onClick={() => openReturnModal(site, rec)}
                                    disabled={actionLoading[actionKeyMoveBack]}
                                    className="px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 hover:text-amber-900 border border-amber-300 font-bold text-[11px] transition flex items-center gap-1 cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
                                    title={`${site.name} (${site.tableName}) tablosundaki bu kaydı ${site.talepTableName} tablosuna geri gönder`}
                                  >
                                    {actionLoading[actionKeyMoveBack] ? (
                                      <RefreshCw className="w-3 h-3 animate-spin text-amber-700" />
                                    ) : (
                                      <RotateCcw className="w-3.5 h-3.5 text-amber-700" />
                                    )}
                                    <span>GERİ GÖNDER</span>
                                  </button>

                                  {/* Mark as Paid Button */}
                                  {!isPaid && (
                                    <button
                                      type="button"
                                      onClick={() => handleMarkAsPaid(site.tableName, rec.id!)}
                                      disabled={actionLoading[actionKeyPaid]}
                                      className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] transition flex items-center gap-1 cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
                                      title="Ödendi Olarak İşaretle"
                                    >
                                      {actionLoading[actionKeyPaid] ? (
                                        <RefreshCw className="w-3 h-3 animate-spin" />
                                      ) : (
                                        <Check className="w-3 h-3" />
                                      )}
                                      <span>Ödendi Yap</span>
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      {/* Table Footer Totals */}
                      <tfoot>
                        <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300 text-xs">
                          <td colSpan={4} className="py-3.5 px-4 text-right uppercase tracking-wider border-r border-slate-300">
                            {site.name} Toplam Tutar:
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono text-emerald-800 text-sm sm:text-base border-r border-slate-300 bg-emerald-50/30">
                            {formatCurrency(tableTotalAmount)}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono text-slate-600 text-xs sm:text-sm border-r border-slate-400 bg-slate-300 font-bold shadow-xs">
                            -
                          </td>
                          <td colSpan={4} className="py-3.5 px-4 text-slate-600 text-[11px]">
                            {records.length} Kayıt Listelendi
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>

              {/* DEDICATED TABLE FOOTER BUTTONS: PDF İNDİR & EXCEL İNDİR */}
              <div className="bg-slate-50 px-5 py-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="text-xs sm:text-sm text-slate-600 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-blue-600" />
                  <span>
                    <strong className="text-slate-800 font-bold">{site.name}</strong> •{' '}
                    {rawRecords.length} Kayıt •{' '}
                    <strong className="text-emerald-700 font-mono font-bold">
                      {formatCurrency(tableTotalAmount)}
                    </strong>
                  </span>
                </div>

                {/* PDF İNDİR & EXCEL İNDİR BUTONLARI */}
                <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      exportToExcel(
                        rawRecords,
                        `${site.name}_Odenecekler`
                      )
                    }
                    disabled={rawRecords.length === 0}
                    className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs border border-emerald-400/50 shadow-md hover:shadow-emerald-600/30 flex items-center justify-center gap-2 transition cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                    title={`${site.name} tablosundaki verileri Excel formatında indir`}
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-100" />
                    <span>EXCEL İNDİR</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      handleExportOdenecekTablePDF(site.name, rawRecords)
                    }
                    disabled={rawRecords.length === 0}
                    className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-bold text-xs border border-rose-400/50 shadow-md hover:shadow-rose-600/30 flex items-center justify-center gap-2 transition cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                    title={`${site.name} tablosundaki verileri PDF formatında aktar`}
                  >
                    <Download className="w-4 h-4 text-rose-100" />
                    <span>PDF AKTAR</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* TABLOLARIN EN ALTINDA: KONSOLİDE İŞLEMLER BÖLÜMÜ (EXCEL VE SUNUCUYA GÖNDERME) */}
      <div className="bg-gradient-to-r from-[#06241b] via-[#0b1e36] to-[#13112c] rounded-3xl p-6 sm:p-8 border-2 border-emerald-500/50 shadow-2xl text-white space-y-6">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold">
              <Layers className="w-4 h-4 text-emerald-400" />
              <span>7 ŞANTİYE KONSOLİDE ÖDEME İŞLEMLERİ</span>
            </div>
            <h2 className="text-xl sm:text-3xl font-black text-white uppercase tracking-tight">
              ÖDEME KONSOLİDASYON & SUNUCU İŞLEMLERİ
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              Tüm şantiyelerin ödenecek kayıtlarını tek seferde tek bir Excel sayfasında toplayabilir veya yapılan ödemeleri onaylayarak <strong className="text-white font-bold">doğrudan ilgili _odenenler tablolarına aktarabilirsiniz</strong>.
            </p>
          </div>

          {/* EYLEM BUTONLARI */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5">
            {/* 1. BÜTÜN ÖDEMELERİ EXCEL E AKTAR BUTONU */}
            <button
              id="btn-export-all-odenecek-single-excel"
              type="button"
              onClick={handleExportAllTablesToSingleExcel}
              disabled={totalAllOdenecekCount === 0}
              className="px-6 py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white font-black text-xs sm:text-sm tracking-wide border border-emerald-400/60 shadow-xl shadow-emerald-950/50 flex items-center justify-center gap-3 transition-all duration-200 cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed group"
              title="Tüm şantiyelerin ödenecek tablolarını tek bir Excel sayfasına ayrı tablolar olarak indir"
            >
              <FileSpreadsheet className="w-5 h-5 text-emerald-200 group-hover:scale-110 transition-transform" />
              <span className="uppercase">BÜTÜN ÖDEMELERİ EXCEL'E AKTAR</span>
              <span className="bg-emerald-950/80 text-emerald-200 px-2.5 py-1 rounded-full text-xs font-mono font-bold border border-emerald-400/40">
                {totalAllOdenecekCount}
              </span>
            </button>

            {/* 2. YAPILAN ÖDEMELERİ SERVERE GÖNDER BUTONU */}
            <button
              id="btn-send-all-payments-to-server"
              type="button"
              onClick={handleOpenServerSyncModal}
              disabled={totalAllOdenecekCount === 0}
              className="px-6 py-4 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-700 hover:from-blue-500 hover:via-indigo-500 hover:to-purple-600 text-white font-black text-xs sm:text-sm tracking-wide border-2 border-indigo-400/60 shadow-xl shadow-indigo-950/60 flex items-center justify-center gap-3 transition-all duration-200 cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed group"
              title="Tüm tablolardaki ödenecek verileri onay alarak ilgili _odenenler tablolarına aktarır"
            >
              <UploadCloud className="w-5 h-5 text-indigo-200 group-hover:scale-110 transition-transform" />
              <span className="uppercase">YAPILAN ÖDEMELERİ SERVERE GÖNDER</span>
              <span className="bg-indigo-950/90 text-indigo-200 px-2.5 py-1 rounded-full text-xs font-mono font-bold border border-indigo-400/40">
                {totalAllOdenecekCount} Kayıt
              </span>
            </button>
          </div>
        </div>

        {/* Konsolide Özet Bilgi Çubuğu */}
        <div className="pt-4 border-t border-slate-700/60 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex flex-wrap items-center gap-4 text-slate-300 font-semibold">
            <span className="flex items-center gap-1.5 text-emerald-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" /> 7 Şantiye Tablosu Dahil
            </span>
            <span className="flex items-center gap-1.5 text-blue-300">
              <Server className="w-4 h-4 text-blue-400" /> _odenecek ➔ _odenenler Otomatik Aktarım
            </span>
            <span className="flex items-center gap-1.5 text-amber-300">
              <AlertCircle className="w-4 h-4 text-amber-400" /> Boş Tablolar Otomatik Atlanır
            </span>
          </div>
          <div className="bg-slate-900/80 px-5 py-2.5 rounded-2xl border border-blue-500/40 text-right flex items-center gap-3">
            <span className="text-[11px] text-slate-400 font-bold uppercase">Toplam Konsolide Tutar:</span>
            <span className="font-mono font-black text-emerald-400 text-base sm:text-lg">
              {formatCurrency(totalAllOdenecekAmount)}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Return to Requests Button */}
      <div className="pt-4 pb-12 flex items-center justify-center">
        <button
          type="button"
          onClick={onBackToRequests}
          className="px-8 py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-500 hover:to-indigo-600 text-white font-black text-sm sm:text-base tracking-wide transition-all shadow-xl shadow-blue-600/30 flex items-center gap-3 border border-blue-400/50 cursor-pointer active:scale-95"
        >
          <ArrowLeft className="w-5 h-5 text-blue-200" />
          <span>TALEPLERE GERİ DÖN</span>
        </button>
      </div>

      {/* GERİ GÖNDER ONAY MODALI */}
      {returnModal.isOpen && returnModal.site && returnModal.record && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden text-slate-900 transform transition-all animate-scale-up">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-amber-600 via-amber-700 to-orange-700 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center text-white font-bold border border-white/30">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black uppercase tracking-tight">
                    KAYDI GERİ GÖNDERME ONAYI
                  </h3>
                  <p className="text-xs text-amber-100">
                    Ödenecek listesinden çıkarılıp talep tablosuna geri taşınacaktır.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeReturnModal}
                disabled={returnModal.loading}
                className="p-1.5 rounded-xl hover:bg-white/20 text-white/80 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 text-xs">
              <div className="p-3.5 bg-amber-50 rounded-2xl border border-amber-200 text-amber-900 leading-relaxed font-medium">
                Bu kaydı <strong className="font-mono text-amber-950 font-bold">{returnModal.site.tableName}</strong> tablosundan{' '}
                <strong className="font-mono text-blue-900 font-bold">{returnModal.site.talepTableName}</strong> tablosuna geri göndermek istediğinize emin misiniz?
              </div>

              {/* Record Summary Box */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2.5">
                <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                  <span className="text-slate-500 font-semibold">Şantiye / Birim:</span>
                  <span className="font-bold text-slate-800 text-sm">
                    {returnModal.site.name}
                  </span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                  <span className="text-slate-500 font-semibold">Firma Ünvanı:</span>
                  <span className="font-bold text-slate-900 text-sm">
                    {getFirmaUnvani(returnModal.record)}
                  </span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                  <span className="text-slate-500 font-semibold">Tutar:</span>
                  <span className="font-mono font-black text-emerald-700 text-sm">
                    {formatCurrency(getTutar(returnModal.record))}
                  </span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                  <span className="text-slate-500 font-semibold">İBAN No:</span>
                  <span className="font-mono font-semibold text-slate-700">
                    {getIban(returnModal.record)}
                  </span>
                </div>
                <div className="flex justify-between items-start pt-1">
                  <span className="text-slate-500 font-semibold flex-shrink-0 mr-2">Açıklama:</span>
                  <span className="text-slate-700 text-right leading-relaxed">
                    {getAciklama(returnModal.record)}
                  </span>
                </div>
              </div>

              {/* Source -> Target Path Indicator */}
              <div className="flex items-center justify-center gap-2 p-2.5 bg-blue-50/80 rounded-xl border border-blue-200 text-blue-900 font-mono text-[11px]">
                <span className="text-rose-700 font-bold">[{returnModal.site.tableName}]</span>
                <span className="text-blue-500 font-bold">➔</span>
                <span className="text-emerald-700 font-bold">[{returnModal.site.talepTableName}]</span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="bg-slate-100 px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeReturnModal}
                disabled={returnModal.loading}
                className="px-4 py-2 rounded-xl bg-white hover:bg-slate-200 text-slate-700 font-bold border border-slate-300 transition cursor-pointer text-xs"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleConfirmMoveBackToTalep}
                disabled={returnModal.loading}
                className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs border border-amber-400/50 shadow-md hover:shadow-amber-600/30 flex items-center gap-2 transition cursor-pointer active:scale-95 disabled:opacity-50"
              >
                {returnModal.loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                ) : (
                  <RotateCcw className="w-4 h-4 text-white" />
                )}
                <span>EVET, GERİ GÖNDER</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* YAPILAN ÖDEMELERİ SERVERE GÖNDER ONAY MODALI */}
      <ServerSyncModal
        isOpen={serverSyncModal.isOpen}
        onClose={handleCloseServerSyncModal}
        onConfirm={handleConfirmSendAllToOdenenlerServer}
        loading={serverSyncModal.loading}
        progressStep={serverSyncModal.progressStep}
        tablesData={tablesData}
        totalCount={totalAllOdenecekCount}
        totalAmount={totalAllOdenecekAmount}
      />

      {/* DÜZENLEME (GÜNCELLEME) MODALI */}
      <EditTalepModal
        isOpen={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setEditingRecord(null);
          setEditingSiteTable('');
        }}
        record={editingRecord}
        siteTableName={editingSiteTable}
        onSaved={handleEditSaved}
        showToast={showToast}
      />

      {/* SİLME ONAY MODALI */}
      <DeleteConfirmModal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setDeletingRecord(null);
          setDeletingSiteTable('');
        }}
        record={deletingRecord}
        tableName={deletingSiteTable}
        onConfirm={handleConfirmDelete}
        loading={deleteLoading}
      />

      {/* CARİ KONTROL MODAL */}
      <CariKontrolModal
        isOpen={cariModalOpen}
        record={cariRecord}
        allRecords={[]}
        cariRecords={
          cariRecord?._siteTable && SITE_CARI_BUCKET_MAP[cariRecord._siteTable]
            ? cariDataMap[SITE_CARI_BUCKET_MAP[cariRecord._siteTable]] || []
            : Object.values(cariDataMap).flat()
        }
        onClose={() => {
          setCariModalOpen(false);
          setCariRecord(null);
        }}
        showToast={showToast}
      />

      {/* FATURA & EVRAK GÖSTER MODAL */}
      {selectedFaturaRecord && (
        <FaturaGosterModal
          isOpen={!!selectedFaturaRecord}
          record={selectedFaturaRecord}
          initialFatura={selectedFaturaInfo}
          faturaList={selectedFaturaList}
          siteName={selectedFaturaRecord._siteTable}
          onClose={() => {
            setSelectedFaturaRecord(null);
            setSelectedFaturaInfo(null);
            setSelectedFaturaList([]);
          }}
        />
      )}

      {/* EVRAK YOK UYARI MODALI */}
      <EvrakYokModal
        isOpen={!!evrakYokFirma}
        firmaUnvani={evrakYokFirma || ''}
        onClose={() => setEvrakYokFirma(null)}
      />
    </div>
  );
};
