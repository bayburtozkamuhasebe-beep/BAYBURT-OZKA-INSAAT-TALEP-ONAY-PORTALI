import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Trash2,
  ShieldCheck,
  AlertTriangle,
  FileText,
  Search,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  Eye,
  Building2,
  HelpCircle,
  FileX,
  Copy,
  Check,
  ChevronDown,
  Terminal,
  ShieldAlert
} from 'lucide-react';
import {
  scanBucketFilesForOdenmesinPruning,
  deleteUnmatchedBucketFiles,
  OdenmesinPruneAnalysis,
  CARIFATURALAR_BUCKET
} from '../lib/faturaService';

interface FaturaSilModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const PRIMARY_CONFIRM_CODE = 'CARIFATURALAR-SİL';
const SQL_POLICY_CODE = `CREATE POLICY "Allow public delete on CARIFATURALAR"
ON storage.objects
FOR DELETE
TO public
USING (bucket_id = 'CARIFATURALAR');`;

export const FaturaSilModal: React.FC<FaturaSilModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [analysis, setAnalysis] = useState<OdenmesinPruneAnalysis | null>(null);
  const [activeTab, setActiveTab] = useState<'delete' | 'keep' | 'firmas'>('delete');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [confirmed, setConfirmed] = useState<boolean>(false);
  const [inputCode, setInputCode] = useState<string>('');
  const [securityPin, setSecurityPin] = useState<string>('987654');
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [copiedSql, setCopiedSql] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [deleteProgress, setDeleteProgress] = useState<{ deleted: number; total: number } | null>(null);
  const [deleteResult, setDeleteResult] = useState<{
    completed: boolean;
    deletedCount: number;
    errorsCount: number;
    errorDetails?: any[];
  } | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<{ name: string; url: string } | null>(null);

  // Load data when modal opens
  const loadAnalysis = async () => {
    setLoading(true);
    setConfirmed(false);
    setInputCode('');
    setDeleteResult(null);
    setDeleteProgress(null);
    setGeneralError(null);
    const newPin = Math.floor(100000 + Math.random() * 900000).toString();
    setSecurityPin(newPin);

    try {
      const result = await scanBucketFilesForOdenmesinPruning();
      setAnalysis(result);
    } catch (err: any) {
      console.error('Error scanning files for pruning:', err);
      setGeneralError('Depolama ve portal verileri taranırken bir hata oluştu: ' + (err?.message || String(err)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadAnalysis();
    }
  }, [isOpen]);

  // Code validation check
  const isCodeValid = useMemo(() => {
    const clean = inputCode.trim().toUpperCase();
    return (
      clean === PRIMARY_CONFIRM_CODE ||
      clean === 'CARIFATURALAR-SIL' ||
      clean === 'CARIFATURA-SIL' ||
      clean === 'CARIFATURA-SİL' ||
      clean === 'SİL' ||
      clean === 'SIL' ||
      clean === securityPin
    );
  }, [inputCode, securityPin]);

  // Filtered files to delete
  const filteredFilesToDelete = useMemo(() => {
    if (!analysis) return [];
    if (!searchTerm.trim()) return analysis.filesToDelete;
    const term = searchTerm.toLowerCase();
    return analysis.filesToDelete.filter(
      (f) => f.name.toLowerCase().includes(term) || f.path.toLowerCase().includes(term)
    );
  }, [analysis, searchTerm]);

  // Filtered files to keep
  const filteredFilesToKeep = useMemo(() => {
    if (!analysis) return [];
    if (!searchTerm.trim()) return analysis.filesToKeep;
    const term = searchTerm.toLowerCase();
    return analysis.filesToKeep.filter(
      (f) =>
        f.name.toLowerCase().includes(term) ||
        f.matchedFirma.toLowerCase().includes(term) ||
        f.matchedTables.some((t) => t.toLowerCase().includes(term))
    );
  }, [analysis, searchTerm]);

  // Filtered ÖDENMESİN firmas
  const filteredFirmas = useMemo(() => {
    if (!analysis) return [];
    if (!searchTerm.trim()) return analysis.odenmesinFirmas;
    const term = searchTerm.toLowerCase();
    return analysis.odenmesinFirmas.filter(
      (f) => f.firma.toLowerCase().includes(term) || f.tables.some((t) => t.toLowerCase().includes(term))
    );
  }, [analysis, searchTerm]);

  // Handle direct deletion execution
  const executeDeletion = async () => {
    if (!analysis || analysis.filesToDelete.length === 0) return;
    if (!confirmed || !isCodeValid) return;

    setIsDeleting(true);
    setGeneralError(null);

    const fileCount = analysis.filesToDelete.length;
    setDeleteProgress({ deleted: 0, total: fileCount });

    const pathsToDelete = analysis.filesToDelete.map((f) => f.path);

    try {
      console.log('Starting deletion of files:', pathsToDelete);
      const result = await deleteUnmatchedBucketFiles(
        pathsToDelete,
        (deleted, total) => {
          setDeleteProgress({ deleted, total });
        }
      );

      console.log('Deletion completed with result:', result);

      setDeleteResult({
        completed: true,
        deletedCount: result.deletedCount,
        errorsCount: result.errors.length,
        errorDetails: result.errors
      });

      if (result.deletedCount > 0 && onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      console.error('Deletion error:', err);
      setGeneralError('Silme işlemi sırasında hata: ' + (err?.message || String(err)));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard?.writeText(PRIMARY_CONFIRM_CODE);
    setInputCode(PRIMARY_CONFIRM_CODE);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleCopySql = () => {
    navigator.clipboard?.writeText(SQL_POLICY_CODE);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-5xl rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-slate-100">
        {/* MODAL HEADER */}
        <div className="px-6 py-4 border-b border-slate-800 bg-gradient-to-r from-slate-950 via-slate-900 to-red-950/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-400 shadow-inner">
              <Trash2 className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-wide text-white">
                  FATURALARI SİL & DEPOLAMA YÖNETİMİ
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  {CARIFATURALAR_BUCKET}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Portal tablolarında durumu <strong className="text-rose-400 font-bold">ÖDENMESİN</strong> olan firma evrakları korunur, diğerleri temizlenir.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="https://supabase.com/dashboard/project/mgtunrfpzbyfnmeloeeq/storage/files/buckets/CARIFATURALAR"
              target="_blank"
              rel="noreferrer"
              title="Supabase CARIFATURALAR Deposuna Git"
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition"
            >
              <span>Supabase Deposu</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
            </a>
            <button
              type="button"
              onClick={onClose}
              disabled={isDeleting}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition disabled:opacity-50 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* RULE BANNER */}
        <div className="px-6 py-2.5 bg-gradient-to-r from-blue-950/80 via-slate-900 to-amber-950/40 border-b border-slate-800 text-xs text-slate-300 flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
          <div className="leading-relaxed">
            <strong className="text-emerald-300">ÖZKA PORTALI KORUMA KURALI:</strong> Bayburt Özka İnşaat portalındaki tablolarda (Talep, Ödenecek, Ödenenler) durumu <strong className="text-rose-400 underline font-black">ÖDENMESİN</strong> olarak işaretlenmiş tüm firma ünvanlarına ait evraklar <strong className="text-emerald-300">KESİNLİKLE SİLİNMEZ (KORUNUR)</strong>. Durumu ÖDENMESİN olmayan veya tabloda bulunmayan diğer tüm evraklar depodan kalıcı olarak silinir.
          </div>
        </div>

        {/* GENERAL ERROR BANNER */}
        {generalError && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-red-950/70 border border-red-800 text-xs text-red-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span>{generalError}</span>
          </div>
        )}

        {/* MODAL BODY */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-4 text-center">
              <RefreshCw className="w-10 h-10 text-blue-400 animate-spin" />
              <div>
                <h3 className="font-bold text-base text-slate-200">Depo ve Portaldaki Tablolar Taranıyor...</h3>
                <p className="text-xs text-slate-400 max-w-md mt-1">
                  CARIFATURALAR deposundaki evraklar ve tüm şantiyelerin tablolarındaki 'ÖDENMESİN' durumundaki kayıtlar analiz ediliyor.
                </p>
              </div>
            </div>
          ) : deleteResult?.completed ? (
            /* COMPLETION OR RLS PERMISSION BLOCKED SCREEN */
            deleteResult.deletedCount === 0 && deleteResult.errorsCount > 0 ? (
              /* RLS PERMISSION GUIDE SCREEN */
              <div className="py-6 px-2 space-y-5 animate-fadeIn">
                <div className="p-4 rounded-2xl bg-amber-950/50 border-2 border-amber-600/70 text-left space-y-3">
                  <div className="flex items-start gap-3">
                    <ShieldAlert className="w-6 h-6 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <h3 className="text-base font-black text-amber-300">
                        Supabase Depolama Güvenlik Kuralı (RLS) Nedeniyle Dosyalar Silinemedi
                      </h3>
                      <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                        Supabase veritabanında <strong>CARIFATURALAR</strong> deposu için varsayılan olarak yalnızca <em>okuma</em> izni bulunmaktadır. Tarayıcı üzerinden dosyaları silebilmek için aşağıdaki <strong>2 yöntemden birini</strong> uygulayabilirsiniz:
                      </p>
                    </div>
                  </div>
                </div>

                <div className="max-w-2xl mx-auto w-full">
                  {/* SQL İLE İZİN AÇMA */}
                  <div className="p-4 rounded-xl bg-slate-950 border border-blue-800/60 flex flex-col justify-between space-y-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Terminal className="w-4 h-4 text-blue-400" />
                        <h4 className="text-xs font-bold text-blue-300 uppercase tracking-wide">
                          Supabase Depolama Silme İzni (SQL Politikası)
                        </h4>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                        Supabase Dashboard &gt; SQL Editor alanına girerek aşağıdaki kodu çalıştırabilirsiniz:
                      </p>
                      <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-lg mt-2 font-mono text-[10px] text-slate-200 select-all overflow-x-auto">
                        <pre>{SQL_POLICY_CODE}</pre>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        onClick={handleCopySql}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1.5 transition cursor-pointer"
                      >
                        {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedSql ? 'Kopyalandı!' : 'SQL Kodunu Kopyala'}</span>
                      </button>
                      <a
                        href="https://supabase.com/dashboard/project/mgtunrfpzbyfnmeloeeq/sql/new"
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1.5 transition"
                      >
                        <span>SQL Editörünü Aç</span>
                        <ExternalLink className="w-3 h-3 text-slate-400" />
                      </a>
                    </div>
                  </div>
                </div>

                <div className="flex justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={loadAnalysis}
                    className="px-5 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
                  >
                    Geri Dön ve Tekrar Tara
                  </button>
                </div>
              </div>
            ) : (
              /* NORMAL SUCCESS COMPLETION SCREEN */
              <div className="py-12 px-4 flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <h3 className="text-xl font-black text-white">Fatura Temizleme İşlemi Tamamlandı!</h3>
                <p className="text-sm text-slate-300 max-w-lg">
                  Toplam <strong className="text-rose-400 font-bold">{deleteResult.deletedCount}</strong> adet evrak CARIFATURALAR deposundan kalıcı olarak silindi.
                </p>
                <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl text-left text-xs space-y-2 w-full max-w-md">
                  <div className="flex justify-between text-slate-300">
                    <span>Silinen Evrak Sayısı:</span>
                    <span className="font-bold text-rose-400 font-mono">{deleteResult.deletedCount} adet</span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>Korunan ('ÖDENMESİN' Evrakları):</span>
                    <span className="font-bold text-emerald-400 font-mono">{analysis?.filesToKeep.length || 0} adet</span>
                  </div>
                  {deleteResult.errorsCount > 0 && (
                    <div className="flex justify-between text-amber-400 font-semibold pt-2 border-t border-slate-800">
                      <span>Hata Bildirilen Dosyalar:</span>
                      <span>{deleteResult.errorsCount}</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={loadAnalysis}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
                  >
                    Yeniden Tara
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-6 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-lg cursor-pointer"
                  >
                    Kapat ve Devam Et
                  </button>
                </div>
              </div>
            )
          ) : analysis ? (
            <>
              {/* METRICS OVERVIEW CARDS */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {/* 1. Toplam Evrak */}
                <div className="bg-slate-800/80 border border-slate-700/80 p-3.5 rounded-xl">
                  <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                    <span>Toplam Depo Evrakı</span>
                    <FileText className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="text-2xl font-black text-white font-mono">{analysis.allFilesCount}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">CARIFATURALAR deposunda</div>
                </div>

                {/* 2. ÖDENMESİN Firmaları */}
                <div className="bg-purple-950/40 border border-purple-800/50 p-3.5 rounded-xl">
                  <div className="flex items-center justify-between text-purple-300 text-xs mb-1">
                    <span>'ÖDENMESİN' Firmaları</span>
                    <Building2 className="w-4 h-4 text-purple-400" />
                  </div>
                  <div className="text-2xl font-black text-purple-200 font-mono">
                    {analysis.odenmesinFirmas.length}
                  </div>
                  <div className="text-[10px] text-purple-300/80 mt-0.5">Tablolarda reddedilen</div>
                </div>

                {/* 3. Korunan Evraklar */}
                <div className="bg-emerald-950/40 border border-emerald-800/50 p-3.5 rounded-xl">
                  <div className="flex items-center justify-between text-emerald-300 text-xs mb-1">
                    <span>SİLİNMEYECEK (KORUNAN)</span>
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-2xl font-black text-emerald-300 font-mono">
                    {analysis.filesToKeep.length}
                  </div>
                  <div className="text-[10px] text-emerald-400/80 mt-0.5">ÖDENMESİN ile eşleşen</div>
                </div>

                {/* 4. Silinecek Evraklar */}
                <div className="bg-rose-950/40 border border-rose-800/60 p-3.5 rounded-xl">
                  <div className="flex items-center justify-between text-rose-300 text-xs mb-1">
                    <span>SİLİNECEK EVRAKLAR</span>
                    <Trash2 className="w-4 h-4 text-rose-400" />
                  </div>
                  <div className="text-2xl font-black text-rose-300 font-mono">
                    {analysis.filesToDelete.length}
                  </div>
                  <div className="text-[10px] text-rose-400/80 mt-0.5">Kalıcı olarak silinecek</div>
                </div>
              </div>

              {/* TABS & SEARCH */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setActiveTab('delete')}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      activeTab === 'delete'
                        ? 'bg-rose-600 text-white shadow-md shadow-rose-900/30'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <FileX className="w-3.5 h-3.5" />
                    <span>SİLİNECEK EVRAKLAR ({analysis.filesToDelete.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('keep')}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      activeTab === 'keep'
                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/30'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>SİLİNMEYECEK EVRAKLAR ({analysis.filesToKeep.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('firmas')}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      activeTab === 'firmas'
                        ? 'bg-purple-600 text-white shadow-md shadow-purple-900/30'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    <span>ÖDENMESİN FİRMALARI ({analysis.odenmesinFirmas.length})</span>
                  </button>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Dosya veya firma ara..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2.5 top-2 text-slate-400 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* TAB CONTENT */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl overflow-hidden min-h-[200px] max-h-[290px] overflow-y-auto">
                {/* 1. SİLİNECEK EVRAKLAR TAB */}
                {activeTab === 'delete' && (
                  <div>
                    {filteredFilesToDelete.length === 0 ? (
                      <div className="py-12 text-center text-slate-400 text-xs">
                        {analysis.filesToDelete.length === 0
                          ? '🎉 Harika! Silinecek hiçbir evrak bulunmuyor. Depodaki tüm evraklar ÖDENMESİN firmalarıyla eşleşiyor.'
                          : 'Arama kriterine uygun silinecek dosya bulunamadı.'}
                      </div>
                    ) : (
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-900 text-slate-400 sticky top-0 border-b border-slate-800">
                          <tr>
                            <th className="py-2 px-3 font-semibold">#</th>
                            <th className="py-2 px-3 font-semibold">Dosya Adı</th>
                            <th className="py-2 px-3 font-semibold text-right">Boyut</th>
                            <th className="py-2 px-3 font-semibold">Durum</th>
                            <th className="py-2 px-3 font-semibold text-center">İncele</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {filteredFilesToDelete.map((file, idx) => (
                            <tr key={file.path || idx} className="hover:bg-rose-950/20 transition-colors">
                              <td className="py-2 px-3 text-slate-500 font-mono w-8">{idx + 1}</td>
                              <td className="py-2 px-3 font-medium text-slate-200">
                                <div className="flex items-center gap-2">
                                  <FileText className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                                  <span className="truncate max-w-md" title={file.name}>
                                    {file.name}
                                  </span>
                                </div>
                              </td>
                              <td className="py-2 px-3 text-slate-400 font-mono text-right whitespace-nowrap">
                                {file.size ? `${(file.size / 1024).toFixed(1)} KB` : '-'}
                              </td>
                              <td className="py-2 px-3 whitespace-nowrap">
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                  SİLİNECEK
                                </span>
                              </td>
                              <td className="py-2 px-3 text-center whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => setPreviewFile({ name: file.name, url: file.url })}
                                  title="Dosyayı önizle"
                                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-blue-400 hover:text-blue-300 transition cursor-pointer"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                {/* 2. SİLİNMEYECEK EVRAKLAR TAB */}
                {activeTab === 'keep' && (
                  <div>
                    {filteredFilesToKeep.length === 0 ? (
                      <div className="py-12 text-center text-slate-400 text-xs">
                        {analysis.filesToKeep.length === 0
                          ? 'Tablolarda durumu ÖDENMESİN olan bir firma evrakı tespit edilemedi.'
                          : 'Arama kriterine uygun korunan dosya bulunamadı.'}
                      </div>
                    ) : (
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-900 text-slate-400 sticky top-0 border-b border-slate-800">
                          <tr>
                            <th className="py-2 px-3 font-semibold">#</th>
                            <th className="py-2 px-3 font-semibold">Dosya Adı</th>
                            <th className="py-2 px-3 font-semibold">Eşleşen ÖDENMESİN Firması</th>
                            <th className="py-2 px-3 font-semibold">Bulunduğu Tablolar</th>
                            <th className="py-2 px-3 font-semibold text-right">Boyut</th>
                            <th className="py-2 px-3 font-semibold text-center">İncele</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {filteredFilesToKeep.map((file, idx) => (
                            <tr key={file.path || idx} className="hover:bg-emerald-950/20 transition-colors">
                              <td className="py-2 px-3 text-slate-500 font-mono w-8">{idx + 1}</td>
                              <td className="py-2 px-3 font-medium text-slate-200">
                                <div className="flex items-center gap-2">
                                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                                  <span className="truncate max-w-xs font-semibold text-emerald-200" title={file.name}>
                                    {file.name}
                                  </span>
                                </div>
                              </td>
                              <td className="py-2 px-3 text-slate-300 font-medium whitespace-nowrap">
                                <span className="bg-emerald-950/80 border border-emerald-800 px-2 py-0.5 rounded text-[11px] text-emerald-300 font-bold">
                                  {file.matchedFirma}
                                </span>
                              </td>
                              <td className="py-2 px-3">
                                <div className="flex flex-wrap gap-1">
                                  {file.matchedTables.map((t, tidx) => (
                                    <span
                                      key={tidx}
                                      className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700"
                                    >
                                      {t}
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td className="py-2 px-3 text-slate-400 font-mono text-right whitespace-nowrap">
                                {file.size ? `${(file.size / 1024).toFixed(1)} KB` : '-'}
                              </td>
                              <td className="py-2 px-3 text-center whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => setPreviewFile({ name: file.name, url: file.url })}
                                  title="Dosyayı önizle"
                                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-emerald-400 hover:text-emerald-300 transition cursor-pointer"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                {/* 3. ÖDENMESİN FİRMALARI TAB */}
                {activeTab === 'firmas' && (
                  <div>
                    {filteredFirmas.length === 0 ? (
                      <div className="py-12 text-center text-slate-400 text-xs">
                        ÖDENMESİN durumunda firma kaydı bulunamadı.
                      </div>
                    ) : (
                      <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                        {filteredFirmas.map((f, idx) => (
                          <div
                            key={idx}
                            className="bg-slate-900 border border-slate-800 p-2.5 rounded-lg flex items-center justify-between"
                          >
                            <div className="min-w-0 pr-2">
                              <div className="font-bold text-slate-200 text-xs truncate" title={f.firma}>
                                {f.firma}
                              </div>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {f.tables.map((t, tidx) => (
                                  <span
                                    key={tidx}
                                    className="px-1.5 py-0.5 rounded text-[9px] bg-purple-950/80 text-purple-300 border border-purple-800/60"
                                  >
                                    {t}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <span className="px-2 py-1 rounded bg-slate-800 text-[10px] font-mono text-slate-400 border border-slate-700 whitespace-nowrap flex-shrink-0">
                              {f.recordCount} kayıt
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* PROGRESS BAR WHILE DELETING */}
              {isDeleting && deleteProgress && (
                <div className="bg-slate-950 border border-red-500/40 p-4 rounded-xl space-y-2">
                  <div className="flex justify-between text-xs font-bold text-slate-200">
                    <span className="flex items-center gap-1.5 text-rose-400">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Faturalar CARIFATURALAR deposundan kalıcı olarak siliniyor...
                    </span>
                    <span className="font-mono text-rose-300">
                      {deleteProgress.deleted} / {deleteProgress.total} dosya
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-red-600 to-rose-500 h-2.5 transition-all duration-300"
                      style={{
                        width: `${Math.round((deleteProgress.deleted / Math.max(1, deleteProgress.total)) * 100)}%`
                      }}
                    />
                  </div>
                </div>
              )}

              {/* SECURITY CONFIRMATION CODE & SAFEGUARD SECTION */}
              <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-red-950/40 border-2 border-red-800/70 p-4 rounded-2xl space-y-3.5 shadow-xl">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-red-600/20 border border-red-500/40 text-red-400 flex-shrink-0 mt-0.5">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-black text-white tracking-wide uppercase">
                        GÜVENLİK VE SİLME ONAYI KODU
                      </h4>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        Zorunlu Doğrulama
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                      Yanlışlıkla silinmeyi önlemek için lütfen aşağıdaki silme onayı kodunu kutucuğa yazınız veya <strong>Kodu Doldur</strong> butonuna tıklayınız:
                    </p>
                  </div>
                </div>

                {/* CODE DISPLAY & INPUT */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  {/* Left: Defined Code */}
                  <div className="bg-slate-950/90 border border-slate-700/80 p-3 rounded-xl flex items-center justify-between">
                    <div>
                      <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                        SİLME ONAY KODUNUZ:
                      </div>
                      <div className="text-base font-black text-rose-400 font-mono tracking-wider mt-0.5 flex items-center gap-2">
                        <span>{PRIMARY_CONFIRM_CODE}</span>
                        <span className="text-[11px] font-normal text-slate-400">veya</span>
                        <span className="text-amber-300 font-mono">{securityPin}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyCode}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-600/30 hover:bg-red-600/50 text-red-200 border border-red-500/50 flex items-center gap-1.5 transition cursor-pointer"
                      title="Onay kodunu kutucuğa otomatik yaz"
                    >
                      {copiedCode ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-300">Dolduruldu!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Kodu Doldur</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Right: Code Input */}
                  <div className="flex flex-col justify-center">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Onay kodunu buraya yazın (Örn: CARIFATURALAR-SİL)"
                        value={inputCode}
                        onChange={(e) => setInputCode(e.target.value)}
                        disabled={isDeleting}
                        className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-mono font-bold bg-slate-950 border transition focus:outline-none ${
                          isCodeValid
                            ? 'border-emerald-500 text-emerald-300 ring-2 ring-emerald-500/30'
                            : inputCode.trim()
                            ? 'border-rose-500 text-rose-300 ring-2 ring-rose-500/20'
                            : 'border-slate-700 text-white focus:border-blue-500'
                        }`}
                      />
                      {isCodeValid && (
                        <div className="absolute right-3 top-2.5 flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span>Kod Doğrulandı</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Checkbox */}
                <div className="pt-1 border-t border-slate-800">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                      disabled={isDeleting || analysis.filesToDelete.length === 0}
                      className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-rose-600 focus:ring-rose-500 cursor-pointer disabled:opacity-50"
                    />
                    <span className="text-xs font-semibold text-slate-200">
                      Silinecek ({analysis.filesToDelete.length}) ve silinmeyecek ({analysis.filesToKeep.length}) evrakları inceledim, kalıcı olarak silme işlemini onaylıyorum.
                    </span>
                  </label>
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* MODAL FOOTER */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
            <span>Onay kodu girilip kutucuk işaretlendiğinde kalıcı silme butonu aktif olur.</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isDeleting}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition disabled:opacity-50 cursor-pointer"
            >
              Vazgeç / İptal
            </button>

            {analysis && !deleteResult?.completed && (
              <button
                type="button"
                onClick={executeDeletion}
                disabled={!confirmed || !isCodeValid || isDeleting || analysis.filesToDelete.length === 0}
                className={`px-5 py-2.5 rounded-xl text-xs font-black transition flex items-center gap-2 shadow-lg ${
                  confirmed && isCodeValid && !isDeleting && analysis.filesToDelete.length > 0
                    ? 'bg-gradient-to-r from-red-600 via-rose-600 to-red-700 hover:from-red-500 hover:to-rose-500 text-white cursor-pointer shadow-red-950/80 active:scale-95 ring-2 ring-red-400/50 animate-pulse'
                    : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
                }`}
                title={
                  !confirmed
                    ? 'Lütfen önce yukarıdaki onay kutucuğunu işaretleyin'
                    : !isCodeValid
                    ? 'Lütfen yukarıdaki silme onay kodunu yazın'
                    : 'Faturaları kalıcı olarak sil'
                }
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Dosyalar Siliniyor...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>FATURALARI KALICI OLARAK SİL ({analysis.filesToDelete.length})</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* DOCUMENT PREVIEW OVERLAY MODAL */}
        {previewFile && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fadeIn">
            <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl h-[85vh] rounded-2xl flex flex-col overflow-hidden shadow-2xl">
              <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-200 truncate">
                  <FileText className="w-4 h-4 text-blue-400" />
                  <span className="truncate">{previewFile.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={previewFile.url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                    title="Yeni sekmede aç"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <button
                    type="button"
                    onClick={() => setPreviewFile(null)}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex-1 bg-slate-950 p-2">
                <iframe
                  src={previewFile.url}
                  title={previewFile.name}
                  className="w-full h-full rounded-xl border border-slate-800 bg-white"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
