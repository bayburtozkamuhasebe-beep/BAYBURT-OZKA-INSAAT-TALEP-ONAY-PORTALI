import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { SITES, ODENECEK_SITES, SiteConfig, TalepRecord, PaymentStatus } from '../types';
import { supabase } from '../lib/supabase';
import {
  getFirmaUnvani,
  getIban,
  formatIbanDisplay,
  getTalepEden,
  getAciklama,
  getTutar,
  getTarih,
  getNotlar,
  getRecordStatus,
  formatCurrency,
  getCariBakiye,
  formatCariBakiyeDisplay,
  getCariBakiyeTextStyle,
  getCariBakiyeTitle,
  isCariBakiyeLowerThanTutar
} from '../lib/recordUtils';
import {
  ParsedCariRecord,
  CariFileMetadata,
  SITE_CARI_BUCKET_MAP,
  fetchCariFileFromBucket,
  matchCariStatus
} from '../lib/cariStorageService';
import {
  PlusCircle,
  RefreshCw,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Trash2,
  AlertCircle,
  AlertTriangle,
  Building,
  CreditCard,
  User,
  Calendar,
  Layers,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  AlignLeft,
  DollarSign,
  FileSpreadsheet,
  CheckCheck,
  Edit3,
  SearchCheck,
  FileDown,
  Download,
  CheckSquare,
  UploadCloud,
  TrendingDown,
  TrendingUp
} from 'lucide-react';
import { EditTalepModal } from './EditTalepModal';
import { CariKontrolModal } from './CariKontrolModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { MoveToPaymentConfirmModal } from './MoveToPaymentConfirmModal';
import { PaymentExecutionModal } from './PaymentExecutionModal';
import { ServerSyncModal } from './ServerSyncModal';
import { SiteBottomMuavinSection } from './SiteBottomMuavinSection';
import { FaturaGosterButton } from './FaturaGosterButton';
import { FaturaGosterModal } from './FaturaGosterModal';
import { EvrakYokModal } from './EvrakYokModal';
import { AddPaymentModal } from './AddPaymentModal';
import { FaturaInfo } from '../lib/faturaService';
import { executeServerSyncAllOdenecekToOdenenler } from '../lib/serverSyncService';
import { exportToExcel, exportToPDF } from '../lib/exportUtils';
import { resolveMuavinMapping } from '../lib/muavinService';
import { getMuavinCariRecordsForSite, MuavinCariRecord } from '../lib/muavinParserService';

interface SiteViewProps {
  site: SiteConfig;
  onRecordCountChange?: (count: number) => void;
  onNavigateToSite?: (site: SiteConfig) => void;
  onOpenPaymentExecutionPage?: () => void;
  onOpenMuavinPage?: (siteKey: string, record: TalepRecord | null) => void;
}

