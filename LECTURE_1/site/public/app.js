'use strict';

const $ = (selector, root = document) => root.querySelector(selector);
const providerNames = { codex: 'Codex', claude: 'Claude Code', gemini: 'Gemini' };
const providers = Object.keys(providerNames);
const cloudMode = !['127.0.0.1', 'localhost'].includes(location.hostname);
const apiBase = cloudMode ? 'http://127.0.0.1:49321' : '';
let bridgeToken = '';
try { if (cloudMode) bridgeToken = sessionStorage.getItem('attention-bridge-token') || ''; } catch {}
let mainChosen = false;
const statusNames = { running: '진행 중', completed: '완료', failed: '실패', stopped: '중지됨', interrupted: '중단됨', pending: '대기', queued: '대기', waiting: '대기', starting: '시작 중' };
let currentState = null;
let selectedRunId = null;
let initialSelection = true;
let renderedRunId = null;
let lastHistory = '';
let lastAgents = '';
let actionPending = false;
let pollTimer;
let disconnected = false;
let ended = false;
let uploading = false;
let composerRunId = null;
let lastRunAttachments = '';
let lastRunSettings = '';
let lastRunFiles = '';
const messageNodes = new Map();
const uploadNodes = new Map();
const uploadedFiles = new Map();
const selectedAttachments = new Set();
const followupDrafts = new Map();
const lastModelLists = new Map();
const mainRolePresets = {
  lead: '요청의 목표를 정리하고 근거와 불확실성을 구분하여 초안을 작성하세요. 상대 AI의 의견을 수용·보류·기각한 이유를 설명하고 최종 결과물을 정리하세요.',
  strategy: '고객·경쟁·자원·실행 조건을 기준으로 전략 대안을 비교하세요. 확인된 사실과 가정을 구분하고, 상대 AI의 검토를 반영해 선택 이유와 실행 조건을 정리하세요.',
  education: '학습 대상과 목표에 맞는 교육 흐름을 설계하세요. 활동 시간, 준비물, 시연 방법과 확인할 결과를 제시하고, 상대 AI의 검토를 반영해 수업안을 완성하세요.',
  research: '제공된 자료의 출처·기간·범위·단위를 확인해 핵심 내용을 분석하세요. 근거가 없는 주장은 미확인으로 표시하고, 상대 AI와 검토한 결과를 보고서로 정리하세요.'
};
const peerRolePresets = {
  critic: '메인 AI의 초안에서 논리적 약점, 반례, 누락과 과도한 단정을 검토하세요. 각 지적의 이유와 수정안을 제시하고, 근거가 부족한 부분은 불확실하다고 표시하세요.',
  evidence: '주요 주장과 수치가 자료의 출처·기간·범위·단위에 맞는지 확인하세요. 확인된 오류와 확인할 수 없는 부분을 구분하고, 수정 근거를 제시하세요.',
  execution: '제안의 실행 순서, 필요한 자원, 제약과 실패 가능성을 검토하세요. 확인되지 않은 비용이나 성과를 지어내지 말고, 우선순위와 점검할 조건을 제안하세요.',
  education: '학습자 관점에서 설명의 난이도와 활동 시간을 검토하세요. 막힐 수 있는 지점과 시연 실패 시 대안을 제시하고, 학습 목표와 결과가 연결되는지 확인하세요.'
};
const agentRolePresets = {
  analysis: { name: '분석 담당', task: '요청의 목표와 해결 방향을 분석하고, 근거가 필요한 지점을 정리해줘.' },
  review: { name: '검토 담당', task: '초안의 논리와 실행 가능성을 점검하고, 누락과 불확실성을 지적해줘.' },
  evidence: { name: '근거 확인 담당', task: '제공 자료를 기준으로 주요 주장과 수치의 출처·기간·범위·단위를 확인하고, 미확인 항목을 구분해줘.' },
  execution: { name: '실행 계획 담당', task: '필요한 준비물과 실행 순서, 제약과 실패 시 대안을 정리해줘. 확인하지 못한 비용이나 효과는 가정으로 표시해줘.' }
};

function node(tag, className, text) {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}

function setText(element, value) {
  const text = String(value ?? '');
  if (element.textContent !== text) element.textContent = text;
}

function statusLabel(status) { return statusNames[status] || status || '대기'; }
function statusClass(status) {
  if (status === 'completed' || status === 'ready') return 'good';
  if (status === 'failed' || status === 'interrupted') return 'bad';
  if (status === 'running' || status === 'starting') return 'busy';
  return 'neutral';
}
function formatTime(value, withDate = false) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ko-KR', withDate ? { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false } : { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

function readRoundSettings(mode, custom, condition) {
  if (mode === 'unlimited') return { rounds: null, stopCondition: String(condition || '').trim() };
  const rounds = Number(mode === 'custom' ? custom : mode);
  if (!Number.isSafeInteger(rounds) || rounds < 1) throw new Error('왕복 횟수는 1 이상의 정수로 입력해주세요.');
  return { rounds, stopCondition: '' };
}

function updateRoundFields() {
  const mode = $('#rounds').value;
  $('#custom-rounds-group').hidden = mode !== 'custom';
  $('#custom-rounds').disabled = mode !== 'custom';
  $('#custom-rounds').required = mode === 'custom';
  $('#stop-condition-group').hidden = mode !== 'unlimited';
  $('#stop-condition').disabled = mode !== 'unlimited';
}

function modelOptions(models, selected = '', previouslyDisabled = false) {
  const options = [{ id: '', label: 'CLI 기본값' }];
  for (const model of Array.isArray(models) ? models : []) {
    if (typeof model?.id !== 'string' || !model.id || model.id.length > 100 || !/^[a-zA-Z0-9._:/-]+$/.test(model.id) || model.id === '__custom__' || options.some(option => option.id === model.id)) continue;
    options.push({ id: model.id, label: typeof model.label === 'string' && model.label ? model.label : model.id, disabled: model.disabled === true });
  }
  if (selected && selected !== '__custom__' && !options.some(option => option.id === selected)) options.push({ id: selected, label: '이전 선택: ' + selected, disabled: previouslyDisabled });
  options.push({ id: '__custom__', label: '직접 입력' });
  return options;
}

