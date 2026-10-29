import { supabase } from './supabase';
import { TalepRecord, SiteKey } from '../types';

export interface MuavinSiteMapping {
  siteKey: string;
  siteName: string;
  folderName: string;
  altFolderNames?: string[];
  expectedFileName?: string;
}

export const MUAVIN_SITE_MAPPINGS: Record<string, MuavinSiteMapping> = {
  arnavutkoy: {
    siteKey: 'arnavutkoy',
    siteName: 'ARNAVUTKÖY',
    folderName: 'ARNAVUTKOY',
    expectedFileName: 'arnavutkoymuavin.pdf'
  },
  mamak: {
    siteKey: 'mamak',
    siteName: 'MAMAK-ANKARA',
    folderName: 'MAMAK',
    expectedFileName: 'mamakmuavin.pdf'
  },
  senbay_ozka: {
    siteKey: 'senbay_ozka',
    siteName: 'ŞENBAY-ÖZKA',
    folderName: 'SENBAY',
    expectedFileName: 'bursamuavin.pdf'
  },
  merkez_ozka: {
    siteKey: 'merkez_ozka',
    siteName: 'MERKEZ ÖZKA',
    folderName: 'OZKA',
    expectedFileName: 'ozkamuavin.pdf'
  },
  msb_ozka: {
    siteKey: 'msb_ozka',
    siteName: 'MSB ÖZKA',
    folderName: 'MSB'
  },
  seka: {
    siteKey: 'seka',
    siteName: 'SEKA',
    folderName: 'SEKA'
  },
  diger: {
    siteKey: 'diger',
    siteName: 'DİĞER',
    folderName: 'DİGER',
    altFolderNames: ['DIGER', 'diger', 'dİger']
  }
};

/**
 * Resolves the correct storage folder for a given site or record
 */
export function resolveMuavinMapping(siteIdOrTable: string, record?: TalepRecord | null): MuavinSiteMapping {
  // If record has _siteId or _siteTable, prioritize that
  const table = record?._siteTable || '';
  const siteId = record?._siteId || siteIdOrTable;

  if (siteId === 'arnavutkoy' || table === 'arnavutkoy_talep') {
    return MUAVIN_SITE_MAPPINGS.arnavutkoy;
  }
  if (siteId === 'mamak' || table === 'mamak_talep') {
    return MUAVIN_SITE_MAPPINGS.mamak;
  }
  if (siteId === 'senbay_ozka' || table === 'senbay_ozka_talep') {
    return MUAVIN_SITE_MAPPINGS.senbay_ozka;
  }
  if (siteId === 'merkez_ozka' || table === 'merkez_ozka_talep') {
    return MUAVIN_SITE_MAPPINGS.merkez_ozka;
  }
  if (siteId === 'msb_ozka' || table === 'msb_ozka_talep') {
    return MUAVIN_SITE_MAPPINGS.msb_ozka;
  }
  if (siteId === 'seka' || table === 'seka_talep') {
    return MUAVIN_SITE_MAPPINGS.seka;
  }
  if (siteId === 'diger' || table === 'diger_talep') {
    return MUAVIN_SITE_MAPPINGS.diger;
  }

  // Check direct key
  if (MUAVIN_SITE_MAPPINGS[siteIdOrTable]) {
    return MUAVIN_SITE_MAPPINGS[siteIdOrTable];
  }

  // Default fallback to ARNAVUTKOY
  return MUAVIN_SITE_MAPPINGS.arnavutkoy;
}

export interface MuavinFileInfo {
  name: string;
  folder: string;
  fullPath: string;
  publicUrl: string;
  size?: number;
  updatedAt?: string;
  siteLabel?: string;
}

/**
 * Fetches PDF files strictly for the specified site's folder under MUAVINLER bucket.
 * Returns null/empty if no PDF exists yet in that exact folder.
 */
export async function getDirectSiteMuavinFiles(siteKeyOrMapping: string | MuavinSiteMapping): Promise<{
  mapping: MuavinSiteMapping;
  files: MuavinFileInfo[];
}> {
  const mapping = typeof siteKeyOrMapping === 'string'
    ? resolveMuavinMapping(siteKeyOrMapping)
    : siteKeyOrMapping;

  const bucket = 'MUAVINLER';
  const foldersToTry = [mapping.folderName, ...(mapping.altFolderNames || [])];
  const files: MuavinFileInfo[] = [];

  for (const folder of foldersToTry) {
    try {
      const { data, error } = await supabase.storage.from(bucket).list(folder, {
        limit: 50,
        sortBy: { column: 'name', order: 'asc' }
      });

      if (!error && data && data.length > 0) {
        for (const item of data) {
          if (item.name && item.name.toLowerCase().endsWith('.pdf')) {
            const fullPath = `${folder}/${item.name}`;
            const { data: pubData } = supabase.storage.from(bucket).getPublicUrl(fullPath);

            files.push({
              name: item.name,
              folder,
              fullPath,
              publicUrl: pubData.publicUrl,
              size: item.metadata?.size || item.metadata?.contentLength,
              updatedAt: item.updated_at || item.created_at,
              siteLabel: mapping.siteName
            });
          }
        }
      }
    } catch (err) {
      console.warn(`Error scanning direct folder ${bucket}/${folder}:`, err);
    }

    if (files.length > 0) {
      break;
    }
  }

  return { mapping, files };
}

/**
 * Direct file upload into the specified folder in MUAVINLER bucket
 */
