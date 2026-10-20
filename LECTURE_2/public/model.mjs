export const COLOR_LABELS = {
  primary: '대표색', onPrimary: '대표색 위 글자', background: '페이지 배경', surface: '카드 배경',
  text: '본문 글자', muted: '보조 글자', border: '테두리', accent: '강조 배경', success: '성공', danger: '오류'
};
export const TEXT_LABELS = {
  name: '디자인 시스템 이름', purpose: '만들 서비스와 목적', audience: '주로 사용할 사람', voice: '분위기와 말투',
  principles: '디자인 원칙', writing: '문장 작성 규칙', components: '컴포넌트 사용 규칙', avoid: '피할 표현과 디자인',
  sources: '참고 자료와 근거', sourceUrl: '참고 주소',
  logoUsage: '로고 사용 위치와 배경', symbolUsage: '심볼 사용 위치', logoAvoid: '로고·심볼 사용 금지 규칙',
  fontSource: '글꼴 출처와 라이선스 메모', fontUsage: '글꼴 사용 규칙', imageRules: '아이콘·이미지 사용 규칙'
};
export const NUMBER_RULES = {
  baseSize: [14, 22], headingSize: [24, 64], lineHeight: [1.3, 2], spacing: [4, 12],
  controlRadius: [0, 24], cardRadius: [0, 40], contentWidth: [800, 1440],
  logoClearSpace: [0, 64], logoMinWidth: [16, 300], symbolMinSize: [16, 128],
  bodyWeight: [100, 900], headingWeight: [100, 900], headingLineHeight: [1.1, 1.8], letterSpacing: [-2, 4], labelSize: [11, 20], captionSize: [10, 18]
};
export const FONTS = ['Pretendard', 'system-ui', 'serif'];
export function initialDesign() {
  return {
    name: '', purpose: '', audience: '', voice: '친근하고 명확한 한국어',
    principles: '한 화면에서 중요한 행동이 먼저 보이게 합니다.\n색상에만 의존하지 않고 글자와 상태 표시를 함께 사용합니다.\n작은 화면에서도 읽고 조작할 수 있게 만듭니다.',
    writing: '짧고 구체적인 한국어를 사용합니다.\n낯선 용어는 처음 등장할 때 설명합니다.\n오류가 나면 원인과 다음 행동을 함께 안내합니다.',
    components: '버튼: 대표 행동은 대표색, 보조 행동은 테두리 버튼을 사용합니다.\n입력창: 항상 보이는 제목과 오류 안내를 둡니다.\n카드: 관련된 정보와 행동을 한 묶음으로 배치합니다.\n상태: 기본·호버·키보드 포커스·비활성·오류를 구분합니다.',
    avoid: '장식만을 위한 그라데이션과 복잡한 배경을 피합니다.\n출처 없는 수치·후기·인증 정보를 만들지 않습니다.',
    sources: '시작값: 제공된 CODEPLANT 브랜드 가이드의 색상·Pretendard·평면 스타일.\n프로젝트에 맞게 직접 수정하고 최종 규칙을 확인하세요.',
    sourceUrl: '', fontFamily: 'Pretendard',
    headingFontFamily: 'Pretendard', logoUsage: '', symbolUsage: '', logoAvoid: '원본 비율을 유지하고, 늘이기·자르기·임의 색상 변경을 피합니다.',
    fontSource: '', fontUsage: '본문은 읽기 편한 크기와 굵기로, 제목은 정보의 순서를 보여주는 용도로 사용합니다.', imageRules: '',
    colors: { primary: '#6FC5C1', onPrimary: '#2D2D2D', background: '#F2F4F6', surface: '#FFFFFF', text: '#2D2D2D', muted: '#6D6D6D', border: '#B2B2B2', accent: '#D8F1F0', success: '#23704A', danger: '#B42318' },
    baseSize: 16, headingSize: 36, lineHeight: 1.6, spacing: 8, controlRadius: 8, cardRadius: 20, contentWidth: 1120,
    logoClearSpace: 12, logoMinWidth: 80, symbolMinSize: 24, bodyWeight: 400, headingWeight: 700, headingLineHeight: 1.25, letterSpacing: 0, labelSize: 14, captionSize: 12
  };
}
export const designSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    ...Object.fromEntries(Object.keys(TEXT_LABELS).map(k => [k, { type: 'string' }])),
    fontFamily: { type: 'string', pattern: '^[a-zA-Z0-9가-힣 ._-]{1,80}$' }, headingFontFamily: { type: 'string', pattern: '^[a-zA-Z0-9가-힣 ._-]{1,80}$' },
    colors: { type: 'object', additionalProperties: false, properties: Object.fromEntries(Object.keys(COLOR_LABELS).map(k => [k, { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' }])), required: Object.keys(COLOR_LABELS) },
    ...Object.fromEntries(Object.entries(NUMBER_RULES).map(([k, [minimum, maximum]]) => [k, { type: 'number', minimum, maximum }]))
  },
  required: [...Object.keys(TEXT_LABELS), 'fontFamily', 'headingFontFamily', 'colors', ...Object.keys(NUMBER_RULES)]
};
export function validateDesign(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw Error('디자인 시스템 형식이 올바르지 않습니다.');
  const legacy = !Object.hasOwn(d, 'headingFontFamily');
  const defaults = initialDesign();
  const added = ['headingFontFamily', 'logoUsage', 'symbolUsage', 'logoAvoid', 'fontSource', 'fontUsage', 'imageRules', 'logoClearSpace', 'logoMinWidth', 'symbolMinSize', 'bodyWeight', 'headingWeight', 'headingLineHeight', 'letterSpacing', 'labelSize', 'captionSize'];
  d = { ...Object.fromEntries(added.map(k => [k, defaults[k]])), ...d };
  if (legacy) d.headingFontFamily = d.fontFamily;
  if (Object.keys(d).some(k => !designSchema.required.includes(k))) throw Error('지원하지 않는 디자인 항목이 있습니다.');
  for (const [k, label] of Object.entries(TEXT_LABELS)) {
    if (typeof d[k] !== 'string' || d[k].length > (k === 'sources' ? 24000 : k === 'name' ? 100 : 6000)) throw Error(`${label}의 형식 또는 길이를 확인하세요.`);
  }
  if (d.sourceUrl) {
    let u; try { u = new URL(d.sourceUrl); } catch { throw Error('참고 주소는 https:// 또는 http://로 시작해야 합니다.'); }
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) throw Error('참고 주소 형식을 확인하세요.');
  }
  for (const key of ['fontFamily', 'headingFontFamily']) if (!/^[a-zA-Z0-9가-힣 ._-]{1,80}$/.test(d[key])) throw Error('글꼴 이름은 한글·영문·숫자·공백·마침표·밑줄·하이픈으로 80자 이내에 입력하세요.');
  if (!d.colors || Object.keys(d.colors).length !== Object.keys(COLOR_LABELS).length) throw Error('색상 항목을 확인하세요.');
  for (const k of Object.keys(COLOR_LABELS)) if (!/^#[\da-f]{6}$/i.test(d.colors[k] || '')) throw Error(`${COLOR_LABELS[k]}은 #RRGGBB 색상이어야 합니다.`);
  for (const [k, [min, max]] of Object.entries(NUMBER_RULES)) if (!Number.isFinite(d[k]) || d[k] < min || d[k] > max) throw Error(`${k} 값은 ${min}~${max} 사이여야 합니다.`);
  for (const k of ['bodyWeight', 'headingWeight']) if (d[k] % 100 !== 0) throw Error('글꼴 굵기는 100 단위로 지정하세요.');
  return structuredClone(d);
}
export function validateLogo(value) {
  if (value === '') return value;
  if (typeof value !== 'string' || value.length > 2800000 || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) throw Error('로고는 2 MB 이하의 PNG·JPG·WebP 이미지로 넣으세요.');
  return value;
}
export const ASSET_LABELS = { logoDataUrl: '기본 로고', darkLogoDataUrl: '어두운 배경용 로고', symbolDataUrl: '심볼' };
export function validateFont(value) {
  if (!value || typeof value.name !== 'string' || value.name.length > 160 || !/\.(ttf|otf|woff2?)$/i.test(value.name)) throw Error('글꼴은 TTF·OTF·WOFF·WOFF2 파일로 넣으세요.');
  const match = typeof value.dataUrl === 'string' && value.dataUrl.match(/^data:font\/(ttf|otf|woff2?);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match || match[2].length > 6990510) throw Error('글꼴 파일은 하나당 5 MB 이하로 넣으세요.');
  if (!value.name.toLowerCase().endsWith('.' + match[1])) throw Error('글꼴의 확장자와 파일 형식이 일치해야 합니다.');
  let bytes; try { bytes = atob(match[2]); } catch { throw Error('글꼴 파일 내용을 읽지 못했습니다.'); }
  const signatures = { ttf: '\x00\x01\x00\x00', otf: 'OTTO', woff: 'wOFF', woff2: 'wOF2' };
  if (!bytes.startsWith(signatures[match[1]]) || bytes.length < 12 || bytes.length > 5242880) throw Error('글꼴 파일 형식과 내용을 확인하세요. 확장자만 바꾼 파일은 사용할 수 없습니다.');
  return { name: value.name, dataUrl: value.dataUrl, format: match[1] };
}
export function fontStack(name) { return ['system-ui', 'serif'].includes(name) ? name : `"${name}", system-ui, sans-serif`; }
export function fontFaces(d, fontAssets = {}, fontBase = '/api/fonts/') {
  return ['body', 'heading'].filter(role => fontAssets[role]).map(role => {
    const asset = fontAssets[role];
    if (!/^[\da-f-]{36}$/.test(asset.id)) throw Error('저장된 글꼴 식별자를 확인하세요.');
    const src = fontBase === 'export' ? `assets/font-${role}.${asset.format}` : fontBase + asset.id;
    return `@font-face{font-family:"DS-${role}";src:url("${src}");font-weight:100 900;font-display:swap}`;
  }).join('\n');
}
export function contrast(a, b) {
  const lum = hex => {
    const rgb = hex.match(/[\da-f]{2}/gi).map(x => parseInt(x, 16) / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  const l = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l[0] + .05) / (l[1] + .05);
}
export function checks(d) {
  const pairs = [['본문 / 페이지', 'text', 'background'], ['본문 / 카드', 'text', 'surface'], ['보조 글자 / 카드', 'muted', 'surface'], ['대표 버튼', 'onPrimary', 'primary']];
  return pairs.map(([label, a, b]) => ({ label, ratio: contrast(d.colors[a], d.colors[b]), pass: contrast(d.colors[a], d.colors[b]) >= 4.5 }));
}
export function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
export function tokensCss(input, fontAssets = {}) {
  const d = validateDesign(input);
  const values = {
    ...d.colors, font: `${fontAssets.body ? '"DS-body", ' : ''}${fontStack(d.fontFamily)}`, 'heading-font': `${fontAssets.heading ? '"DS-heading", ' : ''}${fontStack(d.headingFontFamily)}`,
    'base-size': d.baseSize + 'px', 'heading-size': d.headingSize + 'px', 'line-height': d.lineHeight, 'heading-line-height': d.headingLineHeight,
    'body-weight': d.bodyWeight, 'heading-weight': d.headingWeight, 'letter-spacing': d.letterSpacing + 'px', 'label-size': d.labelSize + 'px', 'caption-size': d.captionSize + 'px',
    space: d.spacing + 'px', 'control-radius': d.controlRadius + 'px', 'card-radius': d.cardRadius + 'px', 'content-width': d.contentWidth + 'px',
    'logo-clear-space': d.logoClearSpace + 'px', 'logo-min-width': d.logoMinWidth + 'px', 'symbol-min-size': d.symbolMinSize + 'px'
  };
  return '/* Design system tokens */\n:root {\n' + Object.entries(values).map(([k, v]) => `  --ds-${k}: ${v};`).join('\n') + '\n}\n';
}