function updateModelCustomField(provider) {
  const custom = $(`#${provider}-model-select`).value === '__custom__';
  $(`#${provider}-model-custom-group`).hidden = !custom;
  $(`#${provider}-model`).disabled = !custom;
  $(`#${provider}-model`).required = custom;
}

function readSelectedModel(provider) {
  const select = $(`#${provider}-model-select`);
  const selected = select.value;
  if (selected !== '__custom__' && Array.from(select.options || select.children || []).some(option => option.value === selected && option.disabled)) throw new Error(`${providerNames[provider]}의 선택한 모델은 현재 비활성 상태입니다. 다른 모델을 선택하거나 직접 입력해주세요.`);
  const model = selected === '__custom__' ? $(`#${provider}-model`).value.trim() : selected;
  if ((selected === '__custom__' && !model) || model.length > 100 || model && !/^[a-zA-Z0-9._:/-]+$/.test(model)) throw new Error(`${providerNames[provider]} 모델 이름의 형식을 확인해주세요.`);
  return model;
}

function renderModelOptions(provider, connection) {
  const select = $(`#${provider}-model-select`);
  const selected = select.value;
  const previous = Array.from(select.options || select.children || []).find(option => option.value === selected);
  const options = modelOptions(connection.models, selected, previous?.disabled === true);
  const signature = JSON.stringify(options);
  if (lastModelLists.get(provider) !== signature) {
    lastModelLists.set(provider, signature);
    select.replaceChildren();
    for (const item of options) {
      const option = node('option', '', item.label);
      option.value = item.id;
      option.disabled = item.disabled === true;
      select.append(option);
    }
    select.value = selected;
  }
  updateModelCustomField(provider);
  const hasModels = options.some(option => option.id && option.id !== '__custom__' && !option.label.startsWith('이전 선택: '));
  const unavailable = options.some(option => option.id === selected && option.disabled);
  const message = connection.modelListMessage || (hasModels ? '조회된 모델에서 선택하거나 직접 입력할 수 있습니다.' : '조회된 모델이 없습니다. CLI 기본값 또는 직접 입력을 사용할 수 있습니다.');
  setText($(`#${provider}-model-list-message`), message + (unavailable ? ' 현재 선택한 모델은 비활성 상태입니다. 사용할 모델을 다시 선택해주세요.' : ''));
}

function clampPanelWidths(widths, totalWidth) {
  const total = Math.max(840, Number.isFinite(totalWidth) ? totalWidth : 1191);
  const available = Math.floor(total - 360 - 20);
  const setup = Math.round(Math.min(Math.max(Number.isFinite(widths?.setup) ? widths.setup : 310, 240), available - 220));
  const activity = Math.round(Math.min(Math.max(Number.isFinite(widths?.activity) ? widths.activity : 278, 220), available - setup));
  return { setup, activity };
}

function connectPanelResize() {
  const workspace = $('.workspace');
  const desktop = window.matchMedia('(min-width:1191px)');
  const storageKey = 'codeplant-dialogue-panel-widths-v1';
  let widths = { setup: 310, activity: 278 };
  let drag = null;
  try { widths = JSON.parse(localStorage.getItem(storageKey)) || widths; } catch { /* Private browser storage can be unavailable. */ }
  const separators = [['setup', $('#setup-separator')], ['activity', $('#activity-separator')]];
  function apply() {
    if (!desktop.matches) return;
    const total = workspace.getBoundingClientRect().width;
    widths = clampPanelWidths(widths, total);
    workspace.style.setProperty('--setup-width', widths.setup + 'px');
    workspace.style.setProperty('--activity-width', widths.activity + 'px');
    for (const [side, separator] of separators) {
      separator.setAttribute('aria-valuemin', side === 'setup' ? '240' : '220');
      separator.setAttribute('aria-valuemax', String(Math.floor(total - 380 - widths[side === 'setup' ? 'activity' : 'setup'])));
      separator.setAttribute('aria-valuenow', String(widths[side]));
      separator.setAttribute('aria-valuetext', widths[side] + '픽셀');
    }
  }
  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify(widths)); } catch { /* Resizing still works without persistence. */ }
  }
  for (const [side, separator] of separators) {
    separator.addEventListener('pointerdown', event => {
      if (event.button !== 0 || !desktop.matches) return;
      event.preventDefault();
      drag = { id: event.pointerId, x: event.clientX, side, widths: { ...widths } };
      separator.setPointerCapture(event.pointerId);
      document.body.classList.add('resizing-panels');
    });
    separator.addEventListener('pointermove', event => {
      if (!drag || drag.id !== event.pointerId || drag.side !== side) return;
      const delta = event.clientX - drag.x;
      widths = { ...drag.widths, [side]: drag.widths[side] + (side === 'setup' ? delta : -delta) };
      apply();
    });
    const finish = () => {
      if (!drag || drag.side !== side) return;
      drag = null;
      document.body.classList.remove('resizing-panels');
      save();
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) separator.addEventListener(type, finish);
    separator.addEventListener('keydown', event => {
      if (!desktop.matches || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const delta = event.key === 'ArrowRight' ? 20 : -20;
      widths[side] += side === 'setup' ? delta : -delta;
      apply();
      save();
    });
  }
  $('#reset-layout').addEventListener('click', () => {
    widths = { setup: 310, activity: 278 };
    apply();
    try { localStorage.removeItem(storageKey); } catch { /* The current layout is still reset. */ }
  });
  window.addEventListener('resize', apply);
  desktop.addEventListener('change', apply);
  apply();
}

function notice(message, success = false) {
  const box = $('#notice');
  box.hidden = !message;
  box.className = `notice${success ? ' success' : ''}`;
  setText(box, message);
}

