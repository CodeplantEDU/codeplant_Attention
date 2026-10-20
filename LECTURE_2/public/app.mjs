import { initialDesign, validateDesign, validateLogo, COLOR_LABELS, TEXT_LABELS, NUMBER_RULES, FONTS, ASSET_LABELS, validateFont, checks, escapeHtml as h } from './model.mjs';
import { previewHtml } from './preview.mjs';

const $ = s => document.querySelector(s);
let token = '', project = null, projects = [], providers = [], step = 0, tab = 'brand', edit = 0, saved = 0;
let saving = null, saveTimer, previewTimer, toastTimer, pollTimer, currentJob = null, undo = null, instruction = '', provider = 'codex', reviewed = false;
const invalid = new Set(), fontCache = new Map();
const TABS = [['brand', '로고·심볼'], ['colors', '색상'], ['type', '글꼴'], ['layout', '여백·형태'], ['rules', '사용 규칙']];
function assetSnapshot(p = project) { return { ...Object.fromEntries(Object.keys(ASSET_LABELS).map(k => [k, p[k] || ''])), fontAssets: structuredClone(p.fontAssets || {}) }; }
function asDataUrl(blob) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(Error('파일을 읽지 못했습니다.')); reader.readAsDataURL(blob); }); }
async function fontFilesFor(p) { const files = {}; for (const [role, asset] of Object.entries(p.fontAssets || {})) { if (!fontCache.has(asset.id)) { const r = await fetch('/api/fonts/' + asset.id); if (!r.ok) throw Error('글꼴 원본을 읽지 못했습니다. 원본 파일을 다시 넣거나 서버 연결을 확인하세요.'); fontCache.set(asset.id, await asDataUrl(await r.blob())); } files[role] = { name: asset.name, dataUrl: fontCache.get(asset.id) }; } return files; }
const handoffPrompt = '이 폴더의 DESIGN.md와 tokens.json, tokens.css를 읽고 내 디자인 시스템을 적용하는 재사용 가능한 Codex 스킬을 만들어줘. 미리보기의 예시 문장을 실제 사업 사실로 사용하지 마. 원본 규칙과 assets를 보존하고, 빠진 정보는 질문하거나 미입력으로 남겨줘. SKILL.md를 만든 뒤 실제 결과물에 적용해 검수해줘.';
const COLOR_HELP = { primary: '중요한 버튼과 선택 강조', onPrimary: '대표 버튼에 놓이는 글자', background: '화면 전체의 바탕', surface: '카드와 입력 영역의 바탕', text: '제목과 본문', muted: '설명과 보조 문장', border: '입력창과 영역 구분', accent: '선택한 항목의 부드러운 배경', success: '완료·정상 상태', danger: '오류·주의가 필요한 상태' };
const NUMBER_LABELS = { baseSize: ['본문 글자', '14~22 px'], headingSize: ['큰 제목', '24~64 px'], lineHeight: ['줄 높이', '글자 크기의 1.3~2 배'], spacing: ['기본 간격', '4~12 px · 배수로 사용'], controlRadius: ['버튼 · 입력창 모서리', '0~24 px'], cardRadius: ['카드 모서리', '0~40 px'], contentWidth: ['콘텐츠 최대 너비', '800~1440 px'] };
Object.assign(NUMBER_LABELS, { logoClearSpace: ['로고 보호 여백', '상하좌우 각각 px · 시작 제안값 12'], logoMinWidth: ['로고 최소 가로 너비', 'px · 원본 비율로 세로 크기 결정'], symbolMinSize: ['심볼 최소 배치 영역', '가로 × 세로 px · 원본 비율 유지'], bodyWeight: ['본문 굵기', '100~900 · 100 단위'], headingWeight: ['제목 굵기', '100~900 · 100 단위'], headingLineHeight: ['제목 줄 높이', '글자 크기의 1.1~1.8 배'], letterSpacing: ['자간', '-2~4 px'], labelSize: ['입력 제목 크기', '11~20 px'], captionSize: ['주석 크기', '10~18 px'] });

