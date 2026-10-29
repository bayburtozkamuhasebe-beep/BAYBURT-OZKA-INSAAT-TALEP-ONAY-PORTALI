import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { TalepRecord, SITES, ODENECEK_SITES } from '../types';
import { supabase } from './supabase';
import { ROBOTO_REGULAR_BASE64, ROBOTO_BOLD_BASE64 } from './pdfFonts';
import {
  getFirmaUnvani,
  getIban,
  getAciklama,
  getTutar,
  getTalepEden,
  getRecordStatus,
  getTarih,
  getNotlar,
  formatCurrency,
  getCariBakiye,
  formatCariBakiyeDisplay,
  parseCariBakiyeNumber
} from './recordUtils';

export interface ExportOptions {
  title?: string;
  siteName?: string;
  statusFilter?: 'ALL' | 'ÖDENSİN' | 'BEKLESİN' | 'ÖDENMESİN';
}

/**
 * Configure Turkish character supporting TrueType fonts (Roboto) into jsPDF instance
 */
export const setupTurkishFont = (doc: jsPDF): void => {
  try {
    doc.addFileToVFS('Roboto-Regular.ttf', ROBOTO_REGULAR_BASE64);
    doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
    doc.addFileToVFS('Roboto-Bold.ttf', ROBOTO_BOLD_BASE64);
    doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold');
    doc.setFont('Roboto', 'normal');
  } catch (err) {
    console.error('Error setting up Turkish font in jsPDF:', err);
  }
};

/**
 * Prepares clean tabular data from TalepRecord array
 */
export const prepareExportData = (records: TalepRecord[]) => {
  return records.map((r, index) => {
    return {
      'Sıra': index + 1,
      'Şantiye': r._siteName || '',
      'Firma Ünvanı': getFirmaUnvani(r),
      'İBAN No': getIban(r) === '-' ? '' : getIban(r),
      'Açıklama': getAciklama(r),
      'Ödenecek Tutar (TL)': getTutar(r),
      'Cari Bakiye': getCariBakiye(r),
      'Talep Eden': getTalepEden(r),
      'Durum': getRecordStatus(r),
      'Tarih': getTarih(r) || '',
      'Notlar': getNotlar(r)
    };
  });
};

/**
 * Export records to Excel (.xlsx)
 */
export const exportToExcel = (
  records: TalepRecord[],
  filenamePrefix: string = 'Talep_Listesi',
  statusOnly?: 'ÖDENSİN' | 'BEKLESİN' | 'ÖDENMESİN'
) => {
  let exportItems = records;
  if (statusOnly) {
    exportItems = records.filter((r) => getRecordStatus(r) === statusOnly);
  }

  if (exportItems.length === 0) {
    return { success: false, count: 0, message: 'Dışa aktarılacak kayıt bulunamadı.' };
  }

  const rows = prepareExportData(exportItems);

  // Create worksheet
  const worksheet = XLSX.utils.json_to_sheet(rows);

  // Set column widths
  worksheet['!cols'] = [
    { wch: 6 },  // Sıra
    { wch: 18 }, // Şantiye
    { wch: 30 }, // Firma
    { wch: 32 }, // İBAN
    { wch: 35 }, // Açıklama
    { wch: 18 }, // Tutar
    { wch: 20 }, // Talep Eden
    { wch: 14 }, // Durum
    { wch: 14 }, // Tarih
    { wch: 25 }, // Notlar
  ];

  const workbook = XLSX.utils.book_new();
  const sheetName = statusOnly ? statusOnly.substring(0, 31) : 'Talepler';
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  const dateStr = new Date().toISOString().split('T')[0];
  const safePrefix = filenamePrefix.replace(/[^a-zA-Z0-9_\u00C0-\u017F-]/g, '_');
  const fullFilename = `${safePrefix}_${statusOnly ? statusOnly + '_' : ''}${dateStr}.xlsx`;

  XLSX.writeFile(workbook, fullFilename);

  return {
    success: true,
    count: exportItems.length,
    filename: fullFilename,
    message: `${exportItems.length} adet kayıt "${fullFilename}" dosyasına aktarıldı.`
  };
};

/**
 * Export records to PDF with jsPDF & AutoTable
 */