async function request(path, body) {
  if (cloudMode && !bridgeToken) throw new Error('먼저 내 PC를 연결하세요.');
  const options = body === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Local-Token': currentState?.token || '' },
    body: JSON.stringify(body)
  };
  if (cloudMode) options.headers = { ...options.headers, 'X-Local-Token': bridgeToken };
  const response = await fetch(apiBase + path, { ...options, targetAddressSpace: 'loopback' });
  if (cloudMode && response.status === 403) {
    sessionStorage.removeItem('attention-bridge-token');location.reload();
    throw new Error('PC 연결이 만료됐습니다. 다시 연결하세요.');
  }
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : {};
  if (!response.ok) throw new Error(data.error || data.message || `요청을 처리하지 못했습니다. (${response.status})`);
  return data;
}

function addRole(name = '', task = '', side = 'main', preset = 'custom') {
  const list = $(side === 'main' ? '#role-list' : side === 'peer' ? '#peer-role-list' : '#peer2-role-list');
  if (list.children.length >= 3) return;
  const card = $('#role-template').content.firstElementChild.cloneNode(true);
  $('.role-name', card).value = name;
  $('.role-task', card).value = task;
  const select = $('.role-preset', card);
  select.value = preset;
  select.addEventListener('change', () => {
    const value = agentRolePresets[select.value];
    if (value) {
      $('.role-name', card).value = value.name;
      $('.role-task', card).value = value.task;
    }
  });
  for (const selector of ['.role-name', '.role-task']) $(selector, card).addEventListener('input', () => { select.value = 'custom'; });
  $('.remove-role', card).addEventListener('click', () => { card.remove(); updateControls(); });
  list.append(card);
  updateControls();
}

function readRoles(selector) {
  return Array.from($(selector).children, card => ({ name: $('.role-name', card).value.trim(), task: $('.role-task', card).value.trim() }));
}

function connectRoleEditor(side, presets) {
  const select = $(`#${side}-role-preset`);
  const input = $(`#${side}-role`);
  input.value = presets[select.value] || '';
  select.addEventListener('change', () => {
    if (presets[select.value]) input.value = presets[select.value];
  });
  input.addEventListener('input', () => { select.value = 'custom'; });
}
function selectedPeers(){return [$('#peer-select').value,$('#second-peer-select').value].filter(Boolean);}
function readPeerSettings(){
  return Object.fromEntries(selectedPeers().map((p,i)=>[p,{role:$(i?'#peer2-role':'#peer-role').value.trim(),agentRoles:p==='gemini'?[]:readRoles(i?'#peer2-role-list':'#peer-role-list')}]));
}

function getSelectedRun() {
  return currentState?.runs?.find(run => run.id === selectedRunId) || null;
}

function activeRun() {
  return currentState?.runs?.find(run => run.id === currentState.activeRunId && run.status === 'running') || currentState?.runs?.find(run => run.status === 'running');
}

function availableUploads() {
  const files = new Map(uploadedFiles);
  for (const file of currentState?.uploads || []) files.set(file.id, { ...files.get(file.id), ...file });
  return Array.from(files.values());
}

function selectedFiles() {
  return availableUploads().filter(file => selectedAttachments.has(file.id));
}

function attachmentIds() { return selectedFiles().map(file => file.id); }