function brandPanel() {
  return `<p class="helper">모든 파일은 선택입니다. 없는 자산은 미지정으로 남깁니다. 아래 크기·여백의 시작값은 실습용 제안값이며 공식 브랜드 규격이 아닙니다.</p>${Object.entries(ASSET_LABELS).map(([key, label]) => `<section class="asset-card"><h2>${label} <span class="optional">선택</span></h2><p class="helper">${key === 'logoDataUrl' ? '밝은 배경의 헤더·문서 표지 등 대표 위치에 사용합니다.' : key === 'darkLogoDataUrl' ? '어두운 배경에서도 읽히도록 별도로 준비한 원본을 넣습니다. 자동 반전하지 않습니다.' : '앱 아이콘·좁은 헤더 등 작은 공간에서 사용할 심볼 원본을 넣습니다.'}</p><div class="asset-image ${key === 'darkLogoDataUrl' ? 'dark' : ''}">${project[key] ? `<img src="${h(project[key])}" alt="${label} 원본">` : '<span>지정한 파일 없음</span>'}</div><div class="upload-row"><label class="upload-label">${label} 파일 선택<input class="file-input" type="file" data-image="${key}" accept="image/png,image/jpeg,image/webp"></label>${project[key] ? `<button class="text-button" data-remove-image="${key}">${label} 빼기</button>` : ''}</div></section>`).join('')}<p class="helper">PNG·JPG·WebP / 파일당 2 MB 이하. 색상·비율을 자동 변경하지 않습니다.</p>${numbers(['logoClearSpace', 'logoMinWidth', 'symbolMinSize'])}${field('logoUsage', { rows: 3, placeholder: '예: 기본 로고는 밝은 헤더 왼쪽, 어두운 배경용은 진한 표지에만 사용. 제공된 실제 기준이 있으면 기록하세요.' })}${field('symbolUsage', { rows: 3, placeholder: '예: 좁은 모바일 헤더와 앱 아이콘. 단독 사용 가능한 위치와 크기를 적어 주세요.' })}${field('logoAvoid', { rows: 3 })}`;
}
function typographyPanel() {
  const d = project.design;
  return ['body', 'heading'].map(role => {
    const key = role === 'body' ? 'fontFamily' : 'headingFontFamily', label = role === 'body' ? '본문' : '제목', asset = project.fontAssets?.[role];
    return `<section class="asset-card"><h2>${label} 글꼴</h2><div class="field"><label for="font-${role}">${label} 글꼴 이름</label><input id="font-${role}" data-font-name="${key}" value="${h(d[key])}" list="fonts-${role}" maxlength="80" aria-describedby="font-help-${role} font-error-${role}"><datalist id="fonts-${role}">${[...FONTS, 'Noto Sans KR', 'Nanum Gothic'].map(f => `<option value="${f}"></option>`).join('')}</datalist><p class="helper" id="font-help-${role}">목록에서 고르거나 직접 입력하세요. 파일 없이 이름만 지정하면 이 PC의 설치 여부에 따라 대체 글꼴이 보일 수 있습니다.</p><span id="font-error-${role}" class="field-error" data-error="${key}" hidden>한글·영문·숫자·공백·마침표·밑줄·하이픈으로 입력하세요.</span></div><div class="upload-row"><label class="upload-label">${label} 글꼴 파일 선택 <span class="optional">(선택)</span><input class="file-input" type="file" data-font="${role}" accept=".ttf,.otf,.woff,.woff2"></label>${asset ? `<button class="text-button" data-remove-font="${role}">${label} 글꼴 파일 빼기</button>` : ''}</div><p class="helper">${asset ? `현재 파일: ${h(asset.name)} · 미리보기의 로딩 상태를 확인하세요.` : '글꼴 파일 미지정 · Pretendard는 기본 포함됩니다.'}</p></section>`;
  }).join('') + `<p class="helper">TTF·OTF·WOFF·WOFF2 / 파일당 5 MB 이하. 업로드한 파일의 실제 모양과 지원 굵기를 사용합니다. 여러 굵기가 필요하면 가변 글꼴을 권장합니다. 출처·라이선스는 아래에 직접 기록하세요.</p>${numbers(['baseSize', 'bodyWeight', 'lineHeight', 'headingSize', 'headingWeight', 'headingLineHeight', 'labelSize', 'captionSize', 'letterSpacing'])}${field('fontUsage', { rows: 3 })}${field('fontSource', { rows: 3, placeholder: '본문/제목 글꼴의 배포처 주소, 라이선스 이름, 웹·문서·재배포 가능 범위를 확인한 내용만 기록하세요.' })}`;
}

