import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { validateFont } from '../public/model.mjs';

export const FONT_ROLES = ['body', 'heading'];
export async function saveFont(dir, owner, value) {
  const font = validateFont(value), id = randomUUID();
  const meta = { id, owner, name: font.name, format: font.format };
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, id + '.bin'), Buffer.from(font.dataUrl.split(',')[1], 'base64'), { mode: 0o600 });
  await writeFile(path.join(dir, id + '.json'), JSON.stringify(meta), { mode: 0o600 });
  return meta;
}
export async function readFont(dir, id, owner) {
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/.test(id || '')) throw Error('글꼴 식별자를 확인하세요.');
  const meta = JSON.parse(await readFile(path.join(dir, id + '.json'), 'utf8'));
  if (meta.id !== id || owner && meta.owner !== owner) throw Error('다른 디자인의 글꼴 파일을 참조할 수 없습니다.');
  const data = await readFile(path.join(dir, id + '.bin'));
  const font = validateFont({ name: meta.name, dataUrl: `data:font/${meta.format};base64,${data.toString('base64')}` });
  return { meta, data, dataUrl: font.dataUrl };
}
export async function ownedFonts(dir, owner, assets = {}) {
  if (!assets || typeof assets !== 'object' || Array.isArray(assets) || Object.keys(assets).some(k => !FONT_ROLES.includes(k))) throw Error('본문·제목 글꼴 항목을 확인하세요.');
  const result = {};
  for (const role of FONT_ROLES) if (assets[role]) result[role] = (await readFont(dir, assets[role].id, owner)).meta;
  return result;
}