function fileSummary(file) {
  const bytes = Number(file.size || 0);
  const size = bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024).toLocaleString('ko-KR')}KB` : `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${size} · 추출 ${Number(file.chars || 0).toLocaleString('ko-KR')}자`;
}

function renderUploads() {
  const container = $('#uploads');
  const files = availableUploads();
  const empty = $('.sidebar-empty', container);
  if (files.length && empty) empty.remove();
  for (const file of files) {
    let card = uploadNodes.get(file.id);
    if (!card) {
      card = node('div', 'upload-item');
      const label = node('label', 'upload-selection');
      const checkbox = node('input');
      checkbox.type = 'checkbox';
      const description = node('span');
      description.append(node('strong', 'upload-name'), node('small', 'upload-meta'));
      label.append(checkbox, description);
      const warning = node('p', 'upload-warning');
      const details = node('details', 'upload-preview');
      details.append(node('summary', '', '추출 내용 미리보기'), node('pre'));
      card.append(label, warning, details);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          selectedAttachments.add(file.id);
        } else selectedAttachments.delete(file.id);
        updateAttachmentSummary();
      });
      uploadNodes.set(file.id, card);
      container.append(card);
    }
    $('input', card).checked = selectedAttachments.has(file.id);
    setText($('.upload-name', card), file.name || '자료');
    setText($('.upload-meta', card), fileSummary(file));
    const warning = $('.upload-warning', card);
    warning.hidden = !file.warning;
    setText(warning, file.warning || '');
    const preview = $('.upload-preview', card);
    preview.hidden = !file.preview;
    setText($('pre', preview), file.preview || '');
  }
  updateAttachmentSummary();
}

function updateAttachmentSummary() {
  const files = selectedFiles();
  const count = files.length;
  const chars = files.reduce((total, file) => total + Number(file.chars || 0), 0);
  setText($('#attachment-summary'), count ? `${count}개 선택 · 추출 텍스트 ${chars.toLocaleString('ko-KR')}자` : '선택한 자료가 없습니다.');
  setText($('#followup-attachments'), count ? `기존 자료를 유지하고, 내 자료에서 선택한 자료 ${count}개를 추가합니다.` : '기존 자료와 대화 내용을 유지합니다. 추가 자료는 내 자료에서 선택하세요.');
}

function renderRunAttachments(run) {
  const attachments = run?.attachments || [];
  const signature = JSON.stringify([run?.id, attachments]);
  if (signature === lastRunAttachments) return;
  lastRunAttachments = signature;
  $('#run-attachments').hidden = !attachments.length;
  setText($('#run-attachment-count'), attachments.length);
  const list = $('#run-attachment-list');
  list.replaceChildren();
  for (const file of attachments) {
    const item = node('div', 'run-attachment');
    item.append(node('strong', '', file.name || '자료'), node('small', '', fileSummary(file)));
    if (file.warning) item.append(node('p', 'upload-warning', file.warning));
    list.append(item);
  }
}

function renderRunSettings(run) {
  const signature = JSON.stringify([run?.id, run?.main, run?.mainRole, run?.peerRole, run?.agentRoles, run?.peerAgentRoles, run?.rounds, run?.stopCondition, run?.models, run?.peer,run?.peers,run?.peerSettings]);
  if (signature === lastRunSettings) return;
  lastRunSettings = signature;
  $('#run-settings').hidden = !run;
  const list = $('#run-setting-list');
  list.replaceChildren();
  if (!run) return;
  const rounds = run.rounds === null ? '횟수 제한 없이' : `${run.rounds || 1}회 왕복`;
  list.append(node('p', 'run-round-summary', (run.peer === null ? '메인 AI만 사용' : rounds) + (run.peer !== null && run.rounds === null ? ` · 종료: ${run.stopCondition || '수동 중지'}` : '')));
  const peer = run.peer === undefined ? (run.main === 'codex' ? 'claude' : 'codex') : run.peer;
  const peers=run.peers||[peer].filter(Boolean);
  for (const [label, provider, text, roles] of [
    ['메인', run.main, run.mainRole, run.agentRoles || []],
    ...peers.map((p,i)=>['상대 '+(i+1),p,run.peerSettings?.[p]?.role||run.peerRole,run.peerSettings?.[p]?.agentRoles||(i===0?run.peerAgentRoles||[]:[])])
  ]) {
    if (!provider) continue;
    const section = node('section', 'run-setting-side');
    section.append(node('h4', '', `${providerNames[provider] || provider} · ${label} 역할`));
    section.append(node('small', 'run-model-label', '선택 모델: ' + (run.models?.[provider] || 'CLI 기본값 · 모델 ID 지정 안 함')));
    section.append(node('p', '', text || '이전 작업입니다. 별도의 역할 문구가 기록되지 않았습니다.'));
    section.append(node('small', '', `서브 에이전트 ${roles.length}개`));
    for (const role of roles) {
      const item = node('p', 'run-setting-agent');
      item.append(node('strong', '', role.name || '역할'), node('span', '', role.task || ''));
      section.append(item);
    }
    list.append(section);
  }
}

function renderGeneratedFiles(run) {
  const files = run?.files || [];
  const signature = JSON.stringify([run?.id, files]);
  if (signature === lastRunFiles) return;
  lastRunFiles = signature;
  $('#generated-files').hidden = !files.length;
  setText($('#generated-file-count'), files.length);
  const list = $('#generated-file-list');
  list.replaceChildren();
  for (const file of files) {
    const item = node('div', 'generated-file');
    const link = node('a', '', file.name || '파일 내려받기');
    link.href = `/api/runs/${encodeURIComponent(run.id)}/files/${encodeURIComponent(file.id)}`;
    link.download = file.name || '';
    const bytes = Number(file.size || 0);
    const size = bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024).toLocaleString('ko-KR')}KB` : `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    item.append(link, node('small', '', size + (file.createdAt ? ' · ' + formatTime(file.createdAt, true) : '')));
    list.append(item);
  }
}

function renderComposer(run) {
  $('#followup-form').hidden = !run || run.mode==='codex-host';
  const id = run?.id || null;
  if (id !== composerRunId) {
    composerRunId = id;
    $('#followup-message').value = followupDrafts.get(id) || '';
  }
  setText($('#followup-model'), run ? `${providerNames[run.main] || run.main} 메인으로 이어가기` : '');
  updateAttachmentSummary();
}

function readBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('파일을 읽지 못했습니다. 파일이 다른 프로그램에서 사용 중인지 확인해주세요.'));
    reader.onabort = () => reject(new Error('파일 읽기가 중단됐습니다.'));
    reader.readAsDataURL(file);
  });
}

async function uploadFiles(files) {
  if (uploading) { notice('파일을 추가하고 있습니다. 완료된 뒤 다시 놓아주세요.'); return; }
  if (!files.length) return;
  if (!currentState?.token) { notice('로컬 서비스 연결을 확인한 뒤 파일을 추가해주세요.'); return; }
  uploading = true;
  updateControls();
  notice('');
  const errors = [];
  const status = $('#upload-status');
  status.hidden = false;
  try {
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      setText(status, `${index + 1}/${files.length} · ${file.name} 업로드 중…`);
      try {
        if (!/\.(txt|md|csv|json|pdf|docx|pptx)$/i.test(file.name)) throw new Error('지원하지 않는 파일 형식입니다.');
        const result = await request('/api/uploads', { name: file.name, base64: await readBase64(file) });
        if (!result.id) throw new Error('업로드 결과를 확인하지 못했습니다.');
        uploadedFiles.set(result.id, result);
        selectedAttachments.add(result.id);
        renderUploads();
      } catch (error) { errors.push(`${file.name}: ${error.message || '업로드하지 못했습니다.'}`); }
    }
    await refresh();
  } catch (error) { errors.push(error.message || '파일 목록을 새로 확인하지 못했습니다.'); }
  finally {
    uploading = false;
    $('#upload-files').value = '';
    status.hidden = true;
    if (errors.length) notice(errors.join('\n'));
    else notice('자료를 추가했습니다. 체크한 파일만 다음 작업에 전달합니다.', true);
    updateControls();
  }
}

function updateControls() {
  const finish=$('#finish-app');
  if(finish){
    finish.disabled=ended||actionPending||uploading||!currentState?.canShutdown||Boolean(currentState?.activeRunId)||Boolean(currentState?.installing)||Object.values(currentState?.connections||{}).some(c=>c.loginRunning||c.logoutRunning);
    finish.title='진행 중인 대화·로그인·설치를 마친 뒤 개인 서버를 종료합니다.';
  }
  const active = activeRun();
  const main = $('input[name="main"]:checked')?.value || 'codex';
  const first=$('#peer-select'),second=$('#second-peer-select');
  if(first.value===main){first.value=second.value===main?'':second.value;second.value='';}
  if(!first.value||second.value===main||second.value===first.value)second.value='';
  const peer=first.value,peer2=second.value,peers=selectedPeers();
  const ready = !currentState?.installing && Boolean(currentState?.connections?.[main]?.loggedIn) && peers.every(p=>Boolean(currentState?.connections?.[p]?.loggedIn));
  $('#start-run').disabled = actionPending || uploading || Boolean(active) || !ready;
  $('#start-run').title = active ? '현재 작업을 마치거나 중지한 뒤 시작할 수 있습니다.' : !ready ? '선택한 메인과 상대 AI의 설치·로그인을 확인하세요. 상대 없음은 메인만 연결하면 됩니다.' : '';
  const label = actionPending ? '요청 중…' : active ? '작업이 진행 중입니다' : '대화 시작';
  setText($('#start-run span'), label);
  $('#add-role').disabled = $('#role-list').children.length >= 3;
  $('#add-peer-role').disabled = $('#peer-role-list').children.length >= 3;
  setText($('#peer-role-count'), $('#peer-role-list').children.length);
  $('#add-peer2-role').disabled=$('#peer2-role-list').children.length>=3;
  setText($('#peer2-role-count'),$('#peer2-role-list').children.length);
  $('#add-peer').hidden=Boolean(peer2);$('#add-peer').disabled=!peer;
  $('#second-peer-group').hidden=!peer2;
  $('#peer2-role').disabled=!peer2;
  $('#stop-run').disabled = actionPending;
  $('#upload-files').disabled = uploading;
  const run = getSelectedRun();
  const mainReady = Boolean(currentState?.connections?.[run?.main]?.loggedIn);
  $('#followup-message').disabled = actionPending || Boolean(active) || Boolean(currentState?.installing);
  $('#send-followup').disabled = !run || run.mode==='codex-host' || actionPending || uploading || Boolean(active) || Boolean(currentState?.installing) || !mainReady || !$('#followup-message').value.trim();
  setText($('#send-followup'), actionPending ? '요청 중…' : active ? '대화 진행 중' : '후속 메시지 보내기');
  for (const option of first.options) option.disabled = Boolean(option.value)&&(option.value===main||option.value===peer2);
  for (const option of second.options) option.disabled = Boolean(option.value)&&(option.value===main||option.value===peer);
  $('#dialogue-settings').hidden = !peer;
  $('#peer-role').disabled = !peer;
  $('#main-agent-support').hidden = main !== 'gemini';
  $('.group-description').hidden = main === 'gemini';
  $('#role-list').hidden = main === 'gemini';
  $('#add-role').hidden = main === 'gemini';
  $('.peer-agent-settings').hidden = !peer || peer === 'gemini';
  document.querySelectorAll('#role-list input, #role-list textarea, #role-list select').forEach(element => { element.disabled = main === 'gemini'; });
  document.querySelectorAll('#peer-role-list input, #peer-role-list textarea, #peer-role-list select').forEach(element => { element.disabled = !peer || peer === 'gemini'; });
  $('.peer2-agent-settings').hidden=!peer2||peer2==='gemini';
  document.querySelectorAll('#peer2-role-list input, #peer2-role-list textarea, #peer2-role-list select').forEach(element=>{element.disabled=!peer2||peer2==='gemini';});
  for (const provider of providers) {
    const needed = provider === main || peers.includes(provider);
    const custom = $(`#${provider}-model-select`).value === '__custom__';
    $(`#${provider}-model`).disabled = !needed || !custom;
    $(`#${provider}-model`).required = needed && custom;
  }
  setText($('#peer-name'), peers.map(p=>providerNames[p]).join(' · ') || '상대 AI');
  document.querySelectorAll('.main-provider-name').forEach(element => setText(element, providerNames[main]));
  document.querySelectorAll('.peer-provider-name').forEach(element => setText(element, providerNames[peer] || '상대 AI'));
  document.querySelectorAll('.peer2-provider-name').forEach(element=>setText(element,providerNames[peer2]||'두 번째 상대'));
}