function toast(text) { $('#toast').textContent = text; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').hidden = true, 5000); }
function showError(text = '') { $('#global-error').textContent = text; $('#global-error').hidden = !text; }
function saveState(text, failed = false) { $('#save-state').textContent = text; $('#save-state').classList.toggle('failed', failed); }
async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', 'X-Design-Token': token, ...options.headers } });
  let result; try { result = await response.json(); } catch { throw Error('서버 응답을 읽지 못했습니다. 서버 창이 켜져 있는지 확인하세요.'); }
  if (!response.ok) throw Object.assign(Error(result.error || '요청을 처리하지 못했습니다.'), { status: response.status });
  return result;
}
function remember() {
  if (!project) return;
  try { localStorage.setItem('codeplant-design-draft-' + project.id, JSON.stringify({ revision: project.revision, design: project.design, ...assetSnapshot(), editedAt: new Date().toISOString() })); }
  catch { showError('브라우저 임시 백업을 만들지 못했습니다. 서버 저장 상태를 확인하거나 JSON 백업을 내려받으세요.'); }
}
function changed() {
  edit++; reviewed = false; remember(); saveState('변경 사항 있음'); clearTimeout(saveTimer); saveTimer = setTimeout(() => flush().catch(e => showError(e.message)), 700);
  clearTimeout(previewTimer); previewTimer = setTimeout(updatePreview, 180);
}
async function flush() {
  clearTimeout(saveTimer);
  if (invalid.size) { saveState('입력값 확인 필요', true); throw Error(invalid.has('fontFamily') || invalid.has('headingFontFamily') ? '글꼴 이름의 형식을 확인하세요. 한글·영문·숫자·공백·마침표·밑줄·하이픈을 사용할 수 있습니다.' : invalid.has('sourceUrl') ? '참고 주소는 http:// 또는 https://로 시작하는 전체 주소를 입력하세요. 비워 두어도 됩니다.' : '색상과 숫자의 형식·범위를 확인하세요. 잘못된 입력란에 안내가 표시됩니다.'); }
  if (saving) { await saving; if (saved < edit) return flush(); return; }
  if (!project || saved === edit) return;
  const version = edit, snapshot = structuredClone(project);
  validateDesign(snapshot.design); for (const k of Object.keys(ASSET_LABELS)) validateLogo(snapshot[k] || '');
  saveState('저장 중');
  saving = api('/api/projects/' + snapshot.id, { method: 'PUT', body: JSON.stringify({ revision: snapshot.revision, design: snapshot.design, ...assetSnapshot(snapshot) }) })
    .then(result => {
      project.revision = result.revision; project.updatedAt = result.updatedAt; saved = version;
      if (edit === version) { try { localStorage.removeItem('codeplant-design-draft-' + project.id); } catch {} saveState('이 PC에 저장됨'); }
      else { remember(); saveState('변경 사항 있음'); }
      const item = projects.find(p => p.id === project.id); if (item) Object.assign(item, { name: project.design.name || '이름 없는 디자인', revision: project.revision }); renderProjects(); showError();
    }).catch(e => { saveState('저장 실패 · JSON 백업 가능', true); remember(); throw e; }).finally(() => { saving = null; });
  await saving;
  if (saved < edit) return flush();
}
function field(key, { rows = 0, placeholder = '', helper = '', required = false } = {}) {
  const value = project.design[key];
  return `<div class="field"><label for="f-${key}">${h(TEXT_LABELS[key])}${required ? '<span class="required">필수</span>' : ''}</label>${rows ? `<textarea id="f-${key}" data-field="${key}" rows="${rows}" maxlength="${key === 'sources' ? 24000 : 6000}" placeholder="${h(placeholder)}">${h(value)}</textarea>` : `<input id="f-${key}" data-field="${key}" value="${h(value)}" maxlength="${key === 'name' ? 100 : 6000}" placeholder="${h(placeholder)}" ${key === 'sourceUrl' ? 'type="url"' : ''}>`}${helper ? `<p class="helper">${helper}</p>` : ''}</div>`;
}
function actions() {
  return `<div class="step-actions">${step > 0 ? `<button class="button secondary" data-go="${step - 1}">이전 단계</button>` : ''}${step < 3 ? `<button class="button primary next" data-go="${step + 1}">${['디자인 규칙 다듬기', '적용 화면 확인하기', '내보내기 준비하기'][step]} <span aria-hidden="true">→</span></button>` : ''}</div>`;
}
function aiBox() {
  const choices = providers.length ? providers.map(p => `<option value="${p.id}" ${p.id === provider ? 'selected' : ''}>${h(p.label)} · ${p.loggedIn ? '로그인 확인' : p.installed ? '로그인 필요' : '설치 필요'}</option>`).join('') : '<option value="codex">Codex · 확인 중</option><option value="claude">Claude Code · 확인 중</option>';
  const running = currentJob && ['running', 'cancelling'].includes(currentJob.status);
  return `<div class="ai-box"><h2>AI와 함께 정리해 볼까요?</h2><p>기획과 참고 글을 바탕으로 디자인 규칙을 제안받습니다.<br>지금 값은 유지되고, 변경 내용을 확인한 뒤 적용합니다.</p><div class="field"><label for="ai-instruction">추가로 부탁할 내용 <span class="optional">선택</span></label><textarea id="ai-instruction" maxlength="4000" placeholder="예: 본문이 잘 읽히도록 색상 대비와 글자 크기를 다듬어줘.">${h(instruction)}</textarea></div><div class="ai-controls"><select id="ai-provider" aria-label="디자인 규칙을 제안할 AI">${choices}</select><button id="generate" class="button primary" ${running ? 'disabled' : ''}>AI 초안 제안받기</button></div><p class="helper">이름과 서비스 목적을 먼저 적어 주세요. 요청 시 이 기획·참고 글·현재 규칙이 선택한 AI에 전달되며 계정 사용량을 소비합니다. 참고 주소는 자동으로 읽지 않습니다.</p><div id="job-status"></div>${undo ? '<button id="undo" class="text-button">마지막 AI 제안 적용 취소</button>' : ''}</div>`;
}
function renderJob() {
  const host = $('#job-status'); if (!host) return;
  if (!currentJob || currentJob.projectId !== project.id) { host.innerHTML = ''; return; }
  const running = ['running', 'cancelling'].includes(currentJob.status);
  host.innerHTML = `<div class="job-status ${running ? 'running' : currentJob.status === 'failed' ? 'failed' : ''}" role="status">${h(currentJob.message)} ${running ? '<button id="cancel-job" class="text-button">중지</button>' : currentJob.status === 'completed' ? '<button id="review-proposal" class="button secondary small">제안 내용 확인</button>' : ''}</div>`;
  if ($('#generate')) $('#generate').disabled = running;
}
function render() {
  if (!project) return;
  const d = project.design;
  document.querySelectorAll('.step').forEach((button, index) => { button.classList.toggle('active', index === step); if (index === step) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current'); });
  let content = `<p class="page-number"><span>0${step + 1}</span> ${['방향 정하기', '디자인 규칙', '적용해 보기', '자료 내보내기'][step]}</p>`;
  if (step === 0) content += `<h1 class="hero-title">흩어진 생각을,<br>하나의 디자인으로.</h1><p class="lede">누구를 위한 서비스인지부터 시작하세요.<br>내가 정한 기준이 색상과 글꼴, 화면의 규칙이 됩니다.</p><div class="starter-note"><b>처음이어도, 여기서 시작하면 됩니다.</b>CODEPLANT 기본값을 준비했어요. 기획에 맞춰 자유롭게 바꾸고 나만의 디자인 시스템으로 완성하세요.</div>${field('name', { required: true, placeholder: '예: 우리 동아리의 디자인 시스템' })}${field('purpose', { rows: 3, required: true, placeholder: '어떤 서비스를 만들고 싶나요? 사용자가 무엇을 할 수 있으면 좋을까요?' })}<div class="two-columns">${field('audience', { placeholder: '예: 처음 코딩을 배우는 학생' })}${field('voice', { placeholder: '예: 차분하고 이해하기 쉬운' })}</div><div class="section-title"><h2>참고 자료를 모아 주세요</h2><span class="optional">선택</span></div>${field('sources', { rows: 4, placeholder: '이미 정한 브랜드 규칙, 마음에 드는 이유, 반드시 지켜야 할 기준을 적어 주세요.' })}${field('sourceUrl', { placeholder: 'https://', helper: '주소는 출처로 기록합니다. 자동으로 방문하지 않으니 필요한 내용은 위에 붙여 넣으세요.' })}<div class="upload-row"><label class="upload-label">+ 참고 글 추가<input class="file-input" id="source-file" type="file" accept=".md,.txt,.css,.json"></label><label class="upload-label">+ 내 로고 넣기<input class="file-input" id="logo-file" type="file" accept="image/png,image/jpeg,image/webp"></label><label class="upload-label">편집 JSON 가져오기<input class="file-input" id="import-file" type="file" accept=".json"></label></div><p class="helper">참고 글: MD·TXT·CSS·JSON / 100 KB 이하 · 로고: PNG·JPG·WebP / 2 MB 이하<br>편집 JSON은 이 서비스에서 내보낸 파일을 새 디자인으로 엽니다.<br>심볼·배경별 로고와 상세 규격은 다음 단계의 ‘로고·심볼’에서 지정합니다.</p><div id="logo-state"></div>${aiBox()}`;
  if (step === 1) {
    content += `<h1 class="page-title">반복해서 쓸 수 있는,<br>나만의 디자인 규칙.</h1><p class="lede">한 곳을 바꾸면 오른쪽 화면도 함께 달라집니다.<br>마음에 드는 값과 사용할 이유를 남겨 보세요.</p><div class="tabs" role="tablist" aria-label="디자인 규칙 종류">${TABS.map(([k, v]) => `<button id="tab-${k}" role="tab" tabindex="${tab === k ? 0 : -1}" aria-selected="${tab === k}" aria-controls="token-panel" data-tab="${k}" class="${tab === k ? 'active' : ''}">${v}</button>`).join('')}</div><div id="token-panel" role="tabpanel" aria-labelledby="tab-${tab}">`;
    if (tab === 'brand') content += brandPanel();
    if (tab === 'colors') content += Object.entries(COLOR_LABELS).map(([k, label]) => `<div class="color-field"><input type="color" data-color="${k}" value="${d.colors[k]}" aria-label="${label} 색상 선택"><div class="color-name">${label}<small>${COLOR_HELP[k]}</small></div><div><input class="hex" data-hex="${k}" value="${d.colors[k]}" aria-label="${label} HEX 값" maxlength="7" spellcheck="false"><span class="field-error error" data-error="${k}" hidden>#RRGGBB 형식</span></div></div>`).join('') + '<p class="helper">색상은 # 뒤에 여섯 자리로 입력하세요. ‘적용해 보기’에서 글자 대비를 점검할 수 있습니다.</p>';
    if (tab === 'type') content += typographyPanel();
    if (tab === 'layout') content += numbers(['spacing', 'controlRadius', 'cardRadius', 'contentWidth']) + '<p class="helper">기본 간격의 1·2·3·4배를 사용하면 여백을 일관되게 유지할 수 있습니다. 모서리 값 0은 직각입니다.</p>';
    if (tab === 'rules') content += field('principles', { rows: 4 }) + field('components', { rows: 6 }) + field('writing', { rows: 4 }) + field('avoid', { rows: 4 }) + field('imageRules', { rows: 4, placeholder: '아이콘의 선 굵기·채움 여부, 사진의 톤과 출처, 이미지 사용 금지 규칙 등' });
    content += `</div>${aiBox()}`;
  }
  if (step === 2) {
    const results = checks(d), passed = results.filter(x => x.pass).length;
    content += `<h1 class="page-title">실제 화면에 놓고,<br>한 번 더 확인하세요.</h1><p class="lede">오른쪽 버튼과 입력창을 직접 조작해 보세요.<br>넓은 화면과 모바일에서 같은 규칙이 자연스러운지 확인합니다.</p><div class="section-title"><h2>글자 대비 자동 점검</h2><span class="optional">${passed} / ${results.length} 조합 충족</span></div>${results.map(x => `<div class="check-row"><div>${h(x.label)}<small>대비 ${x.ratio.toFixed(2)}:1 · 일반 글자 기준 4.5:1</small></div><span class="check-badge ${x.pass ? 'pass' : 'fail'}">${x.pass ? '기준 충족' : '수정 권장'}</span></div>`).join('')}<p class="helper">위 네 조합의 색상 대비만 계산합니다. 전체 접근성이나 모든 상태가 검증됐다는 뜻은 아닙니다. 성공·오류 색상은 실제 사용 배경에서 추가 확인하세요.</p><div class="section-title"><h2>직접 확인할 것</h2></div><ul class="checklist"><li>대표 버튼과 보조 버튼이 구분되나요?</li><li>Tab 키로 이동할 때 선택 위치가 보이나요?</li><li>오류 안내와 비활성 상태도 읽을 수 있나요?</li><li>모바일에서도 글자와 입력창이 잘 보이나요?</li><li>예시 문장이 아닌 내 서비스의 기준이 기록됐나요?</li></ul><button class="button secondary" data-go="1">디자인 규칙 수정하기</button>`;
  }
  if (step === 3) {
    const warnings = checks(d).filter(x => !x.pass);
    content += `<h1 class="page-title">이제, 내 디자인을<br>다음 작업으로 가져가세요.</h1><p class="lede">규칙과 편집 데이터, 확인용 화면을 함께 묶습니다.<br>압축을 풀어 Codex에서 최종 스킬을 이어서 만드세요.</p><div class="starter-note"><b>여기서는 디자인 시스템 자료가 완성됩니다.</b>최종 SKILL.md는 이 서비스에서 만들지 않습니다. 아래 자료를 Codex에 전달해 제작하세요.</div><div class="section-title"><h2>하나의 ZIP에 담기는 자료</h2></div>${[['DESIGN.md', '목적·색상·글꼴·컴포넌트·출처를 담은 한국어 규칙'], ['tokens.json', '나중에 이 서비스에서 다시 편집할 수 있는 데이터'], ['tokens.css', '구현에 그대로 사용할 수 있는 CSS 변수'], ['preview.html', '디자인이 적용된 화면과 컴포넌트 상태 예시'], ['CODEX-HANDOFF.md', 'Codex에서 스킬 제작을 이어가는 방법'], ['assets/', '로고·심볼·글꼴 원본과 Pretendard 라이선스']].map(([name, desc]) => `<div class="file-row"><code>${name}</code><small>${desc}</small></div>`).join('')}${warnings.length ? `<p class="starter-note" style="margin-top:20px">대비 수정 권장: ${warnings.map(x => h(x.label)).join(', ')}. 자료에도 점검 결과가 기록됩니다.</p>` : ''}<label class="confirm-label"><input id="reviewed" type="checkbox" ${reviewed ? 'checked' : ''}><span>디자인 규칙과 참고 출처, 적용 화면을 확인했습니다.</span></label><div class="download-actions"><button id="download-zip" class="button primary" ${reviewed ? '' : 'disabled'}>디자인 시스템 ZIP 받기 <span aria-hidden="true">↓</span></button><button id="download-md" class="button secondary" ${reviewed ? '' : 'disabled'}>규칙 문서만 받기</button></div><div class="section-title"><h2>Codex에 이렇게 요청하세요</h2><button id="copy-handoff" class="text-button">요청문 복사</button></div><div class="handoff-text">${h(handoffPrompt)}</div><p class="helper">압축을 푼 폴더를 Codex에서 먼저 열어 주세요. 이 앱의 제작 화면과 사용자 디자인 자료는 별개이며, CODEPLANT 로고는 내보내기에 자동으로 넣지 않습니다.</p>`;
  }
  $('#editor-content').innerHTML = content + actions();
  renderLogo(); renderJob(); updatePreview(); renderProjects();
}
function numbers(keys) {
  return keys.map(k => `<div class="number-field"><label for="n-${k}">${NUMBER_LABELS[k][0]}<small>${NUMBER_LABELS[k][1]}</small></label><div><input id="n-${k}" type="number" data-number="${k}" value="${project.design[k]}" min="${NUMBER_RULES[k][0]}" max="${NUMBER_RULES[k][1]}" step="${['lineHeight', 'headingLineHeight', 'letterSpacing'].includes(k) ? '.1' : k.endsWith('Weight') ? '100' : '1'}"><span class="field-error" data-error="${k}" hidden>범위를 확인하세요.</span></div></div>`).join('');
}
function renderLogo() {
  const host = $('#logo-state'); if (!host) return;
  host.innerHTML = project.logoDataUrl ? `<div class="logo-preview"><img src="${h(project.logoDataUrl)}" alt="내가 넣은 프로젝트 로고"><button id="remove-logo" class="text-button">로고 빼기</button></div>` : '';
}
function renderProjects() {
  $('#projects').innerHTML = projects.map(p => `<button data-project="${p.id}" class="project-link ${p.id === project?.id ? 'selected' : ''}" ${p.error ? 'disabled' : ''} title="${h(p.name)}">${h(p.name)}</button>`).join('');
}
function updatePreview() {
  if (!project) return;
  try {
    let html = previewHtml(project.design, project.logoDataUrl, assetSnapshot());
    html = html.replace('<head>', `<head><base href="${location.origin}/">`);
    $('#preview').srcdoc = html;
    $('#preview-swatches').innerHTML = ['primary', 'accent', 'text', 'surface'].map(k => `<i style="background:${project.design.colors[k]}" title="${COLOR_LABELS[k]}"></i>`).join('');
  } catch (e) { showError(e.message); }
}
async function go(target) {
  if (target > 0 && (!project.design.name.trim() || !project.design.purpose.trim())) {
    step = 0; render(); $('#f-' + (!project.design.name.trim() ? 'name' : 'purpose')).focus(); throw Error('디자인 시스템 이름과 서비스 목적을 먼저 입력하세요.');
  }
  await flush(); step = target; render(); $('#main').focus();
}
function download(data, name, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type }); const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
async function copy(text) { try { await navigator.clipboard.writeText(text); toast('복사했습니다.'); } catch { throw Error('클립보드를 사용할 수 없습니다. 표시된 요청문이나 명령을 직접 선택해 복사하세요.'); } }
async function backup() { download(JSON.stringify({ schemaVersion: 1, design: project.design, ...assetSnapshot(), fontAssets: undefined, fontFiles: await fontFilesFor(project) }, null, 2), 'design-backup.json', 'application/json'); toast('현재 편집값의 JSON 백업을 내려받았습니다.'); }
async function newProject(design = initialDesign(), logoDataUrl = '', extra = {}) {
  await flush(); const p = await api('/api/projects', { method: 'POST', body: JSON.stringify({ design, logoDataUrl, ...extra }) });
  p.design = validateDesign(p.design); p.fontAssets ||= {};
  project = p; try { localStorage.setItem('codeplant-design-active', p.id); } catch {}
  projects.unshift({ id: p.id, name: p.design.name || '이름 없는 디자인', revision: p.revision, updatedAt: p.updatedAt }); edit = saved = 0; step = 0; undo = null; currentJob = null; reviewed = false; invalid.clear(); render(); saveState('이 PC에 저장됨');
}
async function openProject(id) {
  await flush(); clearTimeout(pollTimer); const p = await api('/api/projects/' + id);
  p.design = validateDesign(p.design); p.fontAssets ||= {};
  project = p; try { localStorage.setItem('codeplant-design-active', p.id); } catch {}
  edit = saved = 0; step = 0; undo = null; currentJob = null; reviewed = false; invalid.clear();
  try {
    const draft = JSON.parse(localStorage.getItem('codeplant-design-draft-' + id) || 'null');
    if (draft && draft.editedAt > p.updatedAt) {
      if (draft.revision === p.revision) { project.design = validateDesign(draft.design); Object.assign(project, assetSnapshot(draft)); edit++; toast('저장되지 않았던 이 브라우저의 편집값을 복구했습니다. 지금 저장을 눌러 주세요.'); }
      else showError('이 브라우저의 임시 편집본과 서버 자료가 다릅니다. 서버 자료를 열었습니다. 다른 탭의 편집값을 먼저 JSON으로 백업하세요.');
    }
  } catch { showError('브라우저 임시 편집본을 읽지 못했습니다. 서버에 저장된 자료를 열었습니다.'); }
  render(); saveState(edit ? '복구된 편집값 · 저장 필요' : '이 PC에 저장됨');
  fontFilesFor(project).catch(e => showError(e.message));
  const job = p.jobs?.at(-1); if (job) { currentJob = await api('/api/jobs/' + job.id); renderJob(); if (['running', 'cancelling'].includes(currentJob.status)) pollJob(); }
}
function renderConnections() {
  const ready = providers.filter(p => p.loggedIn);
  $('#connection-summary').textContent = ready.length ? ready.map(p => p.label).join(' · ') + ' 로그인 확인' : providers.length ? '로그인 또는 설치 확인 필요' : '설치 상태 확인 중';
  $('.connection-dot').classList.toggle('ready', ready.length > 0);
  $('#providers').innerHTML = providers.map(p => `<section class="provider-card"><div class="provider-title">${h(p.label)}<span class="check-badge ${p.loggedIn ? 'pass' : 'fail'}">${p.loggedIn ? '로그인 확인' : p.state === 'error' ? '실행 확인 필요' : p.installed ? '로그인 필요' : '설치 필요'}</span></div><p>${h(p.message)}</p>${p.version ? `<p>${h(p.version)}</p>` : ''}<code>${h(p.installed ? p.login : p.install)}</code><div class="upload-row"><button class="button secondary small" data-copy-provider="${p.id}">${p.installed ? '로그인' : '설치'} 명령 복사</button>${p.installed ? `<button class="button secondary small" data-login="${p.id}">로그인 터미널 열기</button>` : ''}<a class="button secondary small" href="${h(p.url)}" target="_blank" rel="noreferrer">공식 안내</a></div>${p.location ? `<details><summary>찾은 설치 경로</summary><p class="location">${h(p.location)}</p></details>` : ''}</section>`).join('');
  if ($('#ai-provider')) { const choice = $('#ai-provider'); choice.innerHTML = providers.map(p => `<option value="${p.id}">${h(p.label)} · ${p.loggedIn ? '로그인 확인' : p.installed ? '로그인 필요' : '설치 필요'}</option>`).join(''); choice.value = provider; }
}
async function refreshConnections() {
  const button = $('#refresh-connections'); button.disabled = true; button.textContent = '설치와 로그인 확인 중…';
  try { const data = await api('/api/providers/refresh', { method: 'POST', body: '{}' }); providers = data.providers; if (!providers.find(p => p.id === provider)?.loggedIn) provider = providers.find(p => p.loggedIn)?.id || provider; renderConnections(); }
  finally { button.disabled = false; button.textContent = '설치 · 로그인 새로 확인'; }
}
async function pollJob() {
  clearTimeout(pollTimer); if (!currentJob) return;
  try {
    const result = await api('/api/jobs/' + currentJob.id);
    if (result.projectId !== project.id) return;
    currentJob = result; renderJob();
    if (['running', 'cancelling'].includes(result.status)) pollTimer = setTimeout(pollJob, 1800);
    else if (result.status === 'completed') toast('AI 제안이 도착했습니다. 변경 내용을 확인하세요.');
  } catch (e) { showError(e.message + ' AI 상태 확인을 다시 시도합니다.'); pollTimer = setTimeout(pollJob, 5000); }
}
function showProposal() {
  if (!currentJob?.design) return;
  const before = project.design, after = currentJob.design;
  const changedFields = [...Object.keys(TEXT_LABELS), 'fontFamily', 'headingFontFamily', ...Object.keys(NUMBER_RULES), 'colors'].filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  $('#proposal-content').innerHTML = changedFields.length ? changedFields.map(k => `<section class="change-item"><h3>${h(TEXT_LABELS[k] || NUMBER_LABELS[k]?.[0] || (k === 'colors' ? '색상' : k === 'headingFontFamily' ? '제목 글꼴' : '본문 글꼴'))}</h3><div class="change-values"><div><small>현재 규칙</small>${h(k === 'colors' ? Object.entries(before.colors).map(([key, v]) => `${COLOR_LABELS[key]} ${v}`).join('\n') : before[k] || '(미입력)')}</div><div><small>AI 제안</small>${h(k === 'colors' ? Object.entries(after.colors).map(([key, v]) => `${COLOR_LABELS[key]} ${v}`).join('\n') : after[k] || '(미입력)')}</div></div></section>`).join('') : '<p class="helper">현재 규칙과 같은 제안입니다.</p>';
  if (currentJob.baseRevision !== project.revision) $('#proposal-content').insertAdjacentHTML('afterbegin', '<p class="starter-note">AI에 요청한 뒤 편집본이 바뀌었습니다. 제안을 적용하면 위 항목이 현재 규칙 대신 사용됩니다. 변경 내용을 주의해서 비교하세요.</p>');
  $('#apply-proposal').disabled = changedFields.length === 0; $('#proposal-dialog').showModal();
}

document.addEventListener('input', event => {
  const target = event.target;
  if (target.id === 'ai-instruction') { instruction = target.value; return; }
  if (target.id === 'reviewed') { reviewed = target.checked; $('#download-zip').disabled = !reviewed; $('#download-md').disabled = !reviewed; return; }
  if (!project) return;
  const key = target.dataset.fontName || target.dataset.field || target.dataset.number || target.dataset.hex || target.dataset.color;
  if (!key) return;
  let value = target.value, valid = true;
  if (target.dataset.hex || target.dataset.color) {
    valid = /^#[\da-f]{6}$/i.test(value);
    if (valid) { project.design.colors[key] = value.toUpperCase(); document.querySelectorAll(`[data-hex="${key}"],[data-color="${key}"]`).forEach(el => el.value = value.toUpperCase()); }
  } else if (target.dataset.number) { value = Number(value); valid = target.value !== '' && value >= NUMBER_RULES[key][0] && value <= NUMBER_RULES[key][1]; if (valid) project.design[key] = value; }
  else { project.design[key] = value; }
  if (target.dataset.fontName) valid = /^[a-zA-Z0-9가-힣 ._-]{1,80}$/.test(value);
  if (['bodyWeight', 'headingWeight'].includes(key)) valid = valid && Number(value) % 100 === 0;
  if (key === 'sourceUrl' && value) { try { const u = new URL(value); valid = ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password; } catch { valid = false; } }
  const message = document.querySelector(`[data-error="${key}"]`); if (message) message.hidden = valid;
  if (key === 'sourceUrl') {
    let help = $('#source-url-error');
    if (!help) { help = document.createElement('p'); help.id = 'source-url-error'; help.className = 'field-error'; target.insertAdjacentElement('afterend', help); target.setAttribute('aria-describedby', help.id); }
    help.textContent = valid ? '' : 'http:// 또는 https://로 시작하는 전체 주소를 입력하세요. 선택 항목이므로 비워 두어도 됩니다.'; help.hidden = valid;
  }
  target.setAttribute('aria-invalid', String(!valid)); valid ? invalid.delete(key) : invalid.add(key);
  changed();
});
document.addEventListener('change', async event => {
  const target = event.target;
  if (target.id === 'ai-provider') { provider = target.value; return; }
  const file = target.files?.[0]; if (!file) return;
  const ownerId = project.id;
  const ensureCurrent = () => { if (project.id !== ownerId) throw Error('파일을 읽는 동안 다른 디자인으로 이동했습니다. 원래 디자인에서 다시 파일을 선택하세요.'); };
  target.disabled = true; target.closest('label')?.setAttribute('aria-busy', 'true');
  try {
    if (target.id === 'source-file') {
      if (!/\.(md|txt|css|json)$/i.test(file.name)) throw Error('참고 글은 MD·TXT·CSS·JSON 파일로 넣으세요.');
      if (file.size > 100000) throw Error('참고 글은 100 KB 이하로 넣으세요. 필요한 부분만 붙여 넣어도 됩니다.');
      const content = await file.text(); ensureCurrent(); const next = project.design.sources + `\n\n[사용자 참고 글: ${file.name}]\n` + content;
      if (next.length > 24000) throw Error('참고 자료는 합계 24,000자 이하로 넣으세요. 핵심 규칙을 추려 주세요.');
      project.design.sources = next; changed(); render(); toast('참고 글을 추가했습니다. 출처와 내용을 확인하세요.');
    } else if (target.id === 'logo-file' || target.dataset.image) {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2097152) throw Error('로고는 2 MB 이하의 PNG·JPG·WebP 이미지로 넣으세요.');
      const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(Error('로고 파일을 읽지 못했습니다.')); reader.readAsDataURL(file); });
      ensureCurrent(); project[target.dataset.image || 'logoDataUrl'] = validateLogo(data); changed(); render();
    } else if (target.dataset.font) {
      const role = target.dataset.font, format = file.name.split('.').pop().toLowerCase();
      if (!['ttf', 'otf', 'woff', 'woff2'].includes(format) || file.size > 5242880) throw Error('글꼴은 5 MB 이하의 TTF·OTF·WOFF·WOFF2 파일로 넣으세요.');
      const value = validateFont({ name: file.name, dataUrl: (await asDataUrl(file)).replace(/^data:[^;]*;/, `data:font/${format};`) });
      ensureCurrent(); await flush(); ensureCurrent();
      const asset = await api(`/api/projects/${ownerId}/fonts/${role}`, { method: 'POST', body: JSON.stringify(value) });
      if (project.id !== ownerId) { toast('업로드 중 다른 디자인으로 이동했습니다. 원래 디자인에서 다시 파일을 지정하세요.'); return; }
      fontCache.set(asset.id, value.dataUrl); project.fontAssets[role] = asset; changed(); render(); toast('글꼴 파일을 넣었습니다. 미리보기에서 실제 로딩 상태를 확인하세요.');
    } else if (target.id === 'import-file') {
      if (file.size > 24000000) throw Error('편집 JSON은 24 MB 이하로 넣으세요.');
      let data; try { data = JSON.parse(await file.text()); } catch { throw Error('JSON 파일을 읽지 못했습니다. 이 서비스에서 받은 tokens.json을 선택하세요.'); }
      if (data.schemaVersion !== 1) throw Error('지원하지 않는 편집 파일입니다. schemaVersion 1의 tokens.json을 선택하세요.');
      await newProject(validateDesign(data.design), validateLogo(data.logoDataUrl || ''), { darkLogoDataUrl: validateLogo(data.darkLogoDataUrl || ''), symbolDataUrl: validateLogo(data.symbolDataUrl || ''), fontFiles: data.fontFiles || {} }); await fontFilesFor(project); toast('편집 파일을 새 디자인 시스템으로 열었습니다.');
    }
  } catch (e) { showError(e.message); toast(e.message); }
  target.value = ''; target.disabled = false; target.closest('label')?.removeAttribute('aria-busy');
});
document.addEventListener('click', async event => {
  const b = event.target.closest('button'); if (!b) return;
  try {
    if (b.dataset.close) { $('#' + b.dataset.close).close(); return; }
    if (b.dataset.step !== undefined || b.dataset.go !== undefined) { await go(Number(b.dataset.step ?? b.dataset.go)); return; }
    if (b.dataset.tab) { if (invalid.size) throw Error('잘못된 색상·숫자 값을 먼저 수정하세요.'); tab = b.dataset.tab; render(); $('#tab-' + tab).focus(); return; }
    if (b.dataset.removeImage) { project[b.dataset.removeImage] = ''; changed(); render(); return; }
    if (b.dataset.removeFont) { delete project.fontAssets[b.dataset.removeFont]; changed(); render(); return; }
    if (b.dataset.project) { await openProject(b.dataset.project); return; }
    if (b.dataset.copyProvider) { const p = providers.find(x => x.id === b.dataset.copyProvider); await copy(p.installed ? p.login : p.install); return; }
    if (b.dataset.login) { b.disabled = true; try { const result = await api('/api/providers/' + b.dataset.login + '/login', { method: 'POST', body: '{}' }); toast(result.message); } finally { b.disabled = false; } return; }
    if (b.id === 'connections-button') { $('#connections-dialog').showModal(); if (!providers.length) await refreshConnections(); }
    if (b.id === 'refresh-connections') await refreshConnections();
    if (b.id === 'save-now') { await flush(); toast('현재 디자인이 이 PC에 저장돼 있습니다.'); }
    if (b.id === 'backup') await backup();
    if (b.id === 'new-project') { await newProject(); $('#f-name').focus(); }
    if (b.id === 'remove-logo') { project.logoDataUrl = ''; changed(); renderLogo(); }
    if (b.id === 'mobile-preview' || b.id === 'desktop-preview') { const mobile = b.id === 'mobile-preview'; $('#preview-stage').classList.toggle('mobile', mobile); [$('#desktop-preview'), $('#mobile-preview')].forEach(x => { const selected = x === b; x.classList.toggle('selected', selected); x.setAttribute('aria-pressed', String(selected)); }); }
    if (b.id === 'copy-handoff') await copy(handoffPrompt);
    if (b.id === 'download-zip' || b.id === 'download-md') {
      if (!reviewed) return; await flush(); b.disabled = true;
      try {
        const extension = b.id === 'download-zip' ? 'export.zip' : 'design.md', response = await fetch(`/api/projects/${project.id}/${extension}?revision=${project.revision}`);
        if (!response.ok) { const result = await response.json(); throw Error(result.error); }
        download(await response.blob(), extension === 'export.zip' ? 'design-system.zip' : 'DESIGN.md'); toast('자료를 내려받았습니다. 다운로드 폴더에서 확인하세요.');
      } finally { b.disabled = !reviewed; }
    }
    if (b.id === 'generate') {
      if (!project.design.name.trim() || !project.design.purpose.trim()) { await go(0); throw Error('이름과 서비스 목적을 먼저 입력하세요.'); }
      if (!providers.find(p => p.id === provider)?.loggedIn) { $('#connections-dialog').showModal(); throw Error('선택한 AI의 설치와 로그인을 먼저 확인하세요.'); }
      await flush(); b.disabled = true;
      try { currentJob = await api('/api/jobs', { method: 'POST', body: JSON.stringify({ projectId: project.id, revision: project.revision, provider, instruction }) }); renderJob(); pollJob(); }
      catch (e) { b.disabled = false; throw e; }
    }
    if (b.id === 'cancel-job') { currentJob = await api('/api/jobs/' + currentJob.id + '/cancel', { method: 'POST', body: '{}' }); renderJob(); pollJob(); }
    if (b.id === 'review-proposal') showProposal();
    if (b.id === 'apply-proposal') {
      if (invalid.size) throw Error('잘못된 편집 값을 먼저 수정하세요.');
      await flush(); undo = { design: structuredClone(project.design), logoDataUrl: project.logoDataUrl }; project.design = validateDesign(currentJob.design); changed(); await flush(); $('#proposal-dialog').close(); render(); toast('AI 제안을 적용했습니다. 적용 취소로 되돌릴 수 있습니다.');
    }
    if (b.id === 'undo' && undo) { project.design = undo.design; project.logoDataUrl = undo.logoDataUrl; undo = null; invalid.clear(); changed(); await flush(); render(); toast('AI 제안 적용 전으로 되돌렸습니다.'); }
  } catch (e) { showError(e.message); toast(e.message); }
});
window.addEventListener('beforeunload', event => { if (edit !== saved || invalid.size) { remember(); event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('pagehide', () => { if (edit !== saved || invalid.size) remember(); });
document.addEventListener('keydown', event => {
  const target = event.target.closest('[data-tab]');
  if (!target || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  if (invalid.size) { toast('잘못된 입력값을 먼저 수정하세요.'); return; }
  const tabs = TABS.map(t => t[0]), index = tabs.indexOf(tab);
  tab = tabs[event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
  render(); $('#tab-' + tab).focus();
});
try {
  const state = await api('/api/state'); token = state.token; projects = state.projects; providers = state.providers;
  let selectedId; try { selectedId = localStorage.getItem('codeplant-design-active'); } catch {}
  if (projects.some(p => !p.error)) await openProject(projects.find(p => p.id === selectedId && !p.error)?.id || projects.find(p => !p.error).id); else await newProject();
  renderConnections(); refreshConnections().catch(e => showError(e.message));
} catch (e) { showError('작업실을 열지 못했습니다. ' + e.message + ' 서버 창이 켜져 있는지 확인하고 새로고침하세요.'); saveState('불러오기 실패', true); }
