import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import { MOBI_BRAND_PALETTE } from './brandPalette';

export const brandRouter = Router();

const LOGO_BY_VARIANT: Record<string, string[]> = {
  frontend: [
    'C:\\Users\\marce\\.cursor\\projects\\d-AGENTE-DE-IA-MOBI\\assets\\c__Users_marce_AppData_Roaming_Cursor_User_workspaceStorage_361bad76ce4ccf1cb4db6b1b1e3b607f_images_02_PNG_alta_qualidade_transparente-e98cba4a-0fa7-4b21-9382-494901a4ce13.png',
  ],
  referencia: [
    'C:\\Users\\marce\\.cursor\\projects\\d-AGENTE-DE-IA-MOBI\\assets\\c__Users_marce_AppData_Roaming_Cursor_User_workspaceStorage_361bad76ce4ccf1cb4db6b1b1e3b607f_images_02_PNG_alta_qualidade_transparente-e98cba4a-0fa7-4b21-9382-494901a4ce13.png',
    'C:\\Users\\marce\\.cursor\\projects\\d-AGENTE-DE-IA-MOBI\\assets\\c__Users_marce_AppData_Roaming_Cursor_User_workspaceStorage_361bad76ce4ccf1cb4db6b1b1e3b607f_images_MOBLE_logo_referencia-9d45d59c-3874-4343-ba82-ccf766a485e6.png',
  ],
  preto: [
    'C:\\Users\\marce\\.cursor\\projects\\d-AGENTE-DE-IA-MOBI\\assets\\c__Users_marce_AppData_Roaming_Cursor_User_workspaceStorage_361bad76ce4ccf1cb4db6b1b1e3b607f_images_04_versao_preta_transparente-5d5754a7-bc50-4031-9dc1-505be0a9d03a.png',
    'C:\\Users\\marce\\.cursor\\projects\\d-AGENTE-DE-IA-MOBI\\assets\\c__Users_marce_AppData_Roaming_Cursor_User_workspaceStorage_361bad76ce4ccf1cb4db6b1b1e3b607f_images_MOBLE_logo_preto-fff83ab5-618c-45d5-afc4-1475b8bd1269.png',
  ],
  branco: [
    'C:\\Users\\marce\\.cursor\\projects\\d-AGENTE-DE-IA-MOBI\\assets\\c__Users_marce_AppData_Roaming_Cursor_User_workspaceStorage_361bad76ce4ccf1cb4db6b1b1e3b607f_images_03_versao_branca_transparente-0ca1f16e-cf5d-452b-b9ac-52058bce77e5.png',
    'C:\\Users\\marce\\.cursor\\projects\\d-AGENTE-DE-IA-MOBI\\assets\\c__Users_marce_AppData_Roaming_Cursor_User_workspaceStorage_361bad76ce4ccf1cb4db6b1b1e3b607f_images_MOBLE_logo_branco-7db556da-d2f6-4317-b96a-a744e523bfde.png',
  ],
  icone: [
    'C:\\Users\\marce\\.cursor\\projects\\d-AGENTE-DE-IA-MOBI\\assets\\c__Users_marce_AppData_Roaming_Cursor_User_workspaceStorage_361bad76ce4ccf1cb4db6b1b1e3b607f_images_icone_M_3D_transparente-637bbf19-e702-4658-b94b-396b2d4f1db6.png',
  ],
};

function resolveLogoPath(variantRaw: string): string | null {
  const variant = variantRaw.toLowerCase();
  const candidates = LOGO_BY_VARIANT[variant] ?? LOGO_BY_VARIANT.frontend;
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

brandRouter.get('/logo', (req, res) => {
  const variant = typeof req.query.variant === 'string' ? req.query.variant : 'frontend';
  const logoPath = resolveLogoPath(variant);
  if (!logoPath) {
    res.status(404).json({ error: 'Logo não encontrado no ambiente atual' });
    return;
  }
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.sendFile(path.resolve(logoPath));
});

brandRouter.get('/palette', (_req, res) => {
  res.json({ brand: 'MOBI', palette: MOBI_BRAND_PALETTE });
});