function renderConnections() {
  for (const provider of providers) {
    const connection = currentState.connections?.[provider] || {};
    renderModelOptions(provider, connection);
    const card = $(`[data-provider="${provider}"]`);
    const badge = $('.connection-badge', card);
    const installation=currentState.installations?.[provider]||{};
    const state = installation.status==='installing'?'설치 중':connection.logoutRunning ? '로그아웃 중' : connection.loginRunning ? '로그인 중' : connection.loggedIn ? '연결됨' : connection.installed ? '로그인 필요' : '미설치';
    setText(badge, state);
    badge.className = `connection-badge badge ${connection.loggedIn ? 'good' : connection.loginRunning ? 'busy' : 'neutral'}`;
    setText($('.connection-message', card), connection.message || (connection.loggedIn ? '로그인된 계정으로 대화할 준비가 됐습니다.' : connection.installed ? '로그인을 마친 뒤 새로 확인을 눌러주세요.' : 'CLI 설치가 필요합니다. 설치 안내를 확인하세요.'));
    setText($('.connection-version', card), connection.version || '');
    const install=$('[data-install]',card);
    if(install){
      install.disabled=!currentState.canInstall||connection.installed||Boolean(currentState.installing)||actionPending||Boolean(currentState.activeRunId)||Object.values(currentState.connections).some(c=>c.loginRunning||c.logoutRunning);
      setText(install,installation.status==='installing'?'설치 중…':connection.installed?'설치됨':installation.status==='failed'?'다시 설치':'설치');
      if(installation.message&&['installing','failed'].includes(installation.status))setText($('.connection-message',card),installation.message);
    }
    const login = $('.login-button', card);
    login.hidden = !connection.installed || connection.loggedIn;
    login.disabled = connection.loginRunning || connection.logoutRunning || actionPending || Boolean(currentState.installing) || Boolean(currentState.activeRunId);
    setText(login, connection.loginRunning ? '로그인 진행 중' : '로그인');
    const logout = $('[data-logout]', card);
    if (logout) {
      logout.hidden = !connection.loggedIn || connection.loginRunning;
      logout.disabled = connection.logoutRunning || actionPending || Boolean(currentState.installing) || Boolean(currentState.activeRunId);
      setText(logout, connection.logoutRunning ? '로그아웃 중' : '로그아웃');
    }
    const cancel = $('[data-cancel-login]', card);
    if (cancel) { cancel.hidden = !connection.loginRunning; cancel.disabled = actionPending; }
    const link = $('.login-link', card);
    let safeUrl = null;
    try {
      const url = new URL(connection.loginUrl);
      if (['https:', 'http:'].includes(url.protocol)) safeUrl = url.href;
    } catch { /* The CLI may not provide a browser login URL. */ }
    link.hidden = !safeUrl;
    if (safeUrl) link.href = safeUrl;
    else link.removeAttribute('href');
  }
  const docs=currentState.installations?.documents;
  const docsButton=$('[data-install="documents"]');
  if(docsButton){
    docsButton.disabled=!currentState.canInstall||Boolean(currentState.installing)||actionPending||Boolean(currentState.activeRunId)||Object.values(currentState.connections).some(c=>c.loginRunning||c.logoutRunning);
    setText(docsButton,docs?.status==='installing'?'설치 중…':docs?.status==='completed'?'다시 설치':'문서 도구 설치');
    setText($('#document-install-status'),docs?.message||'Python이 설치된 PC에서 문서 읽기·파일 생성 패키지를 준비합니다.');
  }
}