export const exportToPDF = (
  records: TalepRecord[],
  title: string = 'ÖDEME VE TALEP LİSTESİ',
  filenamePrefix: string = 'Talep_Listesi'
) => {
  if (records.length === 0) {
    return { success: false, count: 0, message: 'Dışa aktarılacak kayıt bulunamadı.' };
  }

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });
  setupTurkishFont(doc);

  const totalTutar = records.reduce((sum, r) => sum + getTutar(r), 0);
  const odensinTotal = records.filter(r => getRecordStatus(r) === 'ÖDENSİN').reduce((sum, r) => sum + getTutar(r), 0);
  const beklesinTotal = records.filter(r => getRecordStatus(r) === 'BEKLESİN').reduce((sum, r) => sum + getTutar(r), 0);
  const odenmesinTotal = records.filter(r => getRecordStatus(r) === 'ÖDENMESİN').reduce((sum, r) => sum + getTutar(r), 0);

  // Document Title Header
  doc.setFont('Roboto', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text(title, 14, 15);

  doc.setFont('Roboto', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  const dateStr = new Date().toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  doc.text(`Rapor Tarihi: ${dateStr} • Toplam: ${records.length} Kayıt • Genel Tutar: ${formatCurrency(totalTutar)}`, 14, 21);

  // Summary chips text
  doc.setFontSize(8);
  doc.text(
    `Ödensin: ${formatCurrency(odensinTotal)} | Beklesin: ${formatCurrency(beklesinTotal)} | Ödenmesin: ${formatCurrency(odenmesinTotal)}`,
    14,
    26
  );

  const tableHeaders = [
    ['#', 'FİRMA ÜNVANI', 'İBAN NO', 'AÇIKLAMA', 'TUTAR (TL)', 'CARİ BAKİYE', 'TALEP EDEN', 'DURUM']
  ];

  const tableBody = records.map((r, i) => [
    i + 1,
    getFirmaUnvani(r),
    getIban(r) === '-' ? '' : getIban(r),
    getAciklama(r),
    formatCurrency(getTutar(r)),
    formatCariBakiyeDisplay(getCariBakiye(r)),
    getTalepEden(r),
    getRecordStatus(r)
  ]);

  autoTable(doc, {
    head: tableHeaders,
    body: tableBody,
    startY: 29,
    styles: {
      font: 'Roboto',
      fontSize: 8,
      cellPadding: 2,
      overflow: 'linebreak',
      textColor: [30, 41, 59]
    },
    headStyles: {
      font: 'Roboto',
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'left'
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 46 },
      2: { cellWidth: 50 },
      3: { cellWidth: 60 },
      4: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
      5: { cellWidth: 28, halign: 'right', fontStyle: 'bold', textColor: [0, 0, 0] },
      6: { cellWidth: 30 },
      7: { cellWidth: 24, halign: 'center', fontStyle: 'bold' }
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 7) {
        const text = String(data.cell.raw);
        if (text === 'ÖDENSİN') {
          data.cell.styles.textColor = [16, 120, 60];
        } else if (text === 'ÖDENMESİN') {
          data.cell.styles.textColor = [190, 25, 40];
        } else if (text === 'BEKLESİN') {
          data.cell.styles.textColor = [180, 100, 10];
        }
      }
    },
    margin: { top: 30, left: 14, right: 14, bottom: 15 }
  });

  const safePrefix = filenamePrefix.replace(/[^a-zA-Z0-9_\u00C0-\u017F-]/g, '_');
  const fullFilename = `${safePrefix}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fullFilename);

  return {
    success: true,
    count: records.length,
    filename: fullFilename,
    message: `${records.length} adet kayıt "${fullFilename}" dosyasına aktarıldı.`
  };
};

/**
 * Export single site odenecek table to PDF according to user specification:
 * - Sayfalar yatay (Landscape A4)
 * - Alt toplamları olsun (Subtotal footer with total amount and count)
 * - Türkçe karakterler gösterilsin (Embedded Roboto TTF font)
 * - Başlıklar renkli, alt toplamlar farklı renk olsun (Dark blue/slate header, Warm amber/gold footer)
 * - Firma Ünvanı, Açıklama, Ödenecek Tutar sütunları aktarılsın (plus row number)
 * - Toplam kaç adet kayıt, toplam tutar bunları da yazsın (in header banner & table foot)
 */
export const exportOdenecekTableToPDF = (
  siteName: string,
  records: TalepRecord[],
  filenamePrefix?: string
) => {
  if (records.length === 0) {
    return { success: false, count: 0, message: 'Dışa aktarılacak kayıt bulunamadı.' };
  }

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });
  setupTurkishFont(doc);

  const totalCount = records.length;
  const totalTutar = records.reduce((sum, r) => sum + getTutar(r), 0);

  const dateNow = new Date();
  const dateStr = dateNow.toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  // 1. Prestijli Üst Başlık Kartı
  doc.setFillColor(15, 23, 42); // #0f172a Koyu Lacivert / Slate-900
  doc.roundedRect(13.5, 10, 270, 18, 2, 2, 'F');

  // Sol renkli vurgu şeridi
  doc.setFillColor(37, 99, 235); // Blue-600
  doc.rect(13.5, 10, 4, 18, 'F');

  // Başlık Metni
  doc.setTextColor(255, 255, 255);
  doc.setFont('Roboto', 'bold');
  doc.setFontSize(12);
  doc.text(`BAYBURT ÖZKA İNŞAAT — ${siteName.toUpperCase()} ÖDENECEK LİSTESİ`, 22, 17.5);

  // Alt Bilgi Şeridi
  doc.setFont('Roboto', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(191, 219, 254);
  doc.text(`Rapor Tarihi: ${dateStr}   •   Ödemeleri Gerçekleştir Portalı`, 22, 24);

  // Sağ tarafta Özet Bilgi Kutuları (TOPLAM KAYIT & TOPLAM TUTAR)
  // Kutu 1: Toplam Kayıt
  doc.setFillColor(30, 41, 59); // slate-800
  doc.roundedRect(196, 12, 36, 14, 1.5, 1.5, 'F');
  doc.setFont('Roboto', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text('TOPLAM KAYIT', 214, 16.5, { align: 'center' });
  doc.setFont('Roboto', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(255, 255, 255);
  doc.text(`${totalCount} Adet`, 214, 22.5, { align: 'center' });

  // Kutu 2: Toplam Tutar
  doc.setFillColor(6, 78, 59); // emerald-900
  doc.roundedRect(235, 12, 45, 14, 1.5, 1.5, 'F');
  doc.setFont('Roboto', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(167, 243, 208);
  doc.text('TOPLAM TUTAR', 257.5, 16.5, { align: 'center' });
  doc.setFont('Roboto', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(52, 211, 153); // emerald-400
  doc.text(formatCurrency(totalTutar), 257.5, 22.5, { align: 'center' });

  // 2. İstenen Sütunlar:
  // - FİRMA ÜNVANI
  // - AÇIKLAMA
  // - ÖDENECEK TUTAR
  const tableHeaders = [
    ['#', 'FİRMA ÜNVANI', 'AÇIKLAMA', 'ÖDENECEK TUTAR (TL)']
  ];

  const tableBody = records.map((r, i) => [
    i + 1,
    getFirmaUnvani(r),
    getAciklama(r),
    formatCurrency(getTutar(r))
  ]);

  // 3. Alt Toplam Satırı (Farklı Renkli Vurgu & Toplam Kayıt ve Toplam Tutar)
  const tableFoot = [
    [
      '',
      `${siteName.toUpperCase()} TOPLAMI:`,
      `Toplam ${totalCount} Adet Kayıt`,
      formatCurrency(totalTutar)
    ]
  ];

  autoTable(doc, {
    startY: 32,
    head: tableHeaders,
    body: tableBody,
    foot: tableFoot,
    showFoot: 'lastPage',
    styles: {
      font: 'Roboto',
      fontSize: 8.5,
      cellPadding: 2.8,
      overflow: 'linebreak',
      textColor: [15, 23, 42],
      lineColor: [226, 232, 240],
      lineWidth: 0.2
    },
    headStyles: {
      font: 'Roboto',
      fontStyle: 'bold',
      fillColor: [24, 49, 83], // Renkli Başlık (Derin Lacivert / Royal Blue)
      textColor: [255, 255, 255],
      fontSize: 9,
      halign: 'left'
    },
    footStyles: {
      font: 'Roboto',
      fontStyle: 'bold',
      fillColor: [254, 240, 138], // Alt Toplamlar Farklı Renk (Belirgin Amber/Altın)
      textColor: [120, 53, 15],   // Koyu kahverengi/amber metin
      fontSize: 9.5,
      halign: 'left'
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252] // Çok açık yumuşak gri
    },
    columnStyles: {
      0: { cellWidth: 14, halign: 'center' },
      1: { cellWidth: 95, fontStyle: 'bold' },
      2: { cellWidth: 120 },
      3: { cellWidth: 41, halign: 'right', fontStyle: 'bold' }
    },
    didParseCell: (data) => {
      if (data.section === 'head' && data.column.index === 0) {
        data.cell.styles.halign = 'center';
      }
      if (data.section === 'head' && data.column.index === 3) {
        data.cell.styles.halign = 'right';
      }
      if (data.section === 'foot') {
        if (data.column.index === 1) {
          data.cell.styles.fontStyle = 'bold';
        }
        if (data.column.index === 2) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.textColor = [146, 64, 14];
        }
        if (data.column.index === 3) {
          data.cell.styles.halign = 'right';
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.textColor = [120, 53, 15];
        }
      }
    },
    margin: { top: 15, left: 13.5, right: 13.5, bottom: 14 }
  });

  // 4. Her Sayfaya Sayfa Numaraları ve Alt Bilgi Ekleme
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('Roboto', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `BAYBURT ÖZKA İNŞAAT — ${siteName} • Rapor Tarihi: ${dateStr} • Toplam: ${totalCount} Kayıt • Tutar: ${formatCurrency(totalTutar)} • Sayfa ${p} / ${totalPages}`,
      13.5,
      203
    );
    doc.text(
      'Ödemeleri Gerçekleştir Portalı',
      283.5,
      203,
      { align: 'right' }
    );
  }

  const prefix = filenamePrefix || `${siteName}_Odenecekler_Listesi`;
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_\u00C0-\u017F-]/g, '_');
  const fullFilename = `${safePrefix}_${dateNow.toISOString().split('T')[0]}.pdf`;

  doc.save(fullFilename);

  return {
    success: true,
    count: totalCount,
    filename: fullFilename,
    message: `${siteName} tablosu (${totalCount} kayıt) "${fullFilename}" dosyasına başarıyla aktarıldı.`
  };
};

export interface ExportAllSitesPDFParams {
  viewMode?: 'talepler' | 'odemeler';
  tablesData?: Array<{
    siteName: string;
    tableName: string;
    records: TalepRecord[];
  }>;
  filenamePrefix?: string;
  onProgress?: (message: string) => void;
}

/**
 * Export all 7 sites' tables into a single PDF document:
 * - Each site has its own separate title banner and table (AYRI AYRI).
 * - Subtotals for each site (ALT TOPLAMLARI OLSUN).
 * - Full Turkish character support using embedded Roboto TTF font (TÜRKÇE KARAKTERLER).
 * - Colorful headers and distinct different colored subtotals (BAŞLIKLAR RENKLİ, ALT TOPLAMLAR FARKLI RENK).
 * - Exact columns: Sıra (#), Firma Ünvanı, Açıklama, Ödenecek Tutar, Cari Bakiye, Talep Eden.
 * - Concludes with a grand consolidated summary page.
 */
export const exportAllSitesToPDF = async ({
  viewMode = 'talepler',
  tablesData,
  filenamePrefix,
  onProgress
}: ExportAllSitesPDFParams = {}) => {
  onProgress?.('Şantiye verileri hazırlanıyor...');

  let tables = tablesData;

  // If no tables provided, fetch from Supabase
  if (!tables || tables.length === 0) {
    const siteConfigs = viewMode === 'odemeler' ? ODENECEK_SITES : SITES;
    tables = [];

    for (let i = 0; i < siteConfigs.length; i++) {
      const site = siteConfigs[i];
      onProgress?.(`${site.name} tablosu taranıyor (${i + 1}/${siteConfigs.length})...`);
      try {
        const { data, error } = await supabase
          .from(site.tableName)
          .select('*')
          .order('id', { ascending: true });

        if (error || !data) {
          tables.push({
            siteName: site.name,
            tableName: site.tableName,
            records: []
          });
        } else {
          tables.push({
            siteName: site.name,
            tableName: site.tableName,
            records: data as TalepRecord[]
          });
        }
      } catch (err) {
        console.error(`Error fetching table ${site.tableName}:`, err);
        tables.push({
          siteName: site.name,
          tableName: site.tableName,
          records: []
        });
      }
    }
  }

  onProgress?.('PDF belgesi oluşturuluyor ve Türkçe karakterler yükleniyor...');

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  setupTurkishFont(doc);

  const dateNow = new Date();
  const dateStr = dateNow.toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const portalSectionName = viewMode === 'odemeler' ? 'ÖDEMELERİ GERÇEKLEŞTİR' : 'TALEP PORTALI';

  let grandTotalCount = 0;
  let grandTotalTutar = 0;
  let grandTotalCariBakiye = 0;

  const summaryRows: any[][] = [];

  // Iterate over each site: Each site has its own separate page(s) and table
  tables.forEach((t, sIdx) => {
    if (sIdx > 0) {
      doc.addPage('a4', 'landscape');
    }

    const records = t.records || [];
    const siteTotalTutar = records.reduce((sum, r) => sum + getTutar(r), 0);
    const siteTotalCariBakiye = records.reduce((sum, r) => {
      const parsed = parseCariBakiyeNumber(getCariBakiye(r));
      return sum + (parsed !== null ? parsed : 0);
    }, 0);

    grandTotalCount += records.length;
    grandTotalTutar += siteTotalTutar;
    grandTotalCariBakiye += siteTotalCariBakiye;

    summaryRows.push([
      sIdx + 1,
      t.siteName,
      t.tableName,
      `${records.length} Adet`,
      formatCurrency(siteTotalTutar),
      formatCurrency(siteTotalCariBakiye)
    ]);

    // 1. Şantiye Header Banner (Renkli & Prestijli Başlık Alanı)
    doc.setFillColor(15, 23, 42); // #0f172a Koyu Lacivert Kart
    doc.roundedRect(13.5, 10, 270, 16.5, 2, 2, 'F');

    // Sol renkli vurgu şeridi (Şantiye Ayracı)
    const stripeColors: [number, number, number][] = [
      [14, 165, 233], // cyan
      [59, 130, 246], // blue
      [99, 102, 241], // indigo
      [16, 185, 129], // emerald
      [245, 158, 11], // amber
      [168, 85, 247], // purple
      [100, 116, 139] // slate
    ];
    const stripeColor = stripeColors[sIdx % stripeColors.length];
    doc.setFillColor(stripeColor[0], stripeColor[1], stripeColor[2]);
    doc.rect(13.5, 10, 3.5, 16.5, 'F');

    // Başlık Metni
    doc.setTextColor(255, 255, 255);
    doc.setFont('Roboto', 'bold');
    doc.setFontSize(11);
    doc.text(
      `BAYBURT ÖZKA İNŞAAT — ${sIdx + 1}. ŞANTİYE: ${t.siteName.toUpperCase()}`,
      20,
      16.5
    );

    // Alt Bilgi Şeridi
    doc.setFont('Roboto', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(186, 230, 253);
    doc.text(
      `Tablo: ${t.tableName}   •   Bölüm: ${portalSectionName}   •   Kayıt: ${records.length} Adet   •   Ödenecek Toplamı: ${formatCurrency(siteTotalTutar)}   •   Cari Bakiye Toplamı: ${formatCurrency(siteTotalCariBakiye)}`,
      20,
      22
    );

    // 2. Tablo Başlıkları ve Sütunları
    // İstenen sütunlar: FİRMA ÜNVANI, AÇIKLAMA, ÖDENECEK TUTAR, CARİ BAKİYE, TALEP EDEN
    const tableHeaders = [
      ['#', 'FİRMA ÜNVANI', 'AÇIKLAMA', 'ÖDENECEK TUTAR', 'CARİ BAKİYE', 'TALEP EDEN']
    ];

    const tableBody = records.length === 0
      ? [
          ['-', 'BU ŞANTİYE TABLOSUNDA KAYIT BULUNMAMAKTADIR', '-', '0,00 TL', '0,00 TL', '-']
        ]
      : records.map((r, rIdx) => [
          rIdx + 1,
          getFirmaUnvani(r),
          getAciklama(r),
          formatCurrency(getTutar(r)),
          formatCariBakiyeDisplay(getCariBakiye(r)),
          getTalepEden(r)
        ]);

    // 3. Alt Toplam Satırı (Farklı Renkli Vurgu)
    const tableFoot = [
      [
        '',
        `${t.siteName.toUpperCase()} TOPLAMI:`,
        `${records.length} Adet Kayıt`,
        formatCurrency(siteTotalTutar),
        formatCurrency(siteTotalCariBakiye),
        ''
      ]
    ];

    autoTable(doc, {
      startY: 29.5,
      head: tableHeaders,
      body: tableBody,
      foot: tableFoot,
      styles: {
        font: 'Roboto',
        fontSize: 8,
        cellPadding: 2.2,
        overflow: 'linebreak',
        textColor: [15, 23, 42]
      },
      headStyles: {
        font: 'Roboto',
        fontStyle: 'bold',
        fillColor: [24, 49, 83], // Renkli Başlık (Derin Lacivert / Royal)
        textColor: [255, 255, 255],
        fontSize: 8.5,
        halign: 'left'
      },
      footStyles: {
        font: 'Roboto',
        fontStyle: 'bold',
        fillColor: [254, 240, 138], // Alt Toplamlar Farklı Renk (Belirgin Amber/Altın)
        textColor: [120, 53, 15],
        fontSize: 8.5
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252] // Çok açık yumuşak gri
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 68, fontStyle: 'bold' },
        2: { cellWidth: 88 },
        3: { cellWidth: 36, halign: 'right', fontStyle: 'bold' },
        4: { cellWidth: 36, halign: 'right', fontStyle: 'bold' },
        5: { cellWidth: 32, halign: 'left' }
      },
      margin: { top: 15, left: 13.5, right: 13.5, bottom: 14 }
    });
  });

  // 4. Tüm Şantiyeler Genel Konsolide Özet Sayfası (En Sonda)
  doc.addPage('a4', 'landscape');

  doc.setFillColor(15, 23, 42);
  doc.roundedRect(13.5, 10, 270, 16.5, 2, 2, 'F');
  doc.setFillColor(16, 185, 129); // Zümrüt yeşili şerit
  doc.rect(13.5, 10, 3.5, 16.5, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('Roboto', 'bold');
  doc.setFontSize(11);
  doc.text('BAYBURT ÖZKA İNŞAAT — TÜM ŞANTİYELER GENEL KONSOLİDE RAPORU', 20, 16.5);

  doc.setFont('Roboto', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(167, 243, 208);
  doc.text(
    `Sistemdeki 7 Şantiye Tablosunun Konsolide İcmali   •   Rapor Tarihi: ${dateStr}   •   Genel Toplam: ${grandTotalCount} Kayıt`,
    20,
    22
  );

  autoTable(doc, {
    startY: 29.5,
    head: [['#', 'ŞANTİYE ADI', 'TABLO ADI', 'KAYIT SAYISI', 'ÖDENECEK TUTAR TOPLAMI', 'CARİ BAKİYE TOPLAMI']],
    body: summaryRows,
    foot: [
      [
        '',
        'GENEL TOPLAM (7 ŞANTİYE):',
        '',
        `${grandTotalCount} Toplam Kayıt`,
        formatCurrency(grandTotalTutar),
        formatCurrency(grandTotalCariBakiye)
      ]
    ],
    styles: {
      font: 'Roboto',
      fontSize: 8.5,
      cellPadding: 3,
      overflow: 'linebreak',
      textColor: [15, 23, 42]
    },
    headStyles: {
      font: 'Roboto',
      fontStyle: 'bold',
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontSize: 9,
      halign: 'left'
    },
    footStyles: {
      font: 'Roboto',
      fontStyle: 'bold',
      fillColor: [220, 252, 231], // Genel Toplam Vurgusu (Ferah Açık Zümrüt)
      textColor: [6, 78, 59],
      fontSize: 9.5
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252]
    },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 70, fontStyle: 'bold' },
      2: { cellWidth: 60 },
      3: { cellWidth: 38, halign: 'center', fontStyle: 'bold' },
      4: { cellWidth: 45, halign: 'right', fontStyle: 'bold' },
      5: { cellWidth: 45, halign: 'right', fontStyle: 'bold' }
    },
    margin: { top: 15, left: 13.5, right: 13.5, bottom: 14 }
  });

  // 5. Her Sayfaya Sayfa Numaraları ve Alt Bilgi Ekleme
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('Roboto', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `BAYBURT ÖZKA İNŞAAT — Sayfa ${p} / ${totalPages}   •   Rapor Tarihi: ${dateStr}`,
      13.5,
      203
    );
    doc.text(
      'Şantiyeler Talep & Ödeme Takip Portalı',
      283.5,
      203,
      { align: 'right' }
    );
  }

  // Dosya adını oluştur ve indir
  const defaultPrefix =
    viewMode === 'odemeler'
      ? 'Tum_Santiyeler_Odenecek_Listesi'
      : 'Tum_Santiyeler_Talep_Listesi';
  const prefix = filenamePrefix || defaultPrefix;
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_\u00C0-\u017F-]/g, '_');
  const finalFilename = `${safePrefix}_${dateNow.toISOString().split('T')[0]}.pdf`;

  doc.save(finalFilename);

  return {
    success: true,
    count: grandTotalCount,
    filename: finalFilename,
    message: `Tüm 7 şantiye tablosu (${grandTotalCount} kayıt) başarıyla "${finalFilename}" dosyasına aktarıldı.`
  };
};

/**
 * Export all odenecek site tables to a single Excel sheet with separate tables, headers, and subtotals.
 */
export const exportAllOdenecekTablesToSingleSheetExcel = (
  tables: Array<{
    siteName: string;
    tableName: string;
    records: TalepRecord[];
  }>,
  filenamePrefix: string = 'Tum_Santiyeler_Odenecekler_Konsolide'
) => {
  const aoa: any[][] = [];

  const today = new Date().toLocaleDateString('tr-TR');
  aoa.push(['BAYBURT ÖZKA İNŞAAT - TÜM ŞANTİYE VE BİRİM ÖDENECEKLER KONSOLİDE LİSTESİ']);
  aoa.push([`Oluşturulma Tarihi: ${today}`]);
  aoa.push([]); // blank line

  let globalTotalAmount = 0;
  let globalTotalCount = 0;

  tables.forEach((t, tIdx) => {
    const records = t.records || [];
    const siteTotal = records.reduce((sum, r) => sum + getTutar(r), 0);
    globalTotalAmount += siteTotal;
    globalTotalCount += records.length;

    // Table Header Block
    aoa.push([`TABLO ${tIdx + 1}: ${t.siteName.toUpperCase()} (${t.tableName})`]);
    aoa.push([
      'Sıra',
      'Firma Ünvanı',
      'IBAN No',
      'Açıklama',
      'Ödenecek Tutar (TL)',
      'Cari Bakiye',
      'Talep Eden',
      'Durum',
      'Tarih',
      'Notlar'
    ]);

    if (records.length === 0) {
      aoa.push(['-', 'BU TABLODA ÖDENECEK KAYIT BULUNMAMAKTADIR', '-', '-', 0, '-', '-', '-', '-', '-']);
    } else {
      records.forEach((r, rIdx) => {
        aoa.push([
          rIdx + 1,
          getFirmaUnvani(r),
          getIban(r) === '-' ? '' : getIban(r),
          getAciklama(r),
          getTutar(r),
          getCariBakiye(r) || '-',
          getTalepEden(r),
          r.durum || r.odeme_durumu || 'ÖDENSİN',
          getTarih(r) || '',
          getNotlar(r) || ''
        ]);
      });
    }

    // Site Subtotal
    aoa.push([
      '',
      `${t.siteName} TOPLAM:`,
      '',
      '',
      siteTotal,
      `${records.length} Kayıt`,
      '',
      '',
      ''
    ]);

    // Spacers between tables
    aoa.push([]);
    aoa.push([]);
  });

  // Global Grand Total at Bottom
  aoa.push(['========================================================================================']);
  aoa.push([
    'GENEL ÖDENECEK TOPLAMI:',
    '',
    '',
    '',
    globalTotalAmount,
    `${globalTotalCount} Toplam Kayıt`,
    '',
    '',
    ''
  ]);
  aoa.push(['========================================================================================']);

  const worksheet = XLSX.utils.aoa_to_sheet(aoa);

  // Column width formatting
  worksheet['!cols'] = [
    { wch: 8 },  // Sıra
    { wch: 34 }, // Firma Ünvanı
    { wch: 34 }, // IBAN No
    { wch: 42 }, // Açıklama
    { wch: 22 }, // Tutar
    { wch: 22 }, // Talep Eden
    { wch: 16 }, // Durum
    { wch: 16 }, // Tarih
    { wch: 30 }, // Notlar
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Tüm Ödemeler');

  const fileDateStr = new Date().toISOString().split('T')[0];
  const fullFilename = `${filenamePrefix}_${fileDateStr}.xlsx`;
  XLSX.writeFile(workbook, fullFilename);

  return {
    success: true,
    count: globalTotalCount,
    filename: fullFilename,
    message: `Tüm 7 tablo (${globalTotalCount} kayıt) tek bir Excel sayfasına ayrı tablolar olarak aktarıldı.`
  };
};

export interface ExportOdensinlerPDFParams {
  viewMode?: 'talepler' | 'odemeler';
  tablesData?: Array<{
    siteName: string;
    tableName: string;
    records: TalepRecord[];
  }>;
  filenamePrefix?: string;
  onProgress?: (message: string) => void;
}

/**
 * BÜTÜN SAYFALARDAKİ TABLOLARI PDF'YE AKTAR:
 * - Sadece durumu ÖDENSİN ve BEKLESİN olanlar listelenir (ÖDENMESİN hariç tutulur).
 * - Her şantiyenin başlığı ve tablosu tek PDF içinde ayrı ayrı yer alır.
 * - Her tablonun alt toplamları (Kayıt adedi, Ödenecek Tutar, Cari Bakiye) yer alır.
 * - Türkçe karakterler (Roboto TTF) eksiksiz desteklenir.
 * - Başlıklar renkli (Zengin Zümrüt / Gece Mavisi), alt toplamlar farklı renk (Sıcak Altın / Amber) ile vurgulanır.
 * - İstenen Sütunlar:
 *   1. # (Sıra No)
 *   2. FİRMA ÜNVANI
 *   3. AÇIKLAMA
 *   4. ÖDENECEK TUTAR
 *   5. CARİ BAKİYE
 *   6. DURUMU
 *   7. TALEP EDEN
 */
export const exportOdensinlerToPDF = async ({
  viewMode = 'talepler',
  tablesData,
  filenamePrefix,
  onProgress
}: ExportOdensinlerPDFParams = {}) => {
  onProgress?.('Şantiye tabloları taranıyor...');

  let tables = tablesData;

  // If no tables provided, fetch from Supabase
  if (!tables || tables.length === 0) {
    const siteConfigs = viewMode === 'odemeler' ? ODENECEK_SITES : SITES;
    tables = [];

    for (let i = 0; i < siteConfigs.length; i++) {
      const site = siteConfigs[i];
      onProgress?.(`${site.name} tablosu taranıyor (${i + 1}/${siteConfigs.length})...`);
      try {
        const { data, error } = await supabase
          .from(site.tableName)
          .select('*')
          .order('id', { ascending: true });

        if (error || !data) {
          tables.push({
            siteName: site.name,
            tableName: site.tableName,
            records: []
          });
        } else {
          tables.push({
            siteName: site.name,
            tableName: site.tableName,
            records: data as TalepRecord[]
          });
        }
      } catch (err) {
        console.error(`Error fetching table ${site.tableName}:`, err);
        tables.push({
          siteName: site.name,
          tableName: site.tableName,
          records: []
        });
      }
    }
  }

  onProgress?.('PDF belgesi hazırlanıyor ve Türkçe karakterler yükleniyor...');

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  setupTurkishFont(doc);

  const dateNow = new Date();
  const dateStr = dateNow.toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const portalSectionName = viewMode === 'odemeler' ? 'ÖDEMELERİ GERÇEKLEŞTİR' : 'TALEP PORTALI';

  let grandTotalCount = 0;
  let grandTotalOdensinCount = 0;
  let grandTotalBeklesinCount = 0;
  let grandTotalTutar = 0;
  let grandTotalCariBakiye = 0;

  const summaryRows: any[][] = [];

  tables.forEach((t, sIdx) => {
    if (sIdx > 0) {
      doc.addPage('a4', 'landscape');
    }

    const allRecords = t.records || [];
    // SADECE DURUMU ÖDENSİN VE BEKLESİN OLANLARI LİSTELE
    // KULLANICI TALEBİ: ÖDENSİNLER ÜSTTE, BEKLESİNLER ALTTA OLSUN
    const filteredRecords = allRecords
      .filter((r) => {
        const st = getRecordStatus(r);
        return st === 'ÖDENSİN' || st === 'BEKLESİN';
      })
      .sort((a, b) => {
        const stA = getRecordStatus(a);
        const stB = getRecordStatus(b);
        if (stA === 'ÖDENSİN' && stB === 'BEKLESİN') return -1;
        if (stA === 'BEKLESİN' && stB === 'ÖDENSİN') return 1;
        return 0;
      });

    const siteOdensinCount = filteredRecords.filter((r) => getRecordStatus(r) === 'ÖDENSİN').length;
    const siteBeklesinCount = filteredRecords.filter((r) => getRecordStatus(r) === 'BEKLESİN').length;

    const siteTotalTutar = filteredRecords.reduce((sum, r) => sum + getTutar(r), 0);
    const siteTotalCariBakiye = filteredRecords.reduce((sum, r) => {
      const parsed = parseCariBakiyeNumber(getCariBakiye(r));
      return sum + (parsed !== null ? parsed : 0);
    }, 0);

    grandTotalCount += filteredRecords.length;
    grandTotalOdensinCount += siteOdensinCount;
    grandTotalBeklesinCount += siteBeklesinCount;
    grandTotalTutar += siteTotalTutar;
    grandTotalCariBakiye += siteTotalCariBakiye;

    summaryRows.push([
      sIdx + 1,
      t.siteName,
      t.tableName,
      `${siteOdensinCount} Adet`,
      `${siteBeklesinCount} Adet`,
      `${filteredRecords.length} Adet`,
      formatCurrency(siteTotalTutar),
      formatCurrency(siteTotalCariBakiye)
    ]);

    // 1. Şantiye Başlık Kartı (Prestijli & Renkli)
    doc.setFillColor(15, 23, 42); // slate-900
    doc.roundedRect(13.5, 9.5, 270, 17, 2, 2, 'F');

    // Sol taraftaki şık zümrüt yeşili onay şeridi
    doc.setFillColor(16, 185, 129); // emerald-500
    doc.rect(13.5, 9.5, 4, 17, 'F');

    // Başlık Metni
    doc.setTextColor(255, 255, 255);
    doc.setFont('Roboto', 'bold');
    doc.setFontSize(11);
    doc.text(
      `BAYBURT ÖZKA İNŞAAT — ${sIdx + 1}. ŞANTİYE: ${t.siteName.toUpperCase()} (ÖDENSİN & BEKLESİN LİSTESİ)`,
      21,
      16
    );

    // Alt Bilgi Şeridi
    doc.setFont('Roboto', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(167, 243, 208); // emerald-200
    doc.text(
      `Tablo: ${t.tableName}   •   Bölüm: ${portalSectionName}   •   Rapor Tarihi: ${dateStr}   •   Ödensin: ${siteOdensinCount}   •   Beklesin: ${siteBeklesinCount}   •   Toplam: ${filteredRecords.length} Kayıt   •   Tutar: ${formatCurrency(siteTotalTutar)}`,
      21,
      22
    );

    // 2. Tablo Sütunları: FİRMA ÜNVANI, AÇIKLAMA, ÖDENECEK TUTAR, CARİ BAKİYE, DURUMU, TALEP EDEN
    const tableHeaders = [
      ['#', 'FİRMA ÜNVANI', 'AÇIKLAMA', 'ÖDENECEK TUTAR', 'CARİ BAKİYE', 'DURUMU', 'TALEP EDEN']
    ];

    const tableBody = filteredRecords.length === 0
      ? [
          ['-', 'BU ŞANTİYEDE ÖDENSİN VEYA BEKLESİN DURUMUNDA KAYIT BULUNMAMAKTADIR', '-', '0,00 TL', '0,00 TL', '-', '-']
        ]
      : filteredRecords.map((r, rIdx) => [
          rIdx + 1,
          getFirmaUnvani(r),
          getAciklama(r),
          formatCurrency(getTutar(r)),
          formatCariBakiyeDisplay(getCariBakiye(r)),
          getRecordStatus(r),
          getTalepEden(r)
        ]);

    // 3. Alt Toplam Satırı (FARKLI RENK: Sıcak Altın/Amber)
    const tableFoot = [
      [
        '',
        `${t.siteName.toUpperCase()} ALT TOPLAMI:`,
        `Kayıt: ${filteredRecords.length} (Ödensin: ${siteOdensinCount}, Beklesin: ${siteBeklesinCount})`,
        formatCurrency(siteTotalTutar),
        formatCurrency(siteTotalCariBakiye),
        siteOdensinCount > 0 && siteBeklesinCount > 0
          ? `${siteOdensinCount} ÖDE / ${siteBeklesinCount} BEK`
          : siteOdensinCount > 0 ? `${siteOdensinCount} ÖDENSİN` : `${siteBeklesinCount} BEKLESİN`,
        `Şantiye Toplamı`
      ]
    ];

    autoTable(doc, {
      startY: 28.5,
      head: tableHeaders,
      body: tableBody,
      foot: tableFoot,
      styles: {
        font: 'Roboto',
        fontSize: 7.8,
        cellPadding: 2.2,
        overflow: 'linebreak',
        textColor: [15, 23, 42]
      },
      headStyles: {
        font: 'Roboto',
        fontStyle: 'bold',
        fillColor: [15, 76, 68], // Renkli Başlık (Zümrüt Yeşili / Deep Pine Emerald)
        textColor: [255, 255, 255],
        fontSize: 8.2,
        halign: 'left'
      },
      footStyles: {
        font: 'Roboto',
        fontStyle: 'bold',
        fillColor: [254, 240, 138], // Alt Toplamlar Farklı Renk (Sıcak Canlı Amber / Altın)
        textColor: [120, 53, 15],   // Koyu amber metin
        fontSize: 8.2
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252] // Çok açık gri
      },
      columnStyles: {
        0: { cellWidth: 9, halign: 'center' },
        1: { cellWidth: 63, fontStyle: 'bold' },
        2: { cellWidth: 70 },
        3: { cellWidth: 35, halign: 'right', fontStyle: 'bold' },
        4: { cellWidth: 35, halign: 'right', fontStyle: 'bold' },
        5: { cellWidth: 26, halign: 'center', fontStyle: 'bold' },
        6: { cellWidth: 32, halign: 'left' }
      },
      didParseCell: (data) => {
        // Body satırları için renklendirme ve stil
        if (data.section === 'body') {
          const rowRecord = filteredRecords[data.row.index];
          const st = rowRecord ? getRecordStatus(rowRecord) : '';

          // BEKLESİN satırları altta yer alır, görsel ayrım için hafif sıcak amber zemin verilir
          if (st === 'BEKLESİN') {
            data.cell.styles.fillColor = data.row.index % 2 === 0 ? [255, 251, 235] : [254, 243, 199];
          }

          // Durumu sütunu (5. sütun) metin renkleri
          if (data.column.index === 5) {
            const val = String(data.cell.raw).trim();
            if (val === 'ÖDENSİN') {
              data.cell.styles.textColor = [16, 128, 64]; // Canlı Yeşil
              data.cell.styles.fontStyle = 'bold';
            } else if (val === 'BEKLESİN') {
              data.cell.styles.textColor = [180, 83, 9]; // Amber
              data.cell.styles.fontStyle = 'bold';
            }
          }
        }
        if (data.section === 'foot') {
          if (data.column.index === 1 || data.column.index === 2) {
            data.cell.styles.fontStyle = 'bold';
          }
          if (data.column.index === 3 || data.column.index === 4) {
            data.cell.styles.halign = 'right';
            data.cell.styles.fontStyle = 'bold';
          }
          if (data.column.index === 5) {
            data.cell.styles.halign = 'center';
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
      margin: { top: 14, left: 13.5, right: 13.5, bottom: 14 }
    });
  });

  // 4. Tüm Şantiyeler Genel Konsolide İcmal Sayfası
  doc.addPage('a4', 'landscape');

  doc.setFillColor(15, 23, 42);
  doc.roundedRect(13.5, 9.5, 270, 17, 2, 2, 'F');
  doc.setFillColor(16, 185, 129);
  doc.rect(13.5, 9.5, 4, 17, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('Roboto', 'bold');
  doc.setFontSize(11);
  doc.text('BAYBURT ÖZKA İNŞAAT — TÜM ŞANTİYELER GENEL KONSOLİDE RAPORU (ÖDENSİN & BEKLESİN)', 21, 16);

  doc.setFont('Roboto', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(167, 243, 208);
  doc.text(
    `Bütün Sayfalardaki Onaylı Talepler   •   Rapor Tarihi: ${dateStr}   •   Toplam Ödensin: ${grandTotalOdensinCount}   •   Toplam Beklesin: ${grandTotalBeklesinCount}   •   Genel Toplam: ${grandTotalCount} Kayıt`,
    21,
    22
  );

  autoTable(doc, {
    startY: 28.5,
    head: [['#', 'ŞANTİYE ADI', 'TABLO ADI', 'ÖDENSİN', 'BEKLESİN', 'TOPLAM KAYIT', 'ÖDENECEK TUTAR TOPLAMI', 'CARİ BAKİYE TOPLAMI']],
    body: summaryRows,
    foot: [
      [
        '',
        'GENEL TOPLAM (7 ŞANTİYE):',
        '',
        `${grandTotalOdensinCount} Ödensin`,
        `${grandTotalBeklesinCount} Beklesin`,
        `${grandTotalCount} Toplam Kayıt`,
        formatCurrency(grandTotalTutar),
        formatCurrency(grandTotalCariBakiye)
      ]
    ],
    styles: {
      font: 'Roboto',
      fontSize: 8.2,
      cellPadding: 2.8,
      overflow: 'linebreak',
      textColor: [15, 23, 42]
    },
    headStyles: {
      font: 'Roboto',
      fontStyle: 'bold',
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontSize: 8.5,
      halign: 'left'
    },
    footStyles: {
      font: 'Roboto',
      fontStyle: 'bold',
      fillColor: [220, 252, 231], // Genel Toplam Vurgusu (Ferah Zümrüt Yeşili)
      textColor: [6, 78, 59],
      fontSize: 9
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252]
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 55, fontStyle: 'bold' },
      2: { cellWidth: 45 },
      3: { cellWidth: 26, halign: 'center', fontStyle: 'bold', textColor: [16, 128, 64] },
      4: { cellWidth: 26, halign: 'center', fontStyle: 'bold', textColor: [180, 100, 10] },
      5: { cellWidth: 30, halign: 'center', fontStyle: 'bold' },
      6: { cellWidth: 40, halign: 'right', fontStyle: 'bold' },
      7: { cellWidth: 38, halign: 'right', fontStyle: 'bold' }
    },
    margin: { top: 14, left: 13.5, right: 13.5, bottom: 14 }
  });

  // 5. Her Sayfaya Sayfa Numaraları ve Alt Bilgi Ekleme
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('Roboto', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `BAYBURT ÖZKA İNŞAAT — Sayfa ${p} / ${totalPages}   •   Rapor Tarihi: ${dateStr}   •   Ödensin & Beklesin Onaylı Ödeme Listesi`,
      13.5,
      203
    );
    doc.text(
      'Şantiyeler Talep & Ödeme Takip Portalı',
      283.5,
      203,
      { align: 'right' }
    );
  }

  // Dosya adını oluştur ve indir
  const defaultPrefix =
    viewMode === 'odemeler'
      ? 'Tum_Santiyeler_Odenecek_Odensinler_Listesi'
      : 'Tum_Santiyeler_Odensinler_Listesi';
  const prefix = filenamePrefix || defaultPrefix;
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_\u00C0-\u017F-]/g, '_');
  const finalFilename = `${safePrefix}_${dateNow.toISOString().split('T')[0]}.pdf`;

  doc.save(finalFilename);

  return {
    success: true,
    count: grandTotalCount,
    odensinCount: grandTotalOdensinCount,
    beklesinCount: grandTotalBeklesinCount,
    filename: finalFilename,
    message: `Bütün sayfalardaki ÖDENSİN ve BEKLESİN kayıtları (${grandTotalCount} adet) "${finalFilename}" dosyasına başarıyla aktarıldı.`
  };
};
