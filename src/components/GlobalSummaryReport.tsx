import React, { useState, useEffect, useCallback } from 'react';
import { SITES, SiteConfig, TalepRecord } from '../types';
import { supabase } from '../lib/supabase';
import { getTutar, getRecordStatus, formatCurrency } from '../lib/recordUtils';
import {
  TrendingUp,
  CheckCircle2,
  XCircle,
  Clock,
  Building2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Layers,
  ArrowRight
} from 'lucide-react';

interface SiteStats {
  site: SiteConfig;
  count: number;
  totalTutar: number;
  odensinTutar: number;
  odensinCount: number;
  odenmesinTutar: number;
  odenmesinCount: number;
  beklesinTutar: number;
  beklesinCount: number;
}

interface GlobalSummaryReportProps {
  onSelectSite?: (site: SiteConfig) => void;
  activeSiteId?: string;
}

export const GlobalSummaryReport: React.FC<GlobalSummaryReportProps> = ({
  onSelectSite,
  activeSiteId
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [showBreakdown, setShowBreakdown] = useState<boolean>(false);
  const [siteStatsList, setSiteStatsList] = useState<SiteStats[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // Aggregate stats across all 7 sites
  const fetchGlobalStats = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);

    try {
      const results: SiteStats[] = await Promise.all(
        SITES.map(async (site) => {
          try {
            const { data, error } = await supabase.from(site.tableName).select('*');
            if (error || !data) {
              return {
                site,
                count: 0,
                totalTutar: 0,
                odensinTutar: 0,
                odensinCount: 0,
                odenmesinTutar: 0,
                odenmesinCount: 0,
                beklesinTutar: 0,
                beklesinCount: 0
              };
            }

            const rows = (data as TalepRecord[]) || [];
            let totalTutar = 0;
            let odensinTutar = 0;
            let odensinCount = 0;
            let odenmesinTutar = 0;
            let odenmesinCount = 0;
            let beklesinTutar = 0;
            let beklesinCount = 0;

            for (const row of rows) {
              const tutar = getTutar(row);
              const status = getRecordStatus(row);

              totalTutar += tutar;

              if (status === 'ÖDENSİN') {
                odensinTutar += tutar;
                odensinCount += 1;
              } else if (status === 'ÖDENMESİN') {
                odenmesinTutar += tutar;
                odenmesinCount += 1;
              } else {
                beklesinTutar += tutar;
                beklesinCount += 1;
              }
            }

            return {
              site,
              count: rows.length,
              totalTutar,
              odensinTutar,
              odensinCount,
              odenmesinTutar,
              odenmesinCount,
              beklesinTutar,
              beklesinCount
            };
          } catch (err) {
            return {
              site,
              count: 0,
              totalTutar: 0,
              odensinTutar: 0,
              odensinCount: 0,
              odenmesinTutar: 0,
              odenmesinCount: 0,
              beklesinTutar: 0,
              beklesinCount: 0
            };
          }
        })
      );

      setSiteStatsList(results);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error fetching global summary:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchGlobalStats(false);

    // Auto refresh every 6 seconds
    const interval = setInterval(() => {
      fetchGlobalStats(true);
    }, 6000);

    return () => clearInterval(interval);
  }, [fetchGlobalStats]);

  // Calculate grand totals across all sites
  const globalTotalCount = siteStatsList.reduce((acc, s) => acc + s.count, 0);
  const globalTotalTutar = siteStatsList.reduce((acc, s) => acc + s.totalTutar, 0);
  
  const globalOdensinTutar = siteStatsList.reduce((acc, s) => acc + s.odensinTutar, 0);
  const globalOdensinCount = siteStatsList.reduce((acc, s) => acc + s.odensinCount, 0);

  const globalOdenmesinTutar = siteStatsList.reduce((acc, s) => acc + s.odenmesinTutar, 0);
  const globalOdenmesinCount = siteStatsList.reduce((acc, s) => acc + s.odenmesinCount, 0);

  const globalBeklesinTutar = siteStatsList.reduce((acc, s) => acc + s.beklesinTutar, 0);
  const globalBeklesinCount = siteStatsList.reduce((acc, s) => acc + s.beklesinCount, 0);

  const getPercentage = (val: number, total: number) => {
    if (total <= 0) return 0;
    return Math.round((val / total) * 100);
  };

  return (
    <div className="bg-[#070e1a] border-b border-blue-900/60 shadow-2xl relative z-20">
      <div className="w-full max-w-[98%] xl:max-w-[1780px] 2xl:max-w-[1900px] mx-auto px-2 sm:px-4 lg:px-6 py-4">
        {/* Top Title & Quick Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 mb-3 border-b border-blue-950/90">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-blue-300 shadow-inner">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black tracking-widest text-blue-400 uppercase">
                  TÜM ŞANTİYELER GENEL KONSOLİDE RAPORU
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-950 text-blue-300 border border-blue-800">
                  <Layers className="w-2.5 h-2.5" /> 7 Şantiye Toplamı
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Sistemdeki tüm tabloların anlık konsolide talep ve ödeme durum raporu
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-end sm:self-auto">
            <span className="text-[11px] text-slate-500 hidden md:inline">
              Son Güncelleme: {lastUpdated.toLocaleTimeString('tr-TR')}
            </span>

            <button
              id="btn-refresh-global-stats"
              type="button"
              onClick={() => fetchGlobalStats(false)}
              disabled={refreshing}
              className="px-3 py-1.5 bg-[#0e1d35] hover:bg-[#142646] text-blue-300 hover:text-white rounded-lg text-xs font-semibold border border-blue-900 transition flex items-center gap-1.5"
              title="Tüm Tabloları Yeniden Tara"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-400' : ''}`} />
              <span>Yenile</span>
            </button>

            <button
              id="btn-toggle-site-breakdown"
              type="button"
              onClick={() => setShowBreakdown(!showBreakdown)}
              className="px-3.5 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 hover:text-white rounded-lg text-xs font-bold border border-blue-500/40 transition flex items-center gap-1.5"
            >
              <span>{showBreakdown ? 'Şantiye Dağılımını Gizle' : 'Şantiye Dağılım Raporu'}</span>
              {showBreakdown ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* 4 MAIN GLOBAL STAT CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* 1. TOPLAM TALEP TUTARI */}
          <div className="bg-[#0b172a] border border-blue-800/60 hover:border-blue-600/80 rounded-2xl p-4 transition-all shadow-lg flex flex-col justify-between group">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-400">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-blue-200 uppercase tracking-wider">
                  GENEL TOPLAM TALEP
                </span>
              </div>
              <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-blue-950 text-blue-300 border border-blue-900 font-bold">
                {globalTotalCount} Talep
              </span>
            </div>
            <div>
              <div className="font-mono text-2xl font-black text-white tracking-tight group-hover:text-blue-300 transition-colors">
                {formatCurrency(globalTotalTutar)}
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1.5 pt-1.5 border-t border-blue-950">
                <span>7 Şantiye Tablosu</span>
                <span className="text-blue-400 font-bold">%100 Genel Toplam</span>
              </div>
            </div>
          </div>

          {/* 2. ÖDENSİN (ONAYLANAN) TUTARI */}
          <div className="bg-[#091f1a] border border-emerald-800/60 hover:border-emerald-500/80 rounded-2xl p-4 transition-all shadow-lg flex flex-col justify-between group">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider">
                  ÖDENSİN TUTARI
                </span>
              </div>
              <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold">
                {globalOdensinCount} Onaylı
              </span>
            </div>
            <div>
              <div className="font-mono text-2xl font-black text-emerald-400 tracking-tight group-hover:text-emerald-300 transition-colors">
                {formatCurrency(globalOdensinTutar)}
              </div>
              <div className="flex items-center justify-between text-[11px] text-emerald-300/80 mt-1.5 pt-1.5 border-t border-emerald-950">
                <span>Onaylanan Ödemeler</span>
                <span className="font-bold text-emerald-300">
                  %{getPercentage(globalOdensinTutar, globalTotalTutar)} Pay
                </span>
              </div>
            </div>
          </div>

          {/* 3. BEKLESİN (ONAY BEKLEYEN) TUTARI */}
          <div className="bg-[#241a0b] border border-amber-800/60 hover:border-amber-500/80 rounded-2xl p-4 transition-all shadow-lg flex flex-col justify-between group">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-400">
                  <Clock className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                  BEKLESİN TUTARI
                </span>
              </div>
              <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-amber-950 text-amber-300 border border-amber-800 font-bold">
                {globalBeklesinCount} Bekleyen
              </span>
            </div>
            <div>
              <div className="font-mono text-2xl font-black text-amber-400 tracking-tight group-hover:text-amber-300 transition-colors">
                {formatCurrency(globalBeklesinTutar)}
              </div>
              <div className="flex items-center justify-between text-[11px] text-amber-300/80 mt-1.5 pt-1.5 border-t border-amber-950">
                <span>Onay Bekleyenler</span>
                <span className="font-bold text-amber-300">
                  %{getPercentage(globalBeklesinTutar, globalTotalTutar)} Pay
                </span>
              </div>
            </div>
          </div>

          {/* 4. ÖDENMESİN (REDDEDİLEN) TUTARI */}
          <div className="bg-[#240e14] border border-rose-800/60 hover:border-rose-500/80 rounded-2xl p-4 transition-all shadow-lg flex flex-col justify-between group">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-rose-500/20 border border-rose-400/30 flex items-center justify-center text-rose-400">
                  <XCircle className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-rose-300 uppercase tracking-wider">
                  ÖDENMESİN TUTARI
                </span>
              </div>
              <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-rose-950 text-rose-300 border border-rose-800 font-bold">
                {globalOdenmesinCount} Red
              </span>
            </div>
            <div>
              <div className="font-mono text-2xl font-black text-rose-400 tracking-tight group-hover:text-rose-300 transition-colors">
                {formatCurrency(globalOdenmesinTutar)}
              </div>
              <div className="flex items-center justify-between text-[11px] text-rose-300/80 mt-1.5 pt-1.5 border-t border-rose-950">
                <span>Reddedilen / İptal</span>
                <span className="font-bold text-rose-300">
                  %{getPercentage(globalOdenmesinTutar, globalTotalTutar)} Pay
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* EXPANDABLE SITE-BY-SITE DETAILED BREAKDOWN */}
        {showBreakdown && (
          <div className="mt-4 bg-[#0a1424] border border-blue-900/80 rounded-2xl p-4 sm:p-5 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-blue-950">
              <h4 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-400" />
                <span>Şantiye Bazında Detaylı Talep & Ödeme Raporu</span>
              </h4>
              <span className="text-xs text-blue-300/70">
                Şantiyeye tıklayarak o şantiyenin tablosuna hızlıca geçiş yapabilirsiniz
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#060c16] text-[11px] uppercase tracking-wider text-blue-300/80 border-b border-blue-900/60">
                    <th className="py-2.5 px-3 font-bold">Şantiye Adı / Tablo</th>
                    <th className="py-2.5 px-3 font-bold text-center">Talep Adedi</th>
                    <th className="py-2.5 px-3 font-bold text-right">Toplam Tutar (₺)</th>
                    <th className="py-2.5 px-3 font-bold text-right text-emerald-400">Ödensin (₺)</th>
                    <th className="py-2.5 px-3 font-bold text-right text-amber-400">Beklesin (₺)</th>
                    <th className="py-2.5 px-3 font-bold text-right text-rose-400">Ödenmesin (₺)</th>
                    <th className="py-2.5 px-3 text-center">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-950/80">
                  {siteStatsList.map((st) => {
                    const isActive = activeSiteId === st.site.id;
                    return (
                      <tr
                        key={st.site.id}
                        onClick={() => onSelectSite && onSelectSite(st.site)}
                        className={`cursor-pointer transition-colors ${
                          isActive
                            ? 'bg-blue-900/30 font-semibold'
                            : 'hover:bg-blue-950/40'
                        }`}
                      >
                        {/* Şantiye Adı */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                            <span className="font-bold text-slate-100">{st.site.name}</span>
                            <span className="text-[10px] font-mono text-slate-500">
                              ({st.site.tableName})
                            </span>
                          </div>
                        </td>

                        {/* Toplam Kayıt */}
                        <td className="py-2.5 px-3 text-center whitespace-nowrap font-mono font-bold text-blue-300">
                          {st.count}
                        </td>

                        {/* Toplam Tutar */}
                        <td className="py-2.5 px-3 text-right whitespace-nowrap font-mono font-bold text-white">
                          {formatCurrency(st.totalTutar)}
                        </td>

                        {/* Ödensin */}
                        <td className="py-2.5 px-3 text-right whitespace-nowrap font-mono font-bold text-emerald-400">
                          {formatCurrency(st.odensinTutar)}
                          <span className="text-[10px] text-emerald-500/80 font-normal ml-1">
                            ({st.odensinCount})
                          </span>
                        </td>

                        {/* Beklesin */}
                        <td className="py-2.5 px-3 text-right whitespace-nowrap font-mono font-bold text-amber-400">
                          {formatCurrency(st.beklesinTutar)}
                          <span className="text-[10px] text-amber-500/80 font-normal ml-1">
                            ({st.beklesinCount})
                          </span>
                        </td>

                        {/* Ödenmesin */}
                        <td className="py-2.5 px-3 text-right whitespace-nowrap font-mono font-bold text-rose-400">
                          {formatCurrency(st.odenmesinTutar)}
                          <span className="text-[10px] text-rose-500/80 font-normal ml-1">
                            ({st.odenmesinCount})
                          </span>
                        </td>

                        {/* Git Butonu */}
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onSelectSite) onSelectSite(st.site);
                            }}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-bold inline-flex items-center gap-1 transition ${
                              isActive
                                ? 'bg-blue-600 text-white'
                                : 'bg-[#142646] hover:bg-blue-600 text-blue-300 hover:text-white'
                            }`}
                          >
                            <span>Görüntüle</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-[#060c16] font-bold border-t border-blue-800 text-slate-100">
                    <td className="py-3 px-3 uppercase tracking-wider text-blue-300">
                      GENEL TOPLAM ({SITES.length} ŞANTİYE)
                    </td>
                    <td className="py-3 px-3 text-center font-mono text-blue-300">
                      {globalTotalCount}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-white text-sm">
                      {formatCurrency(globalTotalTutar)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-emerald-400 text-sm">
                      {formatCurrency(globalOdensinTutar)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-amber-400 text-sm">
                      {formatCurrency(globalBeklesinTutar)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-rose-400 text-sm">
                      {formatCurrency(globalOdenmesinTutar)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