function createMessage(message) {
  const kind = ['main', 'peer', 'agent', 'system', 'user'].includes(message.kind) ? message.kind : 'system';
  const article = node('article', `message ${kind}`);
  const heading = node('div', 'message-heading');
  const identity = node('div', 'message-identity');
  identity.append(node('span', 'message-provider'), node('span', 'message-title'));
  heading.append(identity, node('time', 'message-time'));
  article.append(heading, node('div', 'message-text'));
  return article;
}

function renderMessages(run) {
  const container = $('#messages');
  const changedRun = renderedRunId !== (run?.id || null);
  if (changedRun) {
    container.replaceChildren();
    messageNodes.clear();
    renderedRunId = run?.id || null;
  }
  $('#empty-state').hidden = Boolean(run);
  if (!run) {
    $('#final-section').hidden = true;
    return;
  }
  for (let index = 0; index < (run.messages || []).length; index++) {
    const message = run.messages[index];
    const key = String(message.id ?? index);
    let article = messageNodes.get(key);
    if (!article) {
      article = createMessage(message);
      messageNodes.set(key, article);
      container.append(article);
    }
    setText($('.message-provider', article), message.kind === 'user' ? '나' : message.kind === 'system' ? '진행 기록' : message.kind === 'agent' ? '서브 에이전트' : providerNames[message.provider] || message.provider || 'AI');
    setText($('.message-title', article), message.title || (message.kind === 'main' ? '메인 AI' : message.kind === 'peer' ? '상대 AI' : ''));
    setText($('.message-time', article), formatTime(message.time));
    setText($('.message-text', article), message.text || '');
  }
  $('#final-section').hidden = !run.final;
  if (run.final) setText($('#final-text'), run.final);
}

function renderAgents(run) {
  const agents = run?.agents || [];
  const signature = JSON.stringify([run?.id, run?.status, agents]);
  if (lastAgents === signature) return;
  lastAgents = signature;
  setText($('#agent-count'), agents.length);
  const container = $('#agents');
  container.replaceChildren();
  if (!agents.length) {
    container.append(node('p', 'sidebar-empty', run?.status === 'running' ? '아직 서브 에이전트의 실행 기록이 없습니다.' : '실행되면 역할별 상태가 표시됩니다.'));
    return;
  }
  for (const agent of agents) {
    const card = node('div', 'agent-card');
    const heading = node('div', 'agent-card-header');
    heading.append(node('strong', '', agent.name || agent.id || '서브 에이전트'), node('span', `badge ${statusClass(agent.status)}`, statusLabel(agent.status)));
    card.append(heading, node('div', 'agent-provider', `${providerNames[agent.provider] || agent.provider || providerNames[run.main] || ''} 내부 작업`));
    if (agent.text) card.append(node('p', '', agent.text));
    container.append(card);
  }
}

function renderHistory() {
  const runs = currentState.runs || [];
  const signature = JSON.stringify([selectedRunId, runs.map(run => [run.id, run.title, run.status, run.createdAt, run.main])]);
  if (lastHistory === signature) return;
  lastHistory = signature;
  setText($('#history-count'), runs.length);
  const container = $('#history');
  container.replaceChildren();
  if (!runs.length) container.append(node('p', 'sidebar-empty', '아직 시작한 작업이 없습니다.'));
  for (const run of [...runs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))) {
    const button = node('button', `history-item${run.id === selectedRunId ? ' selected' : ''}`);
    button.type = 'button';
    button.setAttribute('aria-pressed', String(run.id === selectedRunId));
    button.append(node('strong', '', run.title || run.prompt || '작업'));
    const meta = node('small');
    meta.append(node('span', '', `${providerNames[run.main] || run.main} · ${statusLabel(run.status)}`), node('span', '', formatTime(run.createdAt, true)));
    button.append(meta);
    button.addEventListener('click', () => { selectedRunId = run.id; initialSelection = false; render(); });
    container.append(button);
  }
}

function render() {
  if (!currentState) return;
  if (initialSelection) {
    const requested=new URLSearchParams(location.search).get('run');
    selectedRunId = currentState.runs?.some(r=>r.id===requested)?requested:currentState.activeRunId || currentState.runs?.at(-1)?.id || null;
    initialSelection = false;
  }
  if (!mainChosen) {
    const connected = providers.find(p => currentState.connections?.[p]?.loggedIn);
    if (connected) { $(`input[name="main"][value="${connected}"]`).checked = true; mainChosen = true; }
  }
  const run = getSelectedRun();
  renderConnections();
  renderUploads();
  renderRunAttachments(run);
  renderRunSettings(run);
  renderMessages(run);
  renderGeneratedFiles(run);
  renderAgents(run);
  renderHistory();
  renderComposer(run);
  setText($('#conversation-title'), run?.title || '새 대화');
  const badge = $('#run-status');
  setText(badge, run ? statusLabel(run.status) : '준비');
  badge.className = `badge ${run ? statusClass(run.status) : 'neutral'}`;
  setText($('#stage-text'), run?.error || run?.stage || (run ? statusLabel(run.status) : '지시를 입력하면 실제 대화를 시작합니다.'));
  $('#activity-dot').className = `dot ${run?.status === 'running' ? 'working' : 'idle'}`;
  const exportLink = $('#export-run');
  exportLink.hidden = !run;
  if (run) exportLink.href = `/api/runs/${encodeURIComponent(run.id)}/export`;
  $('#stop-run').hidden = run?.status !== 'running';
  updateControls();
}

