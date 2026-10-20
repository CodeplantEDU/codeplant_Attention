import { COLOR_LABELS, checks, tokensCss, validateDesign, fontFaces, ASSET_LABELS } from '../public/model.mjs';
import { previewHtml } from '../public/preview.mjs';

export function designMarkdown(input) {
  const d = validateDesign(input);
  return `# ${d.name || '이름을 정하지 않은 디자인 시스템'}\n\n이 문서는 사용자가 편집한 디자인 규칙입니다. 실제 사업 사실이나 성과의 근거로 사용하지 마세요.\n\n## 목적\n${d.purpose || '(미입력)'}\n\n## 사용자\n${d.audience || '(미입력)'}\n\n## 분위기와 말투\n${d.voice}\n\n## 디자인 원칙\n${d.principles}\n\n## 색상\n\n| 역할 | 토큰 | 값 |\n|---|---|---|\n${Object.entries(d.colors).map(([k, v]) => `| ${COLOR_LABELS[k]} | --ds-${k} | ${v} |`).join('\n')}\n\n## 로고와 심볼\n- 기본 로고 사용: ${d.logoUsage || "(미지정)"}\n- 심볼 사용: ${d.symbolUsage || "(미지정)"}\n- 보호 여백: 상하좌우 ${d.logoClearSpace}px\n- 로고 최소 가로 너비: ${d.logoMinWidth}px\n- 심볼 최소 배치 영역: ${d.symbolMinSize} × ${d.symbolMinSize}px (원본 비율 유지)\n- 피할 사용: ${d.logoAvoid || "(미지정)"}\n\n크기와 여백의 시작값은 이 실습의 제안값이며 공식 브랜드 규격이라는 뜻이 아닙니다.\n\n## 글꼴\n- 본문 글꼴: ${d.fontFamily} / 굵기 ${d.bodyWeight}\n- 제목 글꼴: ${d.headingFontFamily} / 굵기 ${d.headingWeight}\n- 본문: ${d.baseSize}px / 줄 높이 ${d.lineHeight}\n- 큰 제목: ${d.headingSize}px / 줄 높이 ${d.headingLineHeight}\n- 입력 제목: ${d.labelSize}px\n- 주석: ${d.captionSize}px\n- 자간: ${d.letterSpacing}px\n- 사용 규칙: ${d.fontUsage || "(미지정)"}\n- 출처와 라이선스: ${d.fontSource || "(미지정, 업로드만으로 사용 권한을 확인한 것은 아닙니다.)"}\n\n파일이 없으면 지정한 이름의 글꼴 설치 여부에 따라 대체 글꼴이 사용됩니다.\n\n## 아이콘과 이미지\n${d.imageRules || "(미지정)"}\n\n## 여백과 형태\n- 기본 간격: ${d.spacing}px (배수로 사용)\n- 컨트롤 모서리: ${d.controlRadius}px\n- 카드 모서리: ${d.cardRadius}px\n- 콘텐츠 최대 너비: ${d.contentWidth}px\n\n## 컴포넌트\n${d.components}\n\n## 문장 작성 규칙\n${d.writing}\n\n## 피할 것\n${d.avoid}\n\n## 참고 자료와 출처\n${d.sources || '(미입력)'}\n${d.sourceUrl ? `\n참고 주소: ${d.sourceUrl}\n주소의 내용을 자동 수집하거나 검증한 것은 아닙니다.\n` : ''}\n## 글자 대비 자동 점검\n${checks(d).map(x => `- ${x.label}: ${x.ratio.toFixed(2)}:1 / ${x.pass ? '4.5:1 이상' : '4.5:1 미만, 수정 필요'}`).join('\n')}\n\n자동 점검은 위 색상 조합만 계산하며 접근성 전체의 통과를 뜻하지 않습니다.\n`;
}
export const handoff = `# Codex에서 이어서 작업하기\n\n이 폴더는 디자인 시스템 자료입니다. 최종 스킬은 아직 만들지 않았습니다.\n\n1. 폴더를 압축 해제하고 Codex에서 이 폴더를 여세요.\n2. DESIGN.md, tokens.json, tokens.css, preview.html을 확인하세요.\n3. 아래 요청을 입력하고 스킬의 이름과 적용 범위를 직접 정하세요.\n\n> 이 폴더의 DESIGN.md와 tokens.json, tokens.css를 읽고 내 디자인 시스템을 적용하는 재사용 가능한 Codex 스킬을 만들어줘. 미리보기의 예시 문장을 실제 사업 사실로 사용하지 마. 원본 규칙과 assets를 보존하고, 빠진 정보는 질문하거나 미입력으로 남겨줘. SKILL.md를 만든 뒤 실제 결과물에 적용해 검수해줘.\n\n## 포함 파일\n- DESIGN.md: 한국어 디자인 규칙과 출처\n- tokens.json: 제작 서비스에서 다시 가져올 수 있는 편집 데이터\n- tokens.css: 구현에 사용할 CSS 변수\n- preview.html: 디자인 적용과 컴포넌트 상태 확인 예시\n- manifest.json: 자료 형식과 버전\n- assets/: Pretendard 글꼴과 라이선스, 사용자가 넣은 로고·심볼·글꼴 원본\n\n로고 사용 권한과 AI 제안의 적합성은 사용자가 확인하세요. 공식 CODEPLANT 로고는 제작 서비스의 브랜딩이며, 사용자가 넣지 않았다면 내보내기에 포함하지 않습니다.\n`;
export function exportFiles(project, fontFiles = {}) {
  const d = validateDesign(project.design), { logoDataUrl = '', darkLogoDataUrl = '', symbolDataUrl = '', fontAssets = {} } = project;
  const files = {
    'DESIGN.md': designMarkdown(d) + '\n## 포함된 원본 자료\n' + Object.entries(ASSET_LABELS).map(([k, label]) => `- ${label}: ${project[k] ? '사용자가 넣은 파일 포함' : '(미지정)'}`).join('\n') + '\n' + ['body', 'heading'].map(role => `- ${role === 'body' ? '본문' : '제목'} 글꼴 파일: ${fontAssets[role]?.name || '(미지정)'}`).join('\n') + '\n',
    'tokens.json': JSON.stringify({ schemaVersion: 1, design: d, logoDataUrl, darkLogoDataUrl, symbolDataUrl, fontFiles }, null, 2) + '\n',
    'tokens.css': fontFaces(d, fontAssets, 'export') + '\n' + tokensCss(d, fontAssets),
    'preview.html': previewHtml(d, logoDataUrl, { darkLogoDataUrl, symbolDataUrl, fontAssets, fontBase: 'export' }),
    'CODEX-HANDOFF.md': handoff,
    'manifest.json': JSON.stringify({ schemaVersion: 1, name: d.name, format: 'codeplant-design-system', revision: project.revision, updatedAt: project.updatedAt, entry: 'DESIGN.md', preview: 'preview.html', skillCreated: false }, null, 2)
  };
  for (const [key, name] of [['logoDataUrl', 'logo'], ['darkLogoDataUrl', 'logo-dark'], ['symbolDataUrl', 'symbol']]) if (project[key]) {
    const [, mime, data] = project[key].match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
    files[`assets/${name}.${mime === 'jpeg' ? 'jpg' : mime}`] = Buffer.from(data, 'base64');
  }
  for (const role of ['body', 'heading']) if (fontFiles[role]) files[`assets/font-${role}.${fontAssets[role].format}`] = Buffer.from(fontFiles[role].dataUrl.split(',')[1], 'base64');
  return files;
}

// ZIP STORE uses no dependency; the small package contains only known filenames.
export function zip(files) {
  const table = Array.from({ length: 256 }, (_, n) => { for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
  const local = [], central = []; let offset = 0;
  for (const [name, raw] of Object.entries(files)) {
    const data = Buffer.isBuffer(raw) ? raw : Buffer.from(raw), filename = Buffer.from(name);
    let crc = 0xffffffff; for (const b of data) crc = table[(crc ^ b) & 255] ^ (crc >>> 8); crc = (crc ^ 0xffffffff) >>> 0;
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6); header.writeUInt16LE(33, 12); header.writeUInt32LE(crc, 14); header.writeUInt32LE(data.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(filename.length, 26);
    local.push(header, filename, data);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x800, 8); c.writeUInt16LE(33, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(filename.length, 28); c.writeUInt32LE(offset, 42); central.push(c, filename);
    offset += header.length + filename.length + data.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(local.length / 3, 8); end.writeUInt16LE(local.length / 3, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