export async function uploadMuavinFileToFolder(folder: string, file: File): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const bucket = 'MUAVINLER';
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${folder}/${cleanFileName}`;

    const { error } = await supabase.storage.from(bucket).upload(path, file, {
      upsert: true,
      contentType: 'application/pdf'
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const { data: pubData } = supabase.storage.from(bucket).getPublicUrl(path);
    return { success: true, url: pubData.publicUrl };
  } catch (err: any) {
    return { success: false, error: err.message || 'Yükleme başarısız oldu' };
  }
}

/**
 * Fetches all PDF files in the specified folder under MUAVINLER bucket,
 * with intelligent fallbacks so the user is never stuck on an empty screen.
 */
export async function getMuavinFilesForFolder(mapping: MuavinSiteMapping): Promise<MuavinFileInfo[]> {
  const bucket = 'MUAVINLER';
  const foldersToTry = [mapping.folderName, ...(mapping.altFolderNames || [])];
  const files: MuavinFileInfo[] = [];

  // 1. Try primary site folders
  for (const folder of foldersToTry) {
    try {
      const { data, error } = await supabase.storage.from(bucket).list(folder, {
        limit: 50,
        sortBy: { column: 'updated_at', order: 'desc' }
      });

      if (!error && data && data.length > 0) {
        for (const item of data) {
          if (item.name && item.name.toLowerCase().endsWith('.pdf')) {
            const fullPath = `${folder}/${item.name}`;
            const { data: pubData } = supabase.storage.from(bucket).getPublicUrl(fullPath);

            files.push({
              name: item.name,
              folder,
              fullPath,
              publicUrl: pubData.publicUrl,
              size: item.metadata?.size || item.metadata?.contentLength,
              updatedAt: item.updated_at || item.created_at,
              siteLabel: mapping.siteName
            });
          }
        }
      }
    } catch (e) {
      console.warn(`Error listing files in ${bucket}/${folder}:`, e);
    }

    if (files.length > 0) {
      break;
    }
  }

  // 2. Check CARILER bucket if still empty
  if (files.length === 0) {
    try {
      const { data: carilerData } = await supabase.storage.from('CARILER').list('', { limit: 50 });
      if (carilerData && carilerData.length > 0) {
        for (const item of carilerData) {
          if (item.name && item.name.toLowerCase().endsWith('.pdf')) {
            // Check if matches current site name loosely
            const lower = item.name.toLowerCase();
            const fLower = mapping.folderName.toLowerCase();
            if (lower.includes(fLower) || (fLower === 'senbay' && lower.includes('senbay'))) {
              const { data: pubData } = supabase.storage.from('CARILER').getPublicUrl(item.name);
              files.push({
                name: item.name,
                folder: 'CARILER',
                fullPath: `CARILER/${item.name}`,
                publicUrl: pubData.publicUrl,
                size: item.metadata?.size || item.metadata?.contentLength,
                updatedAt: item.updated_at || item.created_at,
                siteLabel: `${mapping.siteName} (CARİLER)`
              });
            }
          }
        }
      }
    } catch (e) {
      console.warn('Error checking CARILER bucket:', e);
    }
  }

  // 3. If STILL empty (e.g. MSB, SEKA, DIGER have no uploaded files yet),
  // return all available muavins so the viewer ALWAYS opens and shows a PDF!
  if (files.length === 0) {
    const all = await getAllAvailableMuavins();
    if (all.length > 0) {
      return all;
    }
  }

  // Return files found specifically in this site's folder
  return files;
}

/**
 * Returns all available Muavin PDFs across the entire storage
 */
export async function getAllAvailableMuavins(): Promise<MuavinFileInfo[]> {
  const bucket = 'MUAVINLER';
  const knownFolders = [
    { folder: 'ARNAVUTKOY', label: 'ARNAVUTKÖY' },
    { folder: 'OZKA', label: 'MERKEZ ÖZKA' },
    { folder: 'SENBAY', label: 'ŞENBAY-ÖZKA' },
    { folder: 'MAMAK', label: 'MAMAK-ANKARA' }
  ];

  const results: MuavinFileInfo[] = [];

  for (const item of knownFolders) {
    try {
      const { data } = await supabase.storage.from(bucket).list(item.folder, { limit: 20 });
      if (data && data.length > 0) {
        for (const file of data) {
          if (file.name && file.name.toLowerCase().endsWith('.pdf')) {
            const fullPath = `${item.folder}/${file.name}`;
            const { data: pubData } = supabase.storage.from(bucket).getPublicUrl(fullPath);
            results.push({
              name: file.name,
              folder: item.folder,
              fullPath,
              publicUrl: pubData.publicUrl,
              size: file.metadata?.size || file.metadata?.contentLength,
              updatedAt: file.updated_at || file.created_at,
              siteLabel: item.label
            });
          }
        }
      }
    } catch (e) {
      console.warn(`Error listing ${item.folder}:`, e);
    }
  }

  // Also check CARILER bucket if needed
  try {
    const { data: carilerData } = await supabase.storage.from('CARILER').list('', { limit: 20 });
    if (carilerData && carilerData.length > 0) {
      for (const file of carilerData) {
        if (file.name && file.name.toLowerCase().endsWith('.pdf')) {
          // Avoid duplicate if already in results
          if (!results.some(r => r.name.toLowerCase() === file.name.toLowerCase())) {
            const { data: pubData } = supabase.storage.from('CARILER').getPublicUrl(file.name);
            results.push({
              name: file.name,
              folder: 'CARILER',
              fullPath: `CARILER/${file.name}`,
              publicUrl: pubData.publicUrl,
              size: file.metadata?.size || file.metadata?.contentLength,
              updatedAt: file.updated_at || file.created_at,
              siteLabel: file.name.replace('.pdf', '')
            });
          }
        }
      }
    }
  } catch (e) {
    console.warn('Error listing CARILER bucket:', e);
  }

  return results;
}