async function refresh() {
  currentState = await request('/api/state');
  render();
}

async function poll() {
  if(ended)return;
  if (cloudMode && !bridgeToken) return;
  try {
    await refresh();
    if (disconnected) notice('');
    disconnected = false;
  }
  catch {
    if(ended)return;
    disconnected = true;
    notice('로컬 서비스에 연결하지 못했습니다. 실행 창을 확인해주세요. 자동으로 다시 연결합니다.');
  }
  clearTimeout(pollTimer);
  if(!ended)pollTimer = setTimeout(poll, activeRun() ? 1000 : 4000);
}

async function action(callback) {
  actionPending = true;
  notice('');
  updateControls();
  try { await callback(); await refresh(); }
  catch (error) { notice(error.message || '요청을 처리하지 못했습니다.'); }
  finally { actionPending = false; updateControls(); }
}

$('#add-role').addEventListener('click', () => addRole());
$('#rounds').addEventListener('change', updateRoundFields);
$('#peer-select').addEventListener('change', updateControls);
$('#second-peer-select').addEventListener('change',updateControls);
$('#add-peer').addEventListener('click',()=>{$('#second-peer-select').value=providers.find(p=>p!==$('input[name="main"]:checked').value&&p!==$('#peer-select').value)||'';updateControls();});
$('#remove-peer').addEventListener('click',()=>{$('#second-peer-select').value='';updateControls();});
for (const provider of providers) $(`#${provider}-model-select`).addEventListener('change', () => { updateModelCustomField(provider); updateControls(); });
$('#add-peer-role').addEventListener('click', () => addRole('', '', 'peer'));
$('#add-peer2-role').addEventListener('click',()=>addRole('','','peer2'));
document.querySelectorAll('input[name="main"]').forEach(input => input.addEventListener('change', () => { mainChosen = true; updateControls(); }));
$('#new-task').addEventListener('click', () => {
  selectedRunId = null;
  initialSelection = false;
  $('#prompt').value = '';
  selectedAttachments.clear();
  notice('');
  render();
  $('#prompt').focus();
});
$('#finish-app').addEventListener('click', async () => {
  if(actionPending||uploading)return;
  actionPending=true;updateControls();
  try{
    await request('/api/shutdown',{});
    ended=true;clearTimeout(pollTimer);
    $('.workspace').inert=true;
    $('#new-task').disabled=true;
    $('#shutdown-screen').hidden=false;$('#shutdown-screen').focus();
    setText($('#finish-app'),'종료됨');
  }catch(error){notice(error.message||'서버를 종료하지 못했습니다.');}
  finally{actionPending=false;updateControls();}
});
$('#run-form').addEventListener('submit', event => {
  event.preventDefault();
  if (actionPending || uploading || activeRun()) return;
  const prompt = $('#prompt').value.trim();
  if (!prompt) { $('#prompt').focus(); return; }
  const main = $('input[name="main"]:checked').value;
  const peer = $('#peer-select').value || null;
  const peers=selectedPeers(),peerSettings=readPeerSettings();
  const agentRoles = main === 'gemini' ? [] : readRoles('#role-list');
  const peerAgentRoles = !peer || peer === 'gemini' ? [] : readRoles('#peer-role-list');
  if ([...agentRoles, ...Object.values(peerSettings).flatMap(s=>s.agentRoles)].some(role => !role.name || !role.task)) { notice('각 AI 서브 에이전트의 역할 이름과 할 일을 입력해주세요.'); return; }
  const mainRole = $('#main-role').value.trim();
  const peerRole = $('#peer-role').value.trim();
  if (!mainRole || !peerRole || Object.values(peerSettings).some(s=>!s.role)) { notice('메인 AI와 상대 AI의 역할을 입력해주세요.'); return; }
  let roundSettings;
  let models;
  try { roundSettings = readRoundSettings($('#rounds').value, $('#custom-rounds').value, $('#stop-condition').value); }
  catch (error) { notice(error.message); return; }
  try { models = Object.fromEntries(providers.map(p => [p, p === main || peers.includes(p) ? readSelectedModel(p) : ''])); }
  catch (error) { notice(error.message); return; }
  action(async () => {
    const result = await request('/api/runs', { prompt, main, peer, peers,peerSettings,...roundSettings, mainRole, peerRole, agentRoles, peerAgentRoles, models, attachmentIds: attachmentIds() });
    selectedRunId = result.id;
    initialSelection = false;
  });
});
$('#upload-files').addEventListener('change', event => uploadFiles(Array.from(event.target.files || [])));
const dropzone = $('#upload-dropzone');
let dragDepth = 0;
function isFileDrag(event) { return Array.from(event.dataTransfer?.types || []).includes('Files'); }
function clearDropzone() { dragDepth = 0; dropzone.classList.remove('drag-active'); }
dropzone.addEventListener('dragenter', event => {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  dragDepth++;
  dropzone.classList.add('drag-active');
});
dropzone.addEventListener('dragleave', event => {
  if (!isFileDrag(event)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) dropzone.classList.remove('drag-active');
});
dropzone.addEventListener('dragover', event => {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  event.stopPropagation();
  event.dataTransfer.dropEffect = uploading ? 'none' : 'copy';
});
dropzone.addEventListener('drop', event => {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  event.stopPropagation();
  clearDropzone();
  uploadFiles(Array.from(event.dataTransfer.files || []));
});
for (const type of ['dragenter', 'dragover', 'drop']) window.addEventListener(type, event => {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  if (type === 'drop') {
    clearDropzone();
    notice('파일은 내 자료의 참고 자료 영역에 놓아주세요.');
  }
});
window.addEventListener('dragend', clearDropzone);
$('#followup-message').addEventListener('input', () => {
  if (selectedRunId) followupDrafts.set(selectedRunId, $('#followup-message').value);
  updateControls();
});
$('#followup-form').addEventListener('submit', event => {
  event.preventDefault();
  const run = getSelectedRun();
  const message = $('#followup-message').value.trim();
  if (!run || !message || activeRun() || actionPending || uploading) return;
  action(async () => {
    const peers=selectedPeers();
    await request(`/api/runs/${encodeURIComponent(run.id)}/messages`, { message, peers:peers.length?peers:undefined,peerSettings:peers.length?readPeerSettings():undefined,attachmentIds: attachmentIds() });
    followupDrafts.delete(run.id);
    $('#followup-message').value = '';
  });
});
$('#stop-run').addEventListener('click', () => {
  const run = getSelectedRun();
  if (run?.status === 'running') action(() => request(`/api/runs/${encodeURIComponent(run.id)}/stop`, {}));
});
$('#check-connections').addEventListener('click', () => action(async () => {
  $('#check-connections').disabled = true;
  try { await request('/api/connections/check', {}); }
  finally { $('#check-connections').disabled = false; }
}));
document.querySelectorAll('[data-install]').forEach(button => button.addEventListener('click', () => action(async () => {
  const result=await request('/api/install',{provider:button.dataset.install});
  notice(result.alreadyInstalled?'이미 설치된 CLI를 사용합니다.':'설치를 시작했습니다. 오른쪽 상태를 확인하세요.',true);
})));
document.querySelectorAll('[data-login]').forEach(button => button.addEventListener('click', () => action(async () => {
  await request('/api/login', { provider: button.dataset.login });
  notice('로그인을 시작했습니다. 열린 브라우저에서 본인 계정으로 완료하세요. 완료하면 연결 상태가 자동으로 바뀝니다.', true);
})));
document.querySelectorAll('[data-cancel-login]').forEach(button => button.addEventListener('click', () => action(async () => {
  await request('/api/login/cancel', { provider: button.dataset.cancelLogin });
  notice('로그인을 취소했습니다. 다시 로그인할 수 있습니다.', true);
})));
document.querySelectorAll('[data-logout]').forEach(button => button.addEventListener('click', () => action(async () => {
  await request('/api/logout', { provider: button.dataset.logout });
  notice(`${providerNames[button.dataset.logout]}에서 로그아웃했습니다. 로그인 버튼으로 계정을 다시 연결할 수 있습니다.`, true);
})));

