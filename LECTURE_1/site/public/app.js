'use strict';

const $ = (selector, root = document) => root.querySelector(selector);
const providerNames = { codex: 'Codex', claude: 'Claude Code' };
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
const uploadLimits = { bytes: 10 * 1024 * 1024, count: 5, chars: 60000 };
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
  const options = body === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Local-Token': currentState?.token || '' },
    body: JSON.stringify(body)
  };
  const response = await fetch(path, options);
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : {};
  if (!response.ok) throw new Error(data.error || data.message || `요청을 처리하지 못했습니다. (${response.status})`);
  return data;
}

function addRole(name = '', task = '', side = 'main', preset = 'custom') {
  const list = $(side === 'peer' ? '#peer-role-list' : '#role-list');
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

function selectionError(files) {
  if (files.length > uploadLimits.count) return '자료는 최대 5개까지 선택할 수 있습니다. 기존 자료의 체크를 해제해주세요.';
  if (files.reduce((total, file) => total + Number(file.chars || 0), 0) > uploadLimits.chars) return '선택한 자료의 추출 텍스트가 60,000자를 넘습니다. 기존 자료의 체크를 해제해주세요.';
  return '';
}

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
          const candidate = availableUploads().find(item => item.id === file.id);
          const error = selectionError([...selectedFiles(), candidate].filter(Boolean));
          if (error) { checkbox.checked = false; notice(error); return; }
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
  setText($('#followup-attachments'), count ? `기존 자료를 유지하고, 왼쪽에서 선택한 자료 ${count}개를 추가합니다. 전체 최대 5개·60,000자입니다.` : '기존 자료와 대화 내용을 유지합니다. 추가 자료는 왼쪽에서 선택하세요.');
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
  const signature = JSON.stringify([run?.id, run?.main, run?.mainRole, run?.peerRole, run?.agentRoles, run?.peerAgentRoles, run?.rounds, run?.stopCondition]);
  if (signature === lastRunSettings) return;
  lastRunSettings = signature;
  $('#run-settings').hidden = !run;
  const list = $('#run-setting-list');
  list.replaceChildren();
  if (!run) return;
  const rounds = run.rounds === null ? '횟수 제한 없이' : `${run.rounds || 1}회 왕복`;
  list.append(node('p', 'run-round-summary', rounds + (run.rounds === null ? ` · 종료: ${run.stopCondition || '수동 중지'}` : '')));
  const peer = run.main === 'codex' ? 'claude' : 'codex';
  for (const [label, provider, text, roles] of [
    ['메인', run.main, run.mainRole, run.agentRoles || []],
    ['상대', peer, run.peerRole, run.peerAgentRoles || []]
  ]) {
    const section = node('section', 'run-setting-side');
    section.append(node('h4', '', `${providerNames[provider] || provider} · ${label} 역할`));
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
  $('#followup-form').hidden = !run;
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
        if (file.size > uploadLimits.bytes) throw new Error('파일당 10MB까지 추가할 수 있습니다.');
        if (selectedFiles().length >= uploadLimits.count) throw new Error('자료를 최대 5개까지 선택했습니다. 체크를 해제한 뒤 다시 추가해주세요.');
        const result = await request('/api/uploads', { name: file.name, base64: await readBase64(file) });
        if (!result.id) throw new Error('업로드 결과를 확인하지 못했습니다.');
        uploadedFiles.set(result.id, result);
        const error = selectionError([...selectedFiles(), result]);
        if (error) errors.push(`${file.name}: 파일은 저장했지만 선택하지 않았습니다. ${error}`);
        else selectedAttachments.add(result.id);
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
  const active = activeRun();
  const ready = ['codex', 'claude'].every(provider => currentState?.connections?.[provider]?.loggedIn);
  $('#start-run').disabled = actionPending || uploading || Boolean(active) || !ready;
  $('#start-run').title = active ? '현재 작업을 마치거나 중지한 뒤 시작할 수 있습니다.' : !ready ? '두 AI의 설치와 로그인을 먼저 확인하세요.' : '';
  const label = actionPending ? '요청 중…' : active ? '작업이 진행 중입니다' : '대화 시작';
  setText($('#start-run span'), label);
  $('#add-role').disabled = $('#role-list').children.length >= 3;
  $('#add-peer-role').disabled = $('#peer-role-list').children.length >= 3;
  setText($('#peer-role-count'), $('#peer-role-list').children.length);
  $('#stop-run').disabled = actionPending;
  $('#upload-files').disabled = uploading;
  const run = getSelectedRun();
  const mainReady = Boolean(currentState?.connections?.[run?.main]?.loggedIn);
  $('#followup-message').disabled = actionPending || Boolean(active);
  $('#send-followup').disabled = !run || actionPending || uploading || Boolean(active) || !mainReady || !$('#followup-message').value.trim();
  setText($('#send-followup'), actionPending ? '요청 중…' : active ? '대화 진행 중' : '후속 메시지 보내기');
  const main = $('input[name="main"]:checked')?.value || 'codex';
  const peer = main === 'codex' ? 'claude' : 'codex';
  setText($('#peer-name'), providerNames[peer]);
  document.querySelectorAll('.main-provider-name').forEach(element => setText(element, providerNames[main]));
  document.querySelectorAll('.peer-provider-name').forEach(element => setText(element, providerNames[peer]));
}

function renderConnections() {
  for (const provider of ['codex', 'claude']) {
    const connection = currentState.connections?.[provider] || {};
    const card = $(`[data-provider="${provider}"]`);
    const badge = $('.connection-badge', card);
    const state = connection.loginRunning ? '로그인 중' : connection.loggedIn ? '연결됨' : connection.installed ? '로그인 필요' : '미설치';
    setText(badge, state);
    badge.className = `connection-badge badge ${connection.loggedIn ? 'good' : connection.loginRunning ? 'busy' : 'neutral'}`;
    setText($('.connection-message', card), connection.message || (connection.loggedIn ? '로그인된 계정으로 대화할 준비가 됐습니다.' : connection.installed ? '로그인을 마친 뒤 새로 확인을 눌러주세요.' : 'CLI 설치가 필요합니다. 설치 안내를 확인하세요.'));
    setText($('.connection-version', card), connection.version || '');
    const login = $('.login-button', card);
    login.hidden = !connection.installed || connection.loggedIn;
    login.disabled = connection.loginRunning || actionPending;
    setText(login, connection.loginRunning ? '로그인 진행 중' : '로그인');
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
    selectedRunId = currentState.activeRunId || currentState.runs?.at(-1)?.id || null;
    initialSelection = false;
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
  setText($('#conversation-title'), run?.title || 'AI가 함께 생각하는 공간');
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
  try {
    await refresh();
    if (disconnected) notice('');
    disconnected = false;
  }
  catch {
    disconnected = true;
    notice('로컬 서비스에 연결하지 못했습니다. 실행 창을 확인해주세요. 자동으로 다시 연결합니다.');
  }
  clearTimeout(pollTimer);
  pollTimer = setTimeout(poll, activeRun() ? 1000 : 4000);
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
$('#add-peer-role').addEventListener('click', () => addRole('', '', 'peer'));
document.querySelectorAll('input[name="main"]').forEach(input => input.addEventListener('change', updateControls));
$('#fill-sample').addEventListener('click', () => {
  $('#prompt').value = 'Attention 참여자를 위한 2시간 AI 특강안을 작성해줘. 핵심은 한 AI를 메인으로 두고 다른 AI와 대화하며 결과물을 개선하는 방법이야.\n\n서브 에이전트는 교육 흐름과 시연 실패 가능성을 나누어 검토해줘. 상대 AI는 초안의 약점을 지적하고, 메인 AI는 수용·보류 이유를 설명한 뒤 최종 시간표와 사전 준비 목록을 정리해줘. 확인되지 않은 기능이나 효과는 사실로 단정하지 마.';
  $('#prompt').focus();
});
$('#new-task').addEventListener('click', () => {
  selectedRunId = null;
  initialSelection = false;
  $('#prompt').value = '';
  selectedAttachments.clear();
  notice('');
  render();
  $('#prompt').focus();
});
$('#run-form').addEventListener('submit', event => {
  event.preventDefault();
  if (actionPending || uploading || activeRun()) return;
  const prompt = $('#prompt').value.trim();
  if (!prompt) { $('#prompt').focus(); return; }
  const agentRoles = readRoles('#role-list');
  const peerAgentRoles = readRoles('#peer-role-list');
  if ([...agentRoles, ...peerAgentRoles].some(role => !role.name || !role.task)) { notice('양쪽 서브 에이전트의 역할 이름과 할 일을 입력해주세요.'); return; }
  const mainRole = $('#main-role').value.trim();
  const peerRole = $('#peer-role').value.trim();
  if (!mainRole || !peerRole) { notice('메인 AI와 상대 AI의 역할을 입력해주세요.'); return; }
  let roundSettings;
  try { roundSettings = readRoundSettings($('#rounds').value, $('#custom-rounds').value, $('#stop-condition').value); }
  catch (error) { notice(error.message); return; }
  action(async () => {
    const result = await request('/api/runs', { prompt, main: $('input[name="main"]:checked').value, ...roundSettings, mainRole, peerRole, agentRoles, peerAgentRoles, models: { codex: $('#codex-model').value.trim(), claude: $('#claude-model').value.trim() }, attachmentIds: attachmentIds() });
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
    notice('파일은 왼쪽 참고 자료 영역에 놓아주세요.');
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
    await request(`/api/runs/${encodeURIComponent(run.id)}/messages`, { message, attachmentIds: attachmentIds() });
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
document.querySelectorAll('[data-login]').forEach(button => button.addEventListener('click', () => action(async () => {
  await request('/api/login', { provider: button.dataset.login });
  notice('로그인을 시작했습니다. 열리는 인증 화면에서 로그인한 뒤 연결 상태를 확인해주세요.', true);
})));

connectRoleEditor('main', mainRolePresets);
connectRoleEditor('peer', peerRolePresets);
addRole(agentRolePresets.analysis.name, agentRolePresets.analysis.task, 'main', 'analysis');
addRole(agentRolePresets.review.name, agentRolePresets.review.task, 'main', 'review');
updateRoundFields();
connectPanelResize();
poll();