export const SiteView: React.FC<SiteViewProps> = ({
  site,
  onRecordCountChange,
  onNavigateToSite,
  onOpenPaymentExecutionPage,
  onOpenMuavinPage
}) => {
  const isAllMode = site.id === 'all';
  const [records, setRecords] = useState<TalepRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedIban, setCopiedIban] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  // Modal States
  const [editModalOpen, setEditModalOpen] = useState<boolean>(false);
  const [editingRecord, setEditingRecord] = useState<TalepRecord | null>(null);

  const [cariModalOpen, setCariModalOpen] = useState<boolean>(false);
  const [cariRecord, setCariRecord] = useState<TalepRecord | null>(null);

  const [deleteModalOpen, setDeleteModalOpen] = useState<boolean>(false);
  const [deletingRecord, setDeletingRecord] = useState<TalepRecord | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<boolean>(false);

  // Fatura & Evrak Modal States
  const [selectedFaturaRecord, setSelectedFaturaRecord] = useState<TalepRecord | null>(null);
  const [selectedFaturaInfo, setSelectedFaturaInfo] = useState<FaturaInfo | null>(null);
  const [selectedFaturaList, setSelectedFaturaList] = useState<FaturaInfo[]>([]);
  const [evrakYokFirma, setEvrakYokFirma] = useState<string | null>(null);

  // Yeni Ödeme Ekle Modal State
  const [addPaymentModalOpen, setAddPaymentModalOpen] = useState<boolean>(false);

  const handleOpenFatura = (rec: TalepRecord, info: FaturaInfo, list: FaturaInfo[] = []) => {
    setSelectedFaturaRecord(rec);
    setSelectedFaturaInfo(info);
    setSelectedFaturaList(list && list.length > 0 ? list : (info ? [info] : []));
  };

  const handleNoFatura = (firmaName: string) => {
    setEvrakYokFirma(firmaName);
  };

  const [actionLoadingId, setActionLoadingId] = useState<string | number | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => {
      setSuccessToast(null);
    }, 4000);
  };

  // Copy IBAN to clipboard helper
  const handleCopyIban = (iban: string, rowKey: string | number) => {
    if (!iban || iban === '-') return;
    const clean = iban.replace(/\s+/g, '');
    navigator.clipboard.writeText(clean);
    setCopiedIban(String(rowKey));
    showToast(`İBAN Kopyalandı: ${clean}`);
    setTimeout(() => {
      setCopiedIban(null);
    }, 2500);
  };

  const countChangeRef = React.useRef(onRecordCountChange);
  useEffect(() => {
    countChangeRef.current = onRecordCountChange;
  }, [onRecordCountChange]);

  // Fetch records directly and immediately
  const fetchRecords = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);

    try {
      if (isAllMode) {
        // Fetch from ALL 7 tables in parallel
        const allFetched: TalepRecord[] = [];
        await Promise.all(
          SITES.map(async (s) => {
            try {
              const { data, error } = await supabase
                .from(s.tableName)
                .select('*')
                .order('id', { ascending: false });

              if (!error && data) {
                data.forEach((row: any) => {
                  allFetched.push({
                    ...row,
                    _siteName: s.name,
                    _siteTable: s.tableName,
                    _siteId: s.id,
                    _siteBadge: s.badgeColor
                  });
                });
              }
            } catch (e) {
              console.warn(`Fetch error for ${s.tableName}:`, e);
            }
          })
        );

        // Sort all records descending
        allFetched.sort((a, b) => {
          if (a.created_at && b.created_at) {
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          }
          if (a.id !== undefined && b.id !== undefined) {
            return Number(b.id) - Number(a.id);
          }
          return 0;
        });

        setRecords(allFetched);
        if (countChangeRef.current) countChangeRef.current(allFetched.length);
      } else {
        // Fetch single site table
        const { data, error } = await supabase
          .from(site.tableName)
          .select('*')
          .order('id', { ascending: false });

        if (error) {
          console.warn(`Supabase notice for table ${site.tableName}:`, error.message);
          // Fallback simple query
          const fallback = await supabase.from(site.tableName).select('*');
          if (fallback.data) {
            const rows = (fallback.data as TalepRecord[]).map((row) => ({
              ...row,
              _siteName: site.name,
              _siteTable: site.tableName,
              _siteId: site.id,
              _siteBadge: site.badgeColor
            }));
            setRecords(rows);
            if (countChangeRef.current) countChangeRef.current(rows.length);
          }
        } else {
          const rows = ((data as TalepRecord[]) || []).map((row) => ({
            ...row,
            _siteName: site.name,
            _siteTable: site.tableName,
            _siteId: site.id,
            _siteBadge: site.badgeColor
          }));

          rows.sort((a, b) => {
            if (a.created_at && b.created_at) {
              return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            }
            if (a.id !== undefined && b.id !== undefined) {
              return Number(b.id) - Number(a.id);
            }
            return 0;
          });

          setRecords(rows);
          if (countChangeRef.current) countChangeRef.current(rows.length);
        }
      }
    } catch (err: any) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAllMode, site.tableName, site.name, site.id, site.badgeColor]);

  // Initial load and background live refresh (every 4s)
  useEffect(() => {
    fetchRecords(false);

    const intervalId = setInterval(() => {
      fetchRecords(false);
    }, 4000);

    return () => clearInterval(intervalId);
  }, [fetchRecords]);

  // Update payment status (ÖDENSİN / ÖDENMESİN / BEKLESİN)
  const handleUpdateStatus = async (record: TalepRecord, newStatus: PaymentStatus) => {
    const recordId = record.id;
    if (recordId === undefined) return;

    const targetTable = record._siteTable || site.tableName;
    setActionLoadingId(recordId);

    // Optimistic local update for instant UI feedback
    setRecords((prev) =>
      prev.map((r) =>
        r.id === recordId && (!record._siteTable || r._siteTable === record._siteTable)
          ? { ...r, durum: newStatus, odeme_durumu: newStatus }
          : r
      )
    );

    try {
      const { error } = await supabase
        .from(targetTable)
        .update({
          durum: newStatus,
          odeme_durumu: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', recordId);

      if (error) {
        const retryDurum = await supabase
          .from(targetTable)
          .update({ durum: newStatus })
          .eq('id', recordId);

        if (retryDurum.error) {
          const retryOdeme = await supabase
            .from(targetTable)
            .update({ odeme_durumu: newStatus })
            .eq('id', recordId);

          if (retryOdeme.error) {
            throw retryOdeme.error;
          }
        }
      }

      const statusLabels: Record<string, string> = {
        ÖDENSİN: 'ÖDENSİN olarak onaylandı ve kaydedildi',
        ÖDENMESİN: 'ÖDENMESİN olarak reddedildi',
        BEKLESİN: 'BEKLESİN durumuna alındı ve güncellendi'
      };

      showToast(`Talep durumu "${statusLabels[newStatus] || newStatus}" yapıldı.`);
      fetchRecords(false);
    } catch (err: any) {
      console.error('Status update error:', err);
      showToast(`Durum güncellenirken hata oluştu: ${err.message || 'Bilinmeyen hata'}`);
      fetchRecords(true);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (record: TalepRecord) => {
    setEditingRecord(record);
    setEditModalOpen(true);
  };

  // Open Cari / Muavin Kontrol (Yeni Koyu Mavi Sayfa)
  const handleOpenCari = (record: TalepRecord) => {
    if (onOpenMuavinPage) {
      const mapping = resolveMuavinMapping(site.id, record);
      onOpenMuavinPage(mapping.siteKey, record);
    } else {
      setCariRecord(record);
      setCariModalOpen(true);
    }
  };

  // Open Delete Confirmation Modal (Warning before deletion)
  const handleOpenDelete = (record: TalepRecord) => {
    setDeletingRecord(record);
    setDeleteModalOpen(true);
  };

  // Execute Confirmed Delete
  const handleConfirmDelete = async () => {
    if (!deletingRecord || deletingRecord.id === undefined) return;
    const recordId = deletingRecord.id;
    const targetTable = deletingRecord._siteTable || site.tableName;
    setDeleteLoading(true);

    try {
      const { error } = await supabase
        .from(targetTable)
        .delete()
        .eq('id', recordId);

      if (error) throw error;

      setRecords((prev) =>
        prev.filter((r) => !(r.id === recordId && (!deletingRecord._siteTable || r._siteTable === deletingRecord._siteTable)))
      );
      showToast('Kayıt başarıyla silindi.');
      setDeleteModalOpen(false);
      setDeletingRecord(null);
    } catch (err: any) {
      console.error('Delete error:', err);
      showToast(`Silinirken hata oluştu: ${err.message || ''}`);
    } finally {
      setDeleteLoading(false);
    }
  };

  // Status sorting priority: 1. ÖDENSİN, 2. BEKLESİN, 3. ÖDENMESİN
  const STATUS_PRIORITY_ORDER: Record<string, number> = {
    'ÖDENSİN': 1,
    'BEKLESİN': 2,
    'ÖDENMESİN': 3,
  };

  const getStatusOrder = (status: string): number => {
    return STATUS_PRIORITY_ORDER[status] ?? 4;
  };

  // Filtering & Sorting (ÖDENSİN -> BEKLESİN -> ÖDENMESİN)
  const filteredRecords = records
    .filter((r) => {
      const currentStatus = getRecordStatus(r);
      if (statusFilter !== 'ALL' && currentStatus !== statusFilter) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const firma = getFirmaUnvani(r).toLowerCase();
        const iban = getIban(r).toLowerCase();
        const talepEden = getTalepEden(r).toLowerCase();
        const aciklama = getAciklama(r).toLowerCase();
        const notlar = getNotlar(r).toLowerCase();
        const siteName = (r._siteName || '').toLowerCase();
        const tutar = String(getTutar(r));

        return (
          firma.includes(q) ||
          iban.includes(q) ||
          talepEden.includes(q) ||
          aciklama.includes(q) ||
          notlar.includes(q) ||
          siteName.includes(q) ||
          tutar.includes(q) ||
          currentStatus.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      const pA = getStatusOrder(getRecordStatus(a));
      const pB = getStatusOrder(getRecordStatus(b));
      if (pA !== pB) {
        return pA - pB;
      }
      // If same status, sort by id descending (newest first)
      const idA = typeof a.id === 'number' ? a.id : parseInt(String(a.id), 10) || 0;
      const idB = typeof b.id === 'number' ? b.id : parseInt(String(b.id), 10) || 0;
      return idB - idA;
    });

  // Calculate stats
  const totalCount = records.length;
  const countOdensin = records.filter((r) => getRecordStatus(r) === 'ÖDENSİN').length;
  const countOdenmesin = records.filter((r) => getRecordStatus(r) === 'ÖDENMESİN').length;
  const countBeklesin = records.filter((r) => getRecordStatus(r) === 'BEKLESİN').length;

  const totalTutar = records.reduce((acc, r) => acc + getTutar(r), 0);
  const odenecekTutar = records
    .filter((r) => getRecordStatus(r) === 'ÖDENSİN')
    .reduce((acc, r) => acc + getTutar(r), 0);
  const bekleyenTutar = records
    .filter((r) => getRecordStatus(r) === 'BEKLESİN')
    .reduce((acc, r) => acc + getTutar(r), 0);
  const odenmeyenTutar = records
    .filter((r) => getRecordStatus(r) === 'ÖDENMESİN')
    .reduce((acc, r) => acc + getTutar(r), 0);

  // Unique row key helper
  const getRecordKey = (r: TalepRecord): string => {
    return `${r._siteTable || site.tableName}-${r.id}`;
  };

  // Toggle selection for all filtered records
  const handleToggleSelectAll = () => {
    if (filteredRecords.length === 0) return;
    if (selectedKeys.length === filteredRecords.length) {
      setSelectedKeys([]);
    } else {
      setSelectedKeys(filteredRecords.map(getRecordKey));
    }
  };

  // Toggle selection for a single record
  const handleToggleSelect = (key: string) => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  // Clear selection
  const handleClearSelection = () => {
    setSelectedKeys([]);
  };

  // Export to Excel (All or Selected, or status-specific)
  const handleExportToExcel = (statusOnly?: 'ÖDENSİN' | 'BEKLESİN' | 'ÖDENMESİN') => {
    let targetList: TalepRecord[] = [];

    if (statusOnly) {
      // Direct status export
      targetList = records.filter((r) => getRecordStatus(r) === statusOnly);
      if (targetList.length === 0) {
        showToast(`Tabloda "${statusOnly}" durumunda kayıt bulunamadı.`);
        return;
      }
    } else {
      // General export: if checkboxes are selected, export selected records; otherwise all filtered
      if (selectedKeys.length > 0) {
        targetList = records.filter((r) => selectedKeys.includes(getRecordKey(r)));
      } else {
        targetList = filteredRecords;
      }
    }

    if (targetList.length === 0) {
      showToast('Dışa aktarılacak kayıt bulunamadı.');
      return;
    }

    const prefix = isAllMode ? 'Tum_Santiyeler_Talep_Listesi' : `${site.name}_Talep_Listesi`;
    const res = exportToExcel(targetList, prefix, statusOnly);
    if (res.success) {
      showToast(res.message);
    } else {
      showToast(res.message);
    }
  };

  // Export to PDF (All or Selected)
  const handleExportToPDF = () => {
    let targetList: TalepRecord[] = [];
    if (selectedKeys.length > 0) {
      targetList = records.filter((r) => selectedKeys.includes(getRecordKey(r)));
    } else {
      targetList = filteredRecords;
    }

    if (targetList.length === 0) {
      showToast('Dışa aktarılacak kayıt bulunamadı.');
      return;
    }

    const prefix = isAllMode ? 'Tum_Santiyeler_Talep_Listesi' : `${site.name}_Talep_Listesi`;
    const title = isAllMode ? 'TÜM ŞANTİYELER — ÖDEME VE TALEP LİSTESİ' : `${site.name.toUpperCase()} — ÖDEME VE TALEP LİSTESİ`;
    const res = exportToPDF(targetList, title, prefix);
    if (res.success) {
      showToast(res.message);
    }
  };

  // Ödeme Listesine Taşıma Onay Modalı State'leri
  const [moveModalOpen, setMoveModalOpen] = useState<boolean>(false);
  const [moveModalRecords, setMoveModalRecords] = useState<TalepRecord[]>([]);
  const [moveLoading, setMoveLoading] = useState<boolean>(false);

  // Ödeme Yap Modalı State'leri
  const [payModalOpen, setPayModalOpen] = useState<boolean>(false);
  const [payModalRecords, setPayModalRecords] = useState<TalepRecord[]>([]);
  const [payLoading, setPayLoading] = useState<boolean>(false);

  // YAPILAN ÖDEMELERİ SERVERE GÖNDER State'leri
  const [serverSyncOpen, setServerSyncOpen] = useState<boolean>(false);
  const [serverSyncLoading, setServerSyncLoading] = useState<boolean>(false);
  const [serverSyncStep, setServerSyncStep] = useState<string>('');
  const [odenecekTablesMap, setOdenecekTablesMap] = useState<Record<string, { records: TalepRecord[] }>>({});
  const [totalOdenecekCount, setTotalOdenecekCount] = useState<number>(0);
  const [totalOdenecekAmount, setTotalOdenecekAmount] = useState<number>(0);

  // SUPABASE STORAGE CARİ TABLOSU & ANALİZİ STATE'LERİ
  const [cariRecords, setCariRecords] = useState<ParsedCariRecord[]>([]);
  const [siteMuavinRecordsMap, setSiteMuavinRecordsMap] = useState<Record<string, MuavinCariRecord[]>>({});
  const [cariMetadata, setCariMetadata] = useState<CariFileMetadata | null>(null);
  const [cariLoading, setCariLoading] = useState<boolean>(false);
  const [cariError, setCariError] = useState<string | null>(null);

  // Aktif şantiyeye göre ilgili Storage Bucket Adı (örn: ARNAVUTKOYCARILER, MAMAKCARILER, BURSACARILER, MERKEZOZKACARILER)
  const currentCariBucketName = SITE_CARI_BUCKET_MAP[site.id] || 'ARNAVUTKOYCARILER';

  // Şantiye değiştiğinde veya sayfa açıldığında Muavin Defterinden cari bakiyelerini otomatik çek
  const loadCariData = useCallback(async () => {
    setCariLoading(true);
    setCariError(null);
    try {
      if (isAllMode) {
        // Tüm şantiyelerin muavin defterlerini yükle
        const allSites = ['arnavutkoy', 'mamak', 'senbay_ozka', 'merkez_ozka', 'msb_ozka', 'seka'];
        const map: Record<string, MuavinCariRecord[]> = {};
        let combined: MuavinCariRecord[] = [];
        for (const sId of allSites) {
          const recs = await getMuavinCariRecordsForSite(sId);
          map[sId] = recs;
          combined = combined.concat(recs);
        }
        setSiteMuavinRecordsMap(map);
        setCariRecords(combined);
        setCariMetadata({
          name: 'TÜM ŞANTİYELER MUAVİN DEFTERLERİ (PDF)',
          bucket: 'MUAVINLER',
          recordCount: combined.length,
          updated_at: new Date().toISOString()
        });
      } else {
        // Aktif şantiyenin muavin defterini yükle
        const muavinRecs = await getMuavinCariRecordsForSite(site.id);
        if (muavinRecs && muavinRecs.length > 0) {
          setCariRecords(muavinRecs);
          setSiteMuavinRecordsMap(prev => ({ ...prev, [site.id]: muavinRecs }));
          setCariMetadata({
            name: `${site.name} MUAVİN DEFTERİ (PDF)`,
            bucket: 'MUAVINLER',
            recordCount: muavinRecs.length,
            updated_at: new Date().toISOString()
          });
        } else {
          // Yedek: XLSX bucket kontrolü
          const res = await fetchCariFileFromBucket(currentCariBucketName);
          setCariRecords(res.records);
          setCariMetadata(res.metadata);
          setCariError(res.error);
        }
      }
    } catch (e: any) {
      console.warn('Muavin verisi yüklenirken hata:', e);
      try {
        const res = await fetchCariFileFromBucket(currentCariBucketName);
        setCariRecords(res.records);
        setCariMetadata(res.metadata);
      } catch (errFallback) {
        setCariError(e.message || 'Muavin/Cari dosyası yüklenirken bir hata oluştu.');
      }
    } finally {
      setCariLoading(false);
    }
  }, [currentCariBucketName, isAllMode, site.id, site.name]);

  useEffect(() => {
    loadCariData();
  }, [loadCariData]);

  // Manuel Excel Yükleme Tetiklendiğinde State Güncelle
  const handleManualCariUpload = (records: ParsedCariRecord[], fileName: string) => {
    setCariRecords(records);
    setCariMetadata({
      name: fileName,
      bucket: currentCariBucketName,
      recordCount: records.length,
      updated_at: new Date().toISOString()
    });
    setCariError(null);
    showToast(`${records.length} adet cari kaydı başarıyla yüklendi ve firma ünvanları analiz edildi.`);
  };

  // Ödeme Listesine Taşıma Butonuna Tıklandığında Onay Uyarısını Aç
  const handleOpenMoveModal = () => {
    let targetRecords: TalepRecord[] = [];

    if (selectedKeys.length > 0) {
      // Seçilmiş olan kayıtları al
      targetRecords = records.filter((r) => selectedKeys.includes(getRecordKey(r)));
    } else {
      // Seçim yoksa, önce durumu 'ÖDENSİN' olanları al
      const odensinRecords = records.filter((r) => getRecordStatus(r) === 'ÖDENSİN');
      if (odensinRecords.length > 0) {
        targetRecords = odensinRecords;
      } else if (filteredRecords.length > 0) {
        // Eğer tabloda henüz ÖDENSİN işaretli kayıt yoksa, tablodaki mevcut tüm kayıtları taşıma adayına al
        targetRecords = filteredRecords;
      }
    }

    if (targetRecords.length === 0) {
      showToast('Listede ödenecekler listesine taşınacak talep bulunamadı.');
      return;
    }

    setMoveModalRecords(targetRecords);
    setMoveModalOpen(true);
  };

  // Onaylandıktan Sonra _talep Tablosundan _odenecek Tablosuna Taşıma İşlemi
  const handleConfirmMoveToPayment = async () => {
    if (moveModalRecords.length === 0) return;

    setMoveLoading(true);
    try {
      // Kaynak tablolara göre grupla (örn: arnavutkoy_talep, mamak_talep vb.)
      const bySourceTable: Record<string, TalepRecord[]> = {};
      moveModalRecords.forEach((r) => {
        const srcTable = r._siteTable || site.tableName;
        if (!bySourceTable[srcTable]) bySourceTable[srcTable] = [];
        bySourceTable[srcTable].push(r);
      });

      let totalMovedCount = 0;
      const targetTableNames: string[] = [];

      for (const [sourceTable, items] of Object.entries(bySourceTable)) {
        if (items.length === 0) continue;

        // Hedef tablo adı: <prefix>_talep -> <prefix>_odenecek
        const targetTable = sourceTable.endsWith('_talep')
          ? sourceTable.replace(/_talep$/, '_odenecek')
          : `${sourceTable}_odenecek`;

        if (!targetTableNames.includes(targetTable)) {
          targetTableNames.push(targetTable);
        }

        // Aktarım yapılacak verileri Supabase şemasına tam uyumlu hazırla
        const payloads = items.map((item) => {
          const firma = getFirmaUnvani(item);
          const ibanVal = getIban(item);
          const aciklamaVal = getAciklama(item);
          const tutarVal = getTutar(item);
          const talepEdenVal = getTalepEden(item);

          return {
            firma_unvani: firma !== '-' ? firma : (item.firma_unvani || ''),
            iban_no: ibanVal || item.iban_no || item.iban || '',
            aciklama: aciklamaVal !== '-' ? aciklamaVal : (item.aciklama || ''),
            tutar: tutarVal || 0,
            talep_eden: talepEdenVal !== '-' ? talepEdenVal : (item.talep_eden || ''),
            durum: 'ÖDENSİN'
          };
        });

        // 1. ADIM: Hedef _odenecek tablosuna ekle
        const { error: insertError } = await supabase.from(targetTable).insert(payloads);

        if (insertError) {
          console.error(`Insert into ${targetTable} error:`, insertError);
          throw new Error(`${targetTable} tablosuna eklenemedi: ${insertError.message}`);
        }

        // 2. ADIM: Kaynak _talep tablosundan sil (Taşıma mantığı)
        const idsToDelete = items
          .map((i) => i.id)
          .filter((id) => id !== undefined && id !== null);

        if (idsToDelete.length > 0) {
          const { error: deleteError } = await supabase
            .from(sourceTable)
            .delete()
            .in('id', idsToDelete);

          if (deleteError) {
            console.warn(`${sourceTable} tablosundan silinirken uyarı:`, deleteError);
          }
        }

        totalMovedCount += items.length;
      }

      // Lokal state'ten taşınan kayıtları çıkar
      const movedKeys = moveModalRecords.map(getRecordKey);
      setRecords((prev) => prev.filter((r) => !movedKeys.includes(getRecordKey(r))));
      setSelectedKeys((prev) => prev.filter((k) => !movedKeys.includes(k)));

      // Modalı kapat ve başarı bildirimi ver
      setMoveModalOpen(false);
      setMoveModalRecords([]);
      showToast(`${totalMovedCount} adet talep başarıyla ${targetTableNames.join(', ')} tablosuna taşındı.`);

      // Listeyi yenile
      fetchRecords(false);
    } catch (err: any) {
      console.error('Move to payment error:', err);
      showToast(`Ödeme listesine taşınırken hata oluştu: ${err.message || 'Bilinmeyen hata'}`);
      fetchRecords(true);
    } finally {
      setMoveLoading(false);
    }
  };

  // Ödeme Yap Butonuna Tıklandığında Modal Aç
  const handleOpenPayModal = () => {
    let targetRecords: TalepRecord[] = [];

    if (selectedKeys.length > 0) {
      targetRecords = records.filter((r) => selectedKeys.includes(getRecordKey(r)));
    } else {
      const odensinRecords = records.filter((r) => getRecordStatus(r) === 'ÖDENSİN');
      if (odensinRecords.length > 0) {
        targetRecords = odensinRecords;
      } else if (filteredRecords.length > 0) {
        targetRecords = filteredRecords;
      }
    }

    if (targetRecords.length === 0) {
      showToast('Ödeme yapılacak talep kaydı bulunamadı.');
      return;
    }

    setPayModalRecords(targetRecords);
    setPayModalOpen(true);
  };

  // Ödeme İşlemini Onayla & Veritabanına 'ÖDENDİ' Olarak Kaydet
  const handleConfirmPayment = async (details: {
    paymentMethod: string;
    paymentDate: string;
    note: string;
  }) => {
    if (payModalRecords.length === 0) return;
    setPayLoading(true);

    try {
      // Tablolarına göre grupla
      const byTable: Record<string, (string | number)[]> = {};
      payModalRecords.forEach((r) => {
        if (r.id !== undefined && r.id !== null) {
          const tbl = r._siteTable || site.tableName;
          if (!byTable[tbl]) byTable[tbl] = [];
          byTable[tbl].push(r.id);
        }
      });

      for (const [tbl, ids] of Object.entries(byTable)) {
        if (ids.length === 0) continue;
        const { error } = await supabase
          .from(tbl)
          .update({
            durum: 'ÖDENDİ',
            odeme_durumu: 'ÖDENDİ'
          })
          .in('id', ids);

        if (error) {
          const r1 = await supabase.from(tbl).update({ durum: 'ÖDENDİ' }).in('id', ids);
          if (r1.error) {
            await supabase.from(tbl).update({ odeme_durumu: 'ÖDENDİ' }).in('id', ids);
          }
        }
      }

      // Lokal state'i güncelle
      const paidKeys = payModalRecords.map(getRecordKey);
      setRecords((prev) =>
        prev.map((r) => {
          if (paidKeys.includes(getRecordKey(r))) {
            return {
              ...r,
              durum: 'ÖDENDİ',
              odeme_durumu: 'ÖDENDİ'
            };
          }
          return r;
        })
      );

      setSelectedKeys((prev) => prev.filter((k) => !paidKeys.includes(k)));
      setPayModalOpen(false);
      setPayModalRecords([]);
      showToast(
        `${payModalRecords.length} adet talebin ödemesi (${details.paymentMethod}) başarıyla tamamlandı (ÖDENDİ).`
      );
      fetchRecords(false);
    } catch (err: any) {
      console.error('Payment execution error:', err);
      showToast(`Ödeme işlemi işlenirken hata oluştu: ${err.message || 'Bilinmeyen hata'}`);
      fetchRecords(true);
    } finally {
      setPayLoading(false);
    }
  };

  // 7 Şantiyenin _odenecek verilerini çekip Sunucuya Gönder onay modalını aç
  const handleOpenServerSyncModal = async () => {
    setServerSyncLoading(true);
    setServerSyncStep('7 Şantiye ödenecek tabloları kontrol ediliyor...');
    try {
      const map: Record<string, { records: TalepRecord[] }> = {};
      let totalCount = 0;
      let totalAmount = 0;

      await Promise.all(
        ODENECEK_SITES.map(async (s) => {
          try {
            const { data, error } = await supabase
              .from(s.tableName)
              .select('*')
              .order('id', { ascending: true });

            const recs = !error && data ? data : [];
            map[s.tableName] = { records: recs };
            totalCount += recs.length;
            totalAmount += recs.reduce((sum, r) => sum + getTutar(r), 0);
          } catch (e) {
            console.warn(`Fetch error for ${s.tableName}:`, e);
            map[s.tableName] = { records: [] };
          }
        })
      );

      setOdenecekTablesMap(map);
      setTotalOdenecekCount(totalCount);
      setTotalOdenecekAmount(totalAmount);
      setServerSyncOpen(true);
    } catch (err: any) {
      showToast(`Tablolar kontrol edilirken hata: ${err.message}`);
    } finally {
      setServerSyncLoading(false);
      setServerSyncStep('');
    }
  };

  // Sunucuya aktarımı onayla ve çalıştır
  const handleConfirmServerSync = async () => {
    setServerSyncLoading(true);
    try {
      const preloadedMap: Record<string, TalepRecord[]> = {};
      Object.entries(odenecekTablesMap).forEach(([tbl, val]) => {
        preloadedMap[tbl] = (val as { records: TalepRecord[] })?.records || [];
      });

      const res = await executeServerSyncAllOdenecekToOdenenler(
        (step) => setServerSyncStep(step),
        preloadedMap
      );

      if (!res.success) {
        showToast(res.message);
        return;
      }

      setServerSyncOpen(false);
      showToast(res.message);
      fetchRecords(false);
    } catch (err: any) {
      showToast(`Aktarım hatası: ${err.message}`);
    } finally {
      setServerSyncLoading(false);
      setServerSyncStep('');
    }
  };

  return (
    <div className="w-full max-w-[98%] xl:max-w-[1780px] 2xl:max-w-[1900px] mx-auto px-2 sm:px-4 lg:px-6 py-5 space-y-6">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 border border-slate-700 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <span className="text-sm font-semibold">{successToast}</span>
        </div>
      )}

      {/* TOP STATS SUMMARY FOR CURRENT SITE / ALL SITES */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
            <span>{isAllMode ? 'GENEL TOPLAM' : `${site.name} TOPLAM`}</span>
            <Layers className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-slate-900">{totalCount}</span>
            <span className="text-xs text-slate-500 font-medium">talep</span>
          </div>
          <div className="text-xs text-slate-600 mt-1 font-mono font-bold">
            Toplam: {formatCurrency(totalTutar)}
          </div>
        </div>

        <div className="bg-emerald-50/90 border border-emerald-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center justify-between">
            <span>ÖDENSİN (ONAYLI)</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-emerald-700">{countOdensin}</span>
            <span className="text-xs text-emerald-600 font-medium">adet</span>
          </div>
          <div className="text-xs text-emerald-800 mt-1 font-mono font-bold">
            {formatCurrency(odenecekTutar)}
          </div>
        </div>

        <div className="bg-amber-50/90 border border-amber-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center justify-between">
            <span>BEKLESİN (BEKLEYEN)</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-amber-700">{countBeklesin}</span>
            <span className="text-xs text-amber-600 font-medium">adet</span>
          </div>
          <div className="text-xs text-amber-800 mt-1 font-mono font-bold">
            {formatCurrency(bekleyenTutar)}
          </div>
        </div>

        <div className="bg-rose-50/90 border border-rose-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-bold text-rose-800 uppercase tracking-wider flex items-center justify-between">
            <span>ÖDENMESİN (RED)</span>
            <XCircle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-rose-700">{countOdenmesin}</span>
            <span className="text-xs text-rose-600 font-medium">adet</span>
          </div>
          <div className="text-xs text-rose-800 mt-1 font-mono font-bold">
            {formatCurrency(odenmeyenTutar)}
          </div>
        </div>
      </div>

      {/* FILTER & SEARCH BAR (TABLONUN ÜSTÜNDE - KOYU MAVİ TASARIM) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-md text-slate-100">
        {/* Status Filter Buttons (TÜMÜ, ÖDENSİN, BEKLESİN, ÖDENMESİN) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              statusFilter === 'ALL'
                ? 'bg-blue-600 text-white shadow-md border border-blue-400 font-black'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700'
            }`}
          >
            <span>TÜMÜ</span>
            <span className="text-[11px] bg-slate-950/60 text-slate-200 px-1.5 py-0.2 rounded-full font-mono font-bold border border-slate-700/50">{totalCount}</span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('ÖDENSİN')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              statusFilter === 'ÖDENSİN'
                ? 'bg-emerald-600 text-white shadow-md border border-emerald-400 font-black'
                : 'bg-emerald-950/60 text-emerald-300 hover:bg-emerald-900/80 border border-emerald-800/80'
            }`}
          >
            <span>ÖDENSİN</span>
            <span className="text-[11px] bg-emerald-900/80 text-emerald-200 px-1.5 py-0.2 rounded-full font-mono font-bold border border-emerald-700/50">{countOdensin}</span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('BEKLESİN')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              statusFilter === 'BEKLESİN'
                ? 'bg-amber-500 text-slate-950 shadow-md font-black border border-amber-300'
                : 'bg-amber-950/60 text-amber-300 hover:bg-amber-900/80 border border-amber-800/80'
            }`}
          >
            <span>BEKLESİN</span>
            <span className="text-[11px] bg-amber-900/80 text-amber-200 px-1.5 py-0.2 rounded-full font-mono font-bold border border-amber-700/50">{countBeklesin}</span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('ÖDENMESİN')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              statusFilter === 'ÖDENMESİN'
                ? 'bg-rose-600 text-white shadow-md border border-rose-400 font-black'
                : 'bg-rose-950/60 text-rose-300 hover:bg-rose-900/80 border border-rose-800/80'
            }`}
          >
            <span>ÖDENMESİN</span>
            <span className="text-[11px] bg-rose-900/80 text-rose-200 px-1.5 py-0.2 rounded-full font-mono font-bold border border-rose-700/50">{countOdenmesin}</span>
          </button>
        </div>

        {/* Search Bar & Immediate Refresh Button */}
        <div className="flex items-center gap-2 flex-1 sm:max-w-md">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Ara: Firma, İBAN, Açıklama, Talep Eden, Tutar..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 focus:border-blue-500 focus:bg-slate-900 rounded-xl pl-10 pr-3.5 py-2 text-xs sm:text-sm text-white placeholder-slate-400 outline-none transition"
            />
          </div>
          <button
            type="button"
            onClick={() => fetchRecords(true)}
            disabled={refreshing}
            className="px-3.5 py-2 bg-blue-900/60 hover:bg-blue-600 text-blue-200 hover:text-white rounded-xl border border-blue-700/80 hover:border-blue-500 transition flex items-center gap-1.5 text-xs font-bold shadow-sm cursor-pointer"
            title="Tabloyu Hemen Güncelle"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-300' : ''}`} />
            <span className="hidden sm:inline">Yenile</span>
          </button>
        </div>
      </div>

      {/* ERROR BANNER */}
      {errorMsg && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-center gap-3 text-rose-800 text-sm shadow-sm">
          <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
          <div className="flex-1">
            <span className="font-semibold">{errorMsg}</span>
          </div>
          <button
            onClick={() => fetchRecords(true)}
            className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold"
          >
            Tekrar Dene
          </button>
        </div>
      )}

      {/* 1. TALEP VE ÖDEME TABLOSU (EN ÜSTTE - TAM BEYAZ TASARIM) */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-md overflow-hidden text-slate-800">
        {/* Table Header Info (BEYAZ TEMA) */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 uppercase tracking-wide flex items-center gap-2">
                <span>{site.name} — TALEP & ÖDEME TABLOSU</span>
              </h3>
              <p className="text-xs text-slate-500">
                {isAllMode ? (
                  <span>Tüm şantiye tablolarından canlı konsolide veriler listeleniyor</span>
                ) : (
                  <span>
                    Canlı Tablo: <strong className="font-mono text-blue-600 font-bold">{site.tableName}</strong>
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
            <span className="text-xs bg-blue-100 text-blue-800 px-3 py-1.5 rounded-lg border border-blue-200 font-mono font-bold">
              {filteredRecords.length} / {totalCount} Kayıt
            </span>
            {/* ÖDEME EKLE BUTONU (KAYIT SAYISI ROZETİNİN HEMEN YANINDA - BELİRGİN VE ÖZEL RENK) */}
            <button
              type="button"
              onClick={() => setAddPaymentModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 hover:from-violet-500 hover:via-indigo-500 hover:to-purple-500 active:scale-95 text-white rounded-lg text-xs font-black shadow-md shadow-indigo-500/30 hover:shadow-lg hover:shadow-indigo-500/40 border border-indigo-300/40 ring-2 ring-indigo-400/25 transition-all duration-150 cursor-pointer tracking-wide"
              title={`${site.name} tablosuna yeni ödeme kaydı ekle`}
            >
              <PlusCircle className="w-4 h-4 text-indigo-100 stroke-[2.5]" />
              <span className="drop-shadow-xs">Ödeme Ekle</span>
            </button>
            <div className="text-xs text-slate-700 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs">
              Toplam: <strong className="text-emerald-700 font-mono text-sm ml-1">{formatCurrency(totalTutar)}</strong>
            </div>
          </div>
        </div>

        {loading && records.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-600 bg-white">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
            <p className="text-sm font-semibold">Veriler Supabase veritabanından getiriliyor...</p>
          </div>
        ) : (
          <div className="overflow-x-auto bg-white border border-slate-300 rounded-xl">
            <table className="w-full text-left border-collapse border border-slate-300">
              <thead>
                <tr className="bg-slate-100 text-xs uppercase tracking-wider text-slate-800 border-b-2 border-slate-300">
                  {/* TİK KUTUCUĞU BAŞLIK (TÜMÜNÜ SEÇ) */}
                  <th className="py-3.5 px-3.5 w-12 text-center border-r border-slate-300">
                    <input
                      type="checkbox"
                      checked={filteredRecords.length > 0 && selectedKeys.length === filteredRecords.length}
                      onChange={handleToggleSelectAll}
                      className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer accent-blue-600"
                      title="Tümünü Seç / Seçimi Kaldır"
                    />
                  </th>
                  {isAllMode && <th className="py-3.5 px-4 font-black min-w-[140px] border-r border-slate-300">ŞANTİYE</th>}
                  <th className="py-3.5 px-4 font-black min-w-[220px] border-r border-slate-300">1. FİRMA ÜNVANI</th>
                  <th className="py-3.5 px-2.5 font-black w-[150px] min-w-[135px] max-w-[160px] border-r border-slate-300">2. İBAN NO</th>
                  <th className="py-3.5 px-3 font-black w-[175px] min-w-[150px] max-w-[195px] border-r border-slate-300">3. AÇIKLAMA</th>
                  <th className="py-3.5 px-4 font-black min-w-[160px] text-right border-r border-slate-300">4. ÖDENECEK TUTAR</th>
                  <th className="py-3.5 px-4 font-black min-w-[160px] text-right border-r border-slate-300 bg-slate-200/60 text-slate-800 tracking-wide shadow-2xs">
                    <div className="flex flex-col items-end">
                      <span>CARİ BAKİYE</span>
                      <span className="text-[9px] font-bold text-slate-500 tracking-normal normal-case">≥ Tutar: Yeşil • &lt; Tutar: Kırmızı (Yanıp Sönen)</span>
                    </div>
                  </th>
                  <th className="py-3.5 px-2.5 font-black w-[110px] min-w-[100px] max-w-[125px] border-r border-slate-300">5. TALEP EDEN</th>
                  <th className="py-3.5 px-4 font-black text-center w-36 border-r border-slate-300">6. DURUM</th>
                  <th className="py-3.5 px-5 font-black text-center min-w-[340px]">
                    Ödeme & Talep İşlemleri
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-300 text-sm bg-white">
                {/* VERİ YOK İSE TABLONUN İÇİNDE UYARI */}
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td
                      colSpan={isAllMode ? 10 : 9}
                      className="py-14 px-6 text-center bg-slate-50/50"
                    >
                      <div className="max-w-md mx-auto flex flex-col items-center">
                        <div className="w-14 h-14 rounded-2xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700 mb-3 shadow-sm">
                          <AlertTriangle className="w-7 h-7" />
                        </div>
                        <h4 className="text-base sm:text-lg font-bold text-slate-800 mb-1">
                          {searchQuery || statusFilter !== 'ALL'
                            ? 'Arama kriterinize uygun talep kaydı bulunamadı.'
                            : `${site.name} Tablosunda Henüz Kayıt Bulunmuyor`}
                        </h4>
                        <p className="text-xs sm:text-sm text-slate-500 mb-4 leading-relaxed">
                          {searchQuery || statusFilter !== 'ALL'
                            ? 'Filtreleri temizleyerek tüm kayıtları görüntüleyebilirsiniz.'
                            : 'Bu tabloda henüz kayıt girilmemiştir.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((r, idx) => {
                    const currentStatus = getRecordStatus(r);
                    const isActionLoading = actionLoadingId === r.id;
                    const rowId = r.id !== undefined && r.id !== null ? r.id : idx + 1;
                    const displayDate = getTarih(r);
                    const firmaUnvani = getFirmaUnvani(r);
                    const rawIban = getIban(r);
                    const displayIban = formatIbanDisplay(rawIban);
                    const aciklama = getAciklama(r);
                    const tutar = getTutar(r);
                    const cariBakiye = getCariBakiye(r);
                    const talepEden = getTalepEden(r);
                    const notlar = getNotlar(r);
                    const isIbanCopied = copiedIban === String(rowId);
                    const recordSiteName = r._siteName || site.name;
                    const recordKey = getRecordKey(r);
                    const isSelected = selectedKeys.includes(recordKey);

                    return (
                      <tr
                        key={recordKey}
                        className={`hover:bg-blue-50/70 transition-colors group ${
                          isSelected ? 'bg-blue-50/50' : 'bg-white'
                        }`}
                      >
                        {/* TİK KUTUCUĞU (SEÇİM) */}
                        <td className="py-3.5 px-3.5 text-center border-r border-b border-slate-300">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(recordKey)}
                            className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer accent-blue-600"
                            title="Bu kaydı seç"
                          />
                        </td>

                        {/* ŞANTİYE KOLONU (ALL MODUNDA) */}
                        {isAllMode && (
                          <td className="py-3.5 px-4 whitespace-nowrap border-r border-b border-slate-300">
                            <button
                              type="button"
                              onClick={() => {
                                const target = SITES.find((s) => s.id === r._siteId);
                                if (target && onNavigateToSite) {
                                  onNavigateToSite(target);
                                }
                              }}
                              className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100 transition flex items-center gap-1"
                            >
                              <span>{recordSiteName}</span>
                            </button>
                          </td>
                        )}

                        {/* 1. FİRMA ÜNVANI */}
                        <td className="py-3 px-3.5 border-r border-b border-slate-300">
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-start gap-1.5">
                              <Building className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
                              <span className="font-bold text-slate-900 text-sm block leading-snug">
                                {firmaUnvani}
                              </span>
                            </div>
                            {/* CARİ KONTROL ET & FATURA GÖSTER BUTONLARI (Firma Ünvanı Altında) */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <button
                                id={`btn-cari-${rowId}`}
                                type="button"
                                onClick={() => handleOpenCari(r)}
                                className="inline-flex items-center gap-1 self-start px-2 py-0.5 rounded-md text-[10.5px] font-bold transition-all bg-purple-50 text-purple-700 hover:bg-purple-600 hover:text-white border border-purple-200 cursor-pointer shadow-2xs hover:shadow-xs active:scale-95 whitespace-nowrap"
                                title={`${firmaUnvani} için Cari Hesap ve Tedarikçi Geçmişini Kontrol Et`}
                              >
                                <SearchCheck className="w-3 h-3" />
                                <span>CARİ KONTROL ET</span>
                              </button>

                              <FaturaGosterButton
                                rowId={rowId}
                                firmaUnvani={firmaUnvani}
                                record={r}
                                onOpenFatura={handleOpenFatura}
                                onNoFatura={handleNoFatura}
                              />
                            </div>
                          </div>
                        </td>

                        {/* 2. İBAN NO (Daraltılmış) */}
                        <td className="py-2.5 px-2.5 w-[150px] min-w-[135px] max-w-[160px] border-r border-b border-slate-300">
                          {rawIban && rawIban !== '-' ? (
                            <div className="flex items-center gap-1.5 justify-between w-full">
                              <div
                                className="font-mono text-[11px] text-slate-800 bg-slate-100 px-1.5 py-1 rounded border border-slate-200 font-semibold tracking-tight break-all leading-tight select-all flex-1 min-w-0"
                                title={rawIban}
                              >
                                {displayIban}
                              </div>
                              <button
                                type="button"
                                onClick={() => handleCopyIban(rawIban, rowId)}
                                className={`p-1 rounded border transition flex-shrink-0 cursor-pointer ${
                                  isIbanCopied
                                    ? 'bg-emerald-600 text-white border-emerald-600'
                                    : 'bg-white hover:bg-blue-50 text-slate-600 hover:text-blue-700 border-slate-300'
                                }`}
                                title="İBAN Kopyala"
                              >
                                {isIbanCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs font-mono">-</span>
                          )}
                        </td>

                        {/* 3. AÇIKLAMA (Daraltılmış) */}
                        <td className="py-2.5 px-3 w-[175px] min-w-[150px] max-w-[195px] border-r border-b border-slate-300">
                          <div
                            className="font-medium text-slate-800 text-xs leading-snug line-clamp-3 hover:line-clamp-none transition-all break-words"
                            title={aciklama}
                          >
                            {aciklama}
                          </div>
                          {notlar && (
                            <div
                              className="text-[10.5px] text-slate-600 mt-1 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 truncate"
                              title={notlar}
                            >
                              <span className="font-bold text-slate-700">Not:</span> {notlar}
                            </div>
                          )}
                        </td>

                        {/* 4. ÖDENECEK TUTAR */}
                        <td className="py-3.5 px-4 whitespace-nowrap text-right border-r border-b border-slate-300 bg-emerald-50/10">
                          <div className="font-mono font-black text-base text-emerald-700 tracking-tight">
                            {formatCurrency(tutar)}
                          </div>
                        </td>

                        {/* CARİ BAKİYE */}
                        <td
                          className="py-2.5 px-3 whitespace-nowrap text-right border-r border-b border-slate-300 bg-slate-100/60 shadow-2xs"
                          title={getCariBakiyeTitle(cariBakiye, tutar)}
                        >
                          <div className={`font-mono font-black text-sm tracking-tight ${getCariBakiyeTextStyle(cariBakiye, tutar)}`}>
                            {formatCariBakiyeDisplay(cariBakiye)}
                          </div>
                        </td>

                        {/* 5. TALEP EDEN (Daraltılmış) */}
                        <td className="py-2.5 px-2.5 w-[110px] min-w-[100px] max-w-[125px] border-r border-b border-slate-300">
                          <div className="font-bold text-slate-800 flex items-center gap-1 text-xs" title={talepEden}>
                            <User className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                            <span className="truncate leading-tight">{talepEden}</span>
                          </div>
                        </td>

                        {/* 6. DURUM */}
                        <td className="py-3.5 px-4 text-center whitespace-nowrap border-r border-b border-slate-300">
                          {currentStatus === 'ÖDENSİN' && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-sm">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              ÖDENSİN
                            </span>
                          )}
                          {currentStatus === 'ÖDENMESİN' && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black bg-rose-100 text-rose-800 border border-rose-300 shadow-sm">
                              <XCircle className="w-3.5 h-3.5 text-rose-600" />
                              ÖDENMESİN
                            </span>
                          )}
                          {currentStatus === 'BEKLESİN' && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black bg-amber-100 text-amber-900 border border-amber-300 shadow-sm">
                              <Clock className="w-3.5 h-3.5 text-amber-600" />
                              BEKLESİN
                            </span>
                          )}
                        </td>

                        {/* İŞLEM BUTONLARI (2 SATIR: ÜSTTE ÖDENSİN/ÖDENMESİN/BEKLESİN, ALTTA GÜNCELLE/CARİ KONTROL ET/SİL) */}
                        <td className="py-3 px-4 whitespace-nowrap text-center border-b border-slate-300">
                          <div className="flex flex-col gap-1.5 items-center justify-center">
                            {/* 1. SATIR: ÖDENSİN / ÖDENMESİN / BEKLESİN */}
                            <div className="inline-flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-2xs">
                              {/* ÖDENSİN BUTONU */}
                              <button
                                id={`btn-odensin-${rowId}`}
                                type="button"
                                disabled={isActionLoading}
                                onClick={() => handleUpdateStatus(r, 'ÖDENSİN')}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-black tracking-wide transition-all duration-150 flex items-center gap-1.5 ${
                                  currentStatus === 'ÖDENSİN'
                                    ? 'bg-emerald-600 text-white shadow-sm scale-105 border border-emerald-700'
                                    : 'bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-200 hover:text-emerald-900'
                                }`}
                                title="Durumu ÖDENSİN olarak kaydet"
                              >
                                <CheckCheck className="w-3.5 h-3.5" />
                                <span>ÖDENSİN</span>
                              </button>

                              {/* ÖDENMESİN BUTONU */}
                              <button
                                id={`btn-odenmesin-${rowId}`}
                                type="button"
                                disabled={isActionLoading}
                                onClick={() => handleUpdateStatus(r, 'ÖDENMESİN')}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-black tracking-wide transition-all duration-150 flex items-center gap-1.5 ${
                                  currentStatus === 'ÖDENMESİN'
                                    ? 'bg-rose-600 text-white shadow-sm scale-105 border border-rose-700'
                                    : 'bg-white hover:bg-rose-50 text-rose-800 border border-rose-200 hover:text-rose-900'
                                }`}
                                title="Durumu ÖDENMESİN olarak kaydet"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>ÖDENMESİN</span>
                              </button>

                              {/* BEKLESİN BUTONU */}
                              <button
                                id={`btn-beklesin-${rowId}`}
                                type="button"
                                disabled={isActionLoading}
                                onClick={() => handleUpdateStatus(r, 'BEKLESİN')}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-black tracking-wide transition-all duration-150 flex items-center gap-1.5 ${
                                  currentStatus === 'BEKLESİN'
                                    ? 'bg-amber-500 text-slate-950 shadow-sm scale-105 border border-amber-600'
                                    : 'bg-white hover:bg-amber-50 text-amber-900 border border-amber-200 hover:text-amber-950'
                                }`}
                                title="Durumu BEKLESİN olarak kaydet"
                              >
                                <Clock className="w-3.5 h-3.5" />
                                <span>BEKLESİN</span>
                              </button>
                            </div>

                            {/* 2. SATIR: GÜNCELLE / SİL */}
                            <div className="inline-flex items-center gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-200">
                              {/* GÜNCELLE BUTONU */}
                              <button
                                id={`btn-edit-${rowId}`}
                                type="button"
                                onClick={() => handleOpenEdit(r)}
                                className="px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white border border-blue-200 cursor-pointer"
                                title="Veri Güncelleme Yap"
                              >
                                <Edit3 className="w-3 h-3" />
                                <span>GÜNCELLE</span>
                              </button>

                              {/* SİL BUTONU */}
                              <button
                                id={`btn-delete-${rowId}`}
                                type="button"
                                onClick={() => handleOpenDelete(r)}
                                className="px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 bg-rose-50 text-rose-700 hover:bg-rose-600 hover:text-white border border-rose-200 cursor-pointer"
                                title="Kaydı Sil (Uyarı ile)"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>SİL</span>
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TABLONUN ALTINDAKİ DIŞA AKTAR VE İŞLEM BARİ (KOYU MAVİ TASARIM) */}
        <div className="bg-slate-900 border-t border-slate-800 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 shadow-inner">
          {/* Sol Taraf: Seçim Bilgisi, ÖDENECEKLERİ ÖDEME LİSTESİNE EKLE Butonu & Hızlı Seçim */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-bold text-slate-200 bg-slate-800/90 px-3.5 py-2 rounded-xl border border-slate-700 shadow-sm flex items-center gap-2">
              <input
                type="checkbox"
                checked={filteredRecords.length > 0 && selectedKeys.length === filteredRecords.length}
                onChange={handleToggleSelectAll}
                className="w-4 h-4 text-blue-500 rounded border-slate-600 bg-slate-700 focus:ring-blue-400 cursor-pointer accent-blue-500"
                title="Tümünü Seç / Kaldır"
              />
              {selectedKeys.length > 0 ? (
                <span className="text-blue-300 font-extrabold">{selectedKeys.length} / {filteredRecords.length} Kayıt Seçili</span>
              ) : (
                <span>Tüm Tablo: <strong className="text-white font-extrabold">{filteredRecords.length}</strong> Kayıt</span>
              )}
            </span>

            {/* ÖDENECEKLERİ ÖDEME LİSTESİNE EKLE BUTONU */}
            <button
              id="btn-add-to-payment-list"
              type="button"
              onClick={handleOpenMoveModal}
              disabled={moveLoading || filteredRecords.length === 0}
              className="px-4 py-2 rounded-xl text-xs font-black bg-blue-600 hover:bg-blue-500 text-white shadow-md hover:shadow-blue-600/30 transition-all duration-150 flex items-center gap-2 border border-blue-400/50 cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              title={`Listede toplam ${countOdensin} adet ÖDENSİN durumunda kayıt bulunmaktadır. Tıklayarak ödeme listesine aktarabilirsiniz.`}
            >
              {moveLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin text-blue-200" />
              ) : (
                <CheckSquare className="w-4 h-4 text-blue-200" />
              )}
              <span>ÖDENECEKLERİ ÖDEME LİSTESİNE EKLE</span>
              <span className="bg-blue-950 text-emerald-300 text-[11px] px-2.5 py-0.5 rounded-full font-mono font-black border border-emerald-400/40 shadow-xs flex items-center gap-1">
                <span>{countOdensin}</span>
                <span className="text-[9px] text-emerald-300/90 font-bold uppercase">ÖDENSİN</span>
              </span>
            </button>

            {/* ÖDEME YAP BUTONU */}
            <button
              id="btn-execute-payment"
              type="button"
              onClick={() => {
                if (onOpenPaymentExecutionPage) {
                  onOpenPaymentExecutionPage();
                } else {
                  handleOpenPayModal();
                }
              }}
              disabled={payLoading}
              className="px-4 py-2 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-500 text-white shadow-md hover:shadow-emerald-600/30 transition-all duration-150 flex items-center gap-2 border border-emerald-400/50 cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Ödemeleri Gerçekleştir sayfasına geçerek ödenecek listelerini görüntüleyin ve işlem yapın."
            >
              {payLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin text-emerald-200" />
              ) : (
                <CreditCard className="w-4 h-4 text-emerald-100" />
              )}
              <span>ÖDEME YAP</span>
              {selectedKeys.length > 0 ? (
                <span className="bg-emerald-950 text-emerald-300 text-[11px] px-2 py-0.5 rounded-full font-mono font-bold border border-emerald-400/40 shadow-xs">
                  {selectedKeys.length} SEÇİLİ
                </span>
              ) : (
                countOdensin > 0 && (
                  <span className="bg-emerald-950 text-emerald-300 text-[11px] px-2 py-0.5 rounded-full font-mono font-bold border border-emerald-400/40 shadow-xs">
                    {countOdensin} ÖDENECEK
                  </span>
                )
              )}
            </button>

            {selectedKeys.length > 0 && (
              <button
                type="button"
                onClick={handleClearSelection}
                className="text-xs text-rose-400 hover:text-rose-300 font-bold hover:underline transition cursor-pointer"
              >
                Seçimi Temizle
              </button>
            )}
          </div>

          {/* Sağ Taraf: Dışa Aktarma Butonları */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* 1. EXCEL'E AKTAR BUTONU */}
            <button
              id="btn-excel-export-main"
              type="button"
              onClick={() => handleExportToExcel()}
              className="px-3.5 py-2 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition-all duration-150 flex items-center gap-2 border border-emerald-500 cursor-pointer active:scale-95"
              title={selectedKeys.length > 0 ? `Seçili ${selectedKeys.length} kaydı Excel'e aktar` : "Tablodaki tüm kayıtları Excel'e aktar"}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>EXCEL'E AKTAR</span>
              {selectedKeys.length > 0 && (
                <span className="bg-emerald-800 text-emerald-100 text-[10px] px-1.5 py-0.5 rounded-full font-mono">
                  {selectedKeys.length}
                </span>
              )}
            </button>

            {/* 2. PDF'E AKTAR BUTONU */}
            <button
              id="btn-pdf-export-main"
              type="button"
              onClick={handleExportToPDF}
              className="px-3.5 py-2 rounded-xl text-xs font-black bg-rose-600 hover:bg-rose-500 text-white shadow-md transition-all duration-150 flex items-center gap-2 border border-rose-500 cursor-pointer active:scale-95"
              title={selectedKeys.length > 0 ? `Seçili ${selectedKeys.length} kaydı PDF'e aktar` : "Tablodaki tüm kayıtları PDF'e aktar"}
            >
              <FileDown className="w-4 h-4" />
              <span>PDF'E AKTAR</span>
              {selectedKeys.length > 0 && (
                <span className="bg-rose-800 text-rose-100 text-[10px] px-1.5 py-0.5 rounded-full font-mono">
                  {selectedKeys.length}
                </span>
              )}
            </button>

            <div className="h-6 w-px bg-slate-700 mx-1 hidden sm:block"></div>

            {/* 3. ÖDENSİN BUTONU -> ÖDENSİN VERİLERİNİ EXCEL'E AKTARIR */}
            <button
              id="btn-excel-export-odensin"
              type="button"
              onClick={() => handleExportToExcel('ÖDENSİN')}
              className="px-3.5 py-2 rounded-xl text-xs font-black bg-emerald-950/80 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-700 hover:border-emerald-500 transition-all duration-150 flex items-center gap-1.5 shadow-sm cursor-pointer group active:scale-95"
              title="Sadece ÖDENSİN durumundaki tüm kayıtları Excel'e aktar"
            >
              <CheckCheck className="w-3.5 h-3.5 text-emerald-400 group-hover:text-white" />
              <span>ÖDENSİN</span>
              <span className="bg-emerald-900 group-hover:bg-emerald-700 text-emerald-200 group-hover:text-white text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold border border-emerald-700">
                {records.filter((r) => getRecordStatus(r) === 'ÖDENSİN').length}
              </span>
            </button>

            {/* 4. BEKLESİN BUTONU -> BEKLESİN VERİLERİNİ EXCEL'E AKTARIR */}
            <button
              id="btn-excel-export-beklesin"
              type="button"
              onClick={() => handleExportToExcel('BEKLESİN')}
              className="px-3.5 py-2 rounded-xl text-xs font-black bg-amber-950/80 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-700 hover:border-amber-400 transition-all duration-150 flex items-center gap-1.5 shadow-sm cursor-pointer group active:scale-95"
              title="Sadece BEKLESİN durumundaki tüm kayıtları Excel'e aktar"
            >
              <Clock className="w-3.5 h-3.5 text-amber-400 group-hover:text-slate-950" />
              <span>BEKLESİN</span>
              <span className="bg-amber-900 group-hover:bg-amber-600 text-amber-200 group-hover:text-slate-950 text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold border border-amber-700">
                {records.filter((r) => getRecordStatus(r) === 'BEKLESİN').length}
              </span>
            </button>

            {/* 5. ÖDENMESİN BUTONU -> ÖDENMESİN VERİLERİNİ EXCEL'E AKTARIR */}
            <button
              id="btn-excel-export-odenmesin"
              type="button"
              onClick={() => handleExportToExcel('ÖDENMESİN')}
              className="px-3.5 py-2 rounded-xl text-xs font-black bg-rose-950/80 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-700 hover:border-rose-500 transition-all duration-150 flex items-center gap-1.5 shadow-sm cursor-pointer group active:scale-95"
              title="Sadece ÖDENMESİN durumundaki tüm kayıtları Excel'e aktar"
            >
              <XCircle className="w-3.5 h-3.5 text-rose-400 group-hover:text-white" />
              <span>ÖDENMESİN</span>
              <span className="bg-rose-900 group-hover:bg-rose-700 text-rose-200 group-hover:text-white text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold border border-rose-700">
                {records.filter((r) => getRecordStatus(r) === 'ÖDENMESİN').length}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* TABLOLARIN EN ALTINDA YAPILAN ÖDEMELERİ SERVERE GÖNDER BÖLÜMÜ */}
      <div className="bg-gradient-to-r from-[#0b172a] via-[#162544] to-[#0b172a] p-4 sm:p-5 rounded-2xl border border-indigo-500/40 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600/30 border border-indigo-400/40 flex items-center justify-center text-cyan-300 flex-shrink-0">
            <UploadCloud className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-black text-white uppercase tracking-wide">
              Yapılan Ödemeleri Sunucuya Aktarma Merkezi
            </div>
            <div className="text-xs text-blue-300/80">
              7 Şantiye ödenecek kayıtlarını (arnavutkoy, mamak, senbay_ozka, merkez_ozka, msb_ozka, seka, diger) onay ile sunucudaki _odenenler tablolarına aktarır. Boş tablolar atlanır.
            </div>
          </div>
        </div>

        <button
          id="btn-server-sync-bottom"
          type="button"
          onClick={handleOpenServerSyncModal}
          disabled={serverSyncLoading}
          className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-700 hover:from-blue-500 hover:to-purple-600 text-white font-black text-xs sm:text-sm border border-indigo-400/50 shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2.5 transition cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {serverSyncLoading ? (
            <RefreshCw className="w-4 h-4 animate-spin text-white" />
          ) : (
            <UploadCloud className="w-4 h-4 text-cyan-300" />
          )}
          <span>YAPILAN ÖDEMELERİ SERVERE GÖNDER</span>
        </button>
      </div>

      {/* ŞANTİYE MUAVİN DEFTERİ PDF VE CANLI ARAMA (PROGRAMIN EN ALTINDA) */}
      <SiteBottomMuavinSection site={site} />

      {/* GÜNCELLE MODAL */}
      <EditTalepModal
        isOpen={editModalOpen}
        record={editingRecord}
        siteTableName={editingRecord?._siteTable || site.tableName}
        defaultTableName={site.tableName}
        onClose={() => {
          setEditModalOpen(false);
          setEditingRecord(null);
        }}
        onSaved={() => {
          showToast('Talep bilgileri ve cari bakiye veritabanında başarıyla güncellendi.');
          fetchRecords(true);
        }}
        onSuccess={() => {
          fetchRecords(true);
        }}
        showToast={showToast}
      />

      {/* CARİ KONTROL MODAL */}
      <CariKontrolModal
        isOpen={cariModalOpen}
        record={cariRecord}
        allRecords={records}
        cariRecords={cariRecords}
        onClose={() => {
          setCariModalOpen(false);
          setCariRecord(null);
        }}
        onUpdateStatus={handleUpdateStatus}
        showToast={showToast}
      />

      {/* SİLME ONAY MODAL (UYARI) */}
      <DeleteConfirmModal
        isOpen={deleteModalOpen}
        record={deletingRecord}
        tableName={deletingRecord?._siteTable || site.tableName}
        siteName={deletingRecord?._siteName || site.name}
        loading={deleteLoading}
        onClose={() => {
          if (!deleteLoading) {
            setDeleteModalOpen(false);
            setDeletingRecord(null);
          }
        }}
        onConfirm={handleConfirmDelete}
      />

      {/* ÖDEME LİSTESİNE TAŞIMA ONAY MODAL (UYARI) */}
      <MoveToPaymentConfirmModal
        isOpen={moveModalOpen}
        onClose={() => {
          if (!moveLoading) {
            setMoveModalOpen(false);
            setMoveModalRecords([]);
          }
        }}
        onConfirm={handleConfirmMoveToPayment}
        loading={moveLoading}
        recordsToMove={moveModalRecords}
        site={site}
      />

      {/* ÖDEME YAP VE ONAYLA MODAL */}
      <PaymentExecutionModal
        isOpen={payModalOpen}
        onClose={() => {
          if (!payLoading) {
            setPayModalOpen(false);
            setPayModalRecords([]);
          }
        }}
        onConfirm={handleConfirmPayment}
        loading={payLoading}
        recordsToPay={payModalRecords}
        site={site}
      />

      {/* YAPILAN ÖDEMELERİ SERVERE GÖNDER ONAY MODALI */}
      <ServerSyncModal
        isOpen={serverSyncOpen}
        onClose={() => {
          if (!serverSyncLoading) {
            setServerSyncOpen(false);
          }
        }}
        onConfirm={handleConfirmServerSync}
        loading={serverSyncLoading}
        progressStep={serverSyncStep}
        tablesData={odenecekTablesMap}
        totalCount={totalOdenecekCount}
        totalAmount={totalOdenecekAmount}
      />

      {/* FATURA & EVRAK GÖSTER MODAL */}
      {selectedFaturaRecord && (
        <FaturaGosterModal
          isOpen={!!selectedFaturaRecord}
          record={selectedFaturaRecord}
          initialFatura={selectedFaturaInfo}
          faturaList={selectedFaturaList}
          siteName={isAllMode ? (selectedFaturaRecord.site || 'Tüm Şantiyeler') : site.name}
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

      {/* YENİ ÖDEME EKLE FORM MODALI */}
      <AddPaymentModal
        isOpen={addPaymentModalOpen}
        onClose={() => setAddPaymentModalOpen(false)}
        site={site}
        onSuccess={() => {
          fetchRecords(true);
        }}
        showToast={showToast}
      />
    </div>
  );
};