// Hosted deployment has been removed; the installed app uses its own local service.
$('#bridge-panel').hidden = true;
$('#bridge-panel').open = false;
$('#bridge-local').hidden = cloudMode;
$('#bridge-cloud').hidden = !cloudMode;
if (cloudMode) {
  setText($('#bridge-heading'), '내 PC의 AI 연결');
  setText($('.local-label'), bridgeToken ? '내 PC에 연결됨' : '내 PC 연결 필요');
  $('#bridge-disconnect').hidden = !bridgeToken;
  for (const card of document.querySelectorAll('.connection-card')) {
    setText($('.connection-badge', card), 'PC 연결 필요');
    setText($('.connection-message', card), '내 PC를 연결하면 본인의 AI 로그인 상태가 표시됩니다.');
  }
}
$('#bridge-issue').addEventListener('click', () => action(async () => {
  const result = await request('/api/bridge/code', {});
  const field = $('#bridge-issued-code');field.hidden = false;field.value = result.code;field.focus();field.select();
  setText($('#bridge-status'), `${result.origin}에 입력하세요. 코드는 5분간 한 번만 사용할 수 있습니다.`);
}));
$('#bridge-revoke').addEventListener('click', () => action(async () => {
  await request('/api/bridge/revoke', {});$('#bridge-issued-code').value = '';$('#bridge-issued-code').hidden = true;
  setText($('#bridge-status'), '모든 웹 연결을 해제했습니다. 로컬 프로그램은 계속 사용할 수 있습니다.');
}));
$('#bridge-connect').addEventListener('click', async () => {
  const button = $('#bridge-connect');button.disabled = true;
  setText($('#bridge-status'), '이 PC의 연결 프로그램에 접속합니다…');
  try {
    const response = await fetch(apiBase + '/api/bridge/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: $('#bridge-code').value.trim() }), targetAddressSpace: 'loopback', signal: AbortSignal.timeout(15000) });
    const data = await response.json();if (!response.ok) throw new Error(data.error || '연결 코드를 확인하세요.');
    sessionStorage.setItem('attention-bridge-token', data.token);bridgeToken = data.token;$('#bridge-code').value = '';
    $('#bridge-disconnect').hidden = false;setText($('#bridge-status'), '내 PC에 연결했습니다. 오른쪽에서 본인의 AI 계정을 로그인하세요.');
    setText($('.local-label'), '내 PC에 연결됨');await poll();
  } catch (error) { setText($('#bridge-status'), error instanceof TypeError || error.name === 'TimeoutError' ? '연결 프로그램 실행과 브라우저의 로컬 네트워크 접근 허용을 확인한 뒤 다시 연결하세요.' : error.message); }
  finally { button.disabled = false; }
});
$('#bridge-disconnect').addEventListener('click', async () => { try { await request('/api/bridge/disconnect', {}); } finally { sessionStorage.removeItem('attention-bridge-token');location.reload(); } });
document.addEventListener('click', async event => {
  const link = event.target.closest('a');
  if (!cloudMode || !link || !/^\/api\/runs\/[a-f0-9-]{36}\/(?:export|files\/[a-f0-9-]{36})$/.test(link.getAttribute('href') || '')) return;
  event.preventDefault();
  try {
    if (!bridgeToken) throw new Error('내 PC를 먼저 연결하세요.');
    const response = await fetch(apiBase + link.getAttribute('href'), { headers: { 'X-Local-Token': bridgeToken }, targetAddressSpace: 'loopback' });
    if (!response.ok) throw new Error('다운로드 연결이 만료됐습니다. PC를 다시 연결하세요.');
    const url = URL.createObjectURL(await response.blob());const download = node('a');download.href = url;download.download = link.download || 'AI_대화기록.md';download.click();setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { notice(error.message); }
});

connectRoleEditor('main', mainRolePresets);
connectRoleEditor('peer', peerRolePresets);
connectRoleEditor('peer2',peerRolePresets);
updateRoundFields();
for (const provider of providers) updateModelCustomField(provider);
connectPanelResize();
poll();
