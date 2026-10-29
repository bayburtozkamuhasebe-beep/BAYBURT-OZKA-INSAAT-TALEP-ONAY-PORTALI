import React, { useState, useEffect } from 'react';
import { SITES, SiteConfig, TalepRecord } from './types';
import { Header } from './components/Header';
import { GlobalSummaryReport } from './components/GlobalSummaryReport';
import { SiteView } from './components/SiteView';
import { PaymentExecutionPage } from './components/PaymentExecutionPage';
import { MuavinViewerPage } from './components/MuavinViewerPage';
import { supabase } from './lib/supabase';

export default function App() {
  const [activeSite, setActiveSite] = useState<SiteConfig>(SITES[0]);
  const [siteCounts, setSiteCounts] = useState<Record<string, number>>({});
  const [viewMode, setViewMode] = useState<'talepler' | 'odemeler' | 'muavin'>('talepler');
  const [muavinSiteKey, setMuavinSiteKey] = useState<string>('arnavutkoy');
  const [muavinRecord, setMuavinRecord] = useState<TalepRecord | null>(null);

  // Fetch count of records for each site in parallel
  const refreshAllCounts = React.useCallback(async () => {
    const counts: Record<string, number> = {};

    await Promise.all(
      SITES.map(async (site) => {
        try {
          const { count, error } = await supabase
            .from(site.tableName)
            .select('*', { count: 'exact', head: true });

          if (!error && typeof count === 'number') {
            counts[site.id] = count;
          } else {
            // fallback select
            const res = await supabase.from(site.tableName).select('id');
            if (res.data) {
              counts[site.id] = res.data.length;
            }
          }
        } catch {
          // silent fallback
        }
      })
    );

    setSiteCounts(counts);
  }, []);

  useEffect(() => {
    refreshAllCounts();
    const interval = setInterval(refreshAllCounts, 5000);
    return () => clearInterval(interval);
  }, [refreshAllCounts]);

  const totalAllRecords = Object.values(siteCounts).reduce<number>(
    (a, b) => a + (typeof b === 'number' ? b : 0),
    0
  );

  const handleRecordCountChange = React.useCallback(
    (count: number) => {
      if (activeSite.id !== 'all') {
        setSiteCounts((prev) => ({
          ...prev,
          [activeSite.id]: count
        }));
      }
    },
    [activeSite.id]
  );

  return (
    <div className="min-h-screen bg-[#0b172a] text-slate-100 flex flex-col font-['Plus_Jakarta_Sans',sans-serif]">
      {/* Top Navigation and Main Portal Header */}
      <Header
        activeSite={activeSite}
        onSelectSite={(site) => {
          setActiveSite(site);
          setViewMode('talepler');
        }}
        siteCounts={siteCounts}
        totalAllRecords={totalAllRecords}
        currentView={viewMode}
        onViewChange={(view) => setViewMode(view)}
      />

      {/* Conditional Rendering based on viewMode */}
      {viewMode === 'muavin' ? (
        <main className="flex-1 bg-[#070e1b] animate-fade-in">
          <MuavinViewerPage
            key={muavinSiteKey + '_' + (muavinRecord?.id || 'none')}
            initialSiteKey={muavinSiteKey}
            record={muavinRecord}
            onBackToTalepList={() => {
              setViewMode('talepler');
              refreshAllCounts();
            }}
          />
        </main>
      ) : viewMode === 'odemeler' ? (
        <main className="flex-1 pb-16 bg-[#0f1d33]/50 animate-fade-in">
          <PaymentExecutionPage
            onBackToRequests={() => {
              setViewMode('talepler');
              refreshAllCounts();
            }}
            onOpenMuavinPage={(siteKey, record) => {
              setMuavinSiteKey(siteKey);
              setMuavinRecord(record);
              setViewMode('muavin');
            }}
          />
        </main>
      ) : (
        <>
          {/* Global Summary Report of All Tables (Beyaz/Aydınlık ve Kapsamlı Özet) */}
          <GlobalSummaryReport
            activeSiteId={activeSite.id}
            onSelectSite={(site) => {
              setActiveSite(site);
              setViewMode('talepler');
            }}
          />

          {/* Main Content Area - Active Site / All Sites View */}
          <main className="flex-1 pb-16 bg-[#0f1d33]/50">
            <SiteView
              key={activeSite.id}
              site={activeSite}
              onRecordCountChange={handleRecordCountChange}
              onNavigateToSite={(site) => {
                setActiveSite(site);
                setViewMode('talepler');
              }}
              onOpenPaymentExecutionPage={() => setViewMode('odemeler')}
              onOpenMuavinPage={(siteKey, record) => {
                setMuavinSiteKey(siteKey);
                setMuavinRecord(record);
                setViewMode('muavin');
              }}
            />
          </main>
        </>
      )}

      {/* Minimal Clean Footer */}
      <footer className="bg-[#08111e] border-t border-blue-950/80 py-5 text-center text-xs text-blue-300/70">
        <div className="w-full max-w-[1750px] mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
            <span className="font-semibold text-slate-300">
              BAYBURT ÖZKA İNŞAAT © {new Date().getFullYear()} — Talep & Ödeme Takip Portalı
            </span>
            <span className="hidden sm:inline text-slate-600">|</span>
            <span className="font-bold text-sky-400 tracking-wide text-xs">
              TASARIM VE YAZILIM: Emirhan KALHAN
            </span>
          </div>
          <span className="font-mono text-[11px] text-emerald-400 font-bold bg-emerald-950/60 border border-emerald-800/40 px-3 py-1 rounded-full flex items-center gap-1.5 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Canlı Supabase Veritabanı Aktif
          </span>
        </div>
      </footer>
    </div>
  );
}
