import React, { useState, useEffect } from 'react';
import { FileText, Loader2, Files, ExternalLink } from 'lucide-react';
import { TalepRecord } from '../types';
import { FaturaInfo, getFaturaListForRecord, getCachedFaturaList } from '../lib/faturaService';

interface FaturaGosterButtonProps {
  rowId: string | number;
  firmaUnvani: string;
  record: TalepRecord;
  onOpenFatura?: (record: TalepRecord, info: FaturaInfo, list?: FaturaInfo[]) => void;
  onNoFatura: (firmaUnvani: string) => void;
}

export const FaturaGosterButton: React.FC<FaturaGosterButtonProps> = ({
  rowId,
  firmaUnvani,
  record,
  onOpenFatura,
  onNoFatura
}) => {
  const recId = record.id ?? record._tempId ?? rowId;
  const cachedList = getCachedFaturaList(firmaUnvani, recId);
  const [faturaList, setFaturaList] = useState<FaturaInfo[]>(cachedList ?? []);
  const [status, setStatus] = useState<'checking' | 'found' | 'not_found'>(
    cachedList !== undefined ? (cachedList.length > 0 ? 'found' : 'not_found') : 'checking'
  );

  useEffect(() => {
    let isMounted = true;

    getFaturaListForRecord(recId, firmaUnvani)
      .then((list) => {
        if (!isMounted) return;
        setFaturaList(list);
        setStatus(list.length > 0 ? 'found' : 'not_found');
      })
      .catch(() => {
        if (!isMounted) return;
        setFaturaList([]);
        setStatus('not_found');
      });

    return () => {
      isMounted = false;
    };
  }, [recId, firmaUnvani]);

  if (status === 'checking') {
    return (
      <button
        id={`btn-fatura-${rowId}`}
        type="button"
        disabled
        className="inline-flex items-center gap-1 self-start px-2 py-0.5 rounded-md text-[10.5px] font-medium transition-all bg-slate-50 text-slate-400 border border-slate-200 cursor-wait whitespace-nowrap shadow-2xs"
        title={`${firmaUnvani} evrak kontrolü yapılıyor...`}
      >
        <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
        <span>FATURA GÖSTER</span>
      </button>
    );
  }

  // YEŞİL BUTON: Evrak mevcut -> Tıklandığında linki yeni sekmede aç (Fatura & Evrak Görüntüleme modali açılmaz)
  if (status === 'found' && faturaList.length > 0) {
    const count = faturaList.length;

    // Tek evrak varsa
    if (count === 1) {
      return (
        <a
          id={`btn-fatura-${rowId}`}
          href={faturaList[0].url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.stopPropagation();
          }}
          className="inline-flex items-center gap-1 self-start px-2 py-0.5 rounded-md text-[10.5px] font-bold transition-all bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 cursor-pointer shadow-2xs hover:shadow-xs active:scale-95 whitespace-nowrap"
          title={`${firmaUnvani} - Faturayı yeni sekmede aç (${faturaList[0].fileName})`}
        >
          <FileText className="w-3 h-3 text-emerald-100" />
          <span>FATURA GÖSTER</span>
          <ExternalLink className="w-3 h-3 text-emerald-200" />
        </a>
      );
    }

    // Birden fazla evrak varsa: 1. evrak ana buton, diğerleri ek buton olarak hepsi yeni sekmede açılır
    return (
      <div className="flex flex-wrap items-center gap-1">
        <a
          id={`btn-fatura-${rowId}`}
          href={faturaList[0].url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.stopPropagation();
          }}
          className="inline-flex items-center gap-1 self-start px-2 py-0.5 rounded-md text-[10.5px] font-bold transition-all bg-emerald-700 hover:bg-emerald-800 text-white border border-emerald-800 ring-1 ring-emerald-500/50 cursor-pointer shadow-2xs hover:shadow-xs active:scale-95 whitespace-nowrap"
          title={`${faturaList[0].fileName} - 1. Evrakı yeni sekmede aç`}
        >
          <Files className="w-3.5 h-3.5 text-emerald-200" />
          <span>FATURA GÖSTER (1)</span>
          <ExternalLink className="w-3 h-3 text-emerald-200" />
        </a>
        {faturaList.slice(1).map((doc, idx) => {
          const num = doc.sequenceNumber ?? idx + 2;
          return (
            <a
              key={doc.url || idx}
              href={doc.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold transition-all bg-emerald-800 hover:bg-emerald-900 text-emerald-100 border border-emerald-700 cursor-pointer shadow-2xs active:scale-95 whitespace-nowrap"
              title={`${doc.fileName} - ${num}. Evrakı yeni sekmede aç`}
            >
              <span>Evrak {num}</span>
              <ExternalLink className="w-2.5 h-2.5 text-emerald-300" />
            </a>
          );
        })}
      </div>
    );
  }

  const handleClickNotFound = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setStatus('checking');
    try {
      const freshList = await getFaturaListForRecord(recId, firmaUnvani, true);
      if (freshList && freshList.length > 0) {
        setFaturaList(freshList);
        setStatus('found');
        // Bulunan faturayı doğrudan yeni sekmede aç (iç modal açılmaz)
        window.open(freshList[0].url, '_blank', 'noopener,noreferrer');
      } else {
        setStatus('not_found');
        onNoFatura(firmaUnvani);
      }
    } catch {
      setStatus('not_found');
      onNoFatura(firmaUnvani);
    }
  };

  // FARKLI RENK BUTON (Gri/Slate): Evrak yok -> tıklandığında anlık tekrar kontrol eder, bulunursa yeni sekmede açar
  return (
    <button
      id={`btn-fatura-${rowId}`}
      type="button"
      onClick={handleClickNotFound}
      className="inline-flex items-center gap-1 self-start px-2 py-0.5 rounded-md text-[10.5px] font-bold transition-all bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-800 border border-slate-300 cursor-pointer shadow-2xs active:scale-95 whitespace-nowrap"
      title={`${firmaUnvani} - CARIFATURALAR klasöründe bu firmanın tam adıyla kayıtlı evrak aranır`}
    >
      <FileText className="w-3 h-3 text-slate-400" />
      <span>FATURA GÖSTER</span>
    </button>
  );
};
