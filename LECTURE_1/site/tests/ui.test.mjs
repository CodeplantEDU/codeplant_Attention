import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const start = source.indexOf("const dropzone = $('#upload-dropzone');");
const end = source.indexOf("$('#followup-message').addEventListener", start);
assert.ok(start > 0 && end > start, 'The actual registered drag/drop event block must be present.');
const eventCode = source.slice(start, end);

function fixture() {
  const zoneEvents = new Map();
  const windowEvents = new Map();
  const classes = new Set();
  const uploads = [];
  const notices = [];
  const zone = {
    addEventListener: (name, callback) => zoneEvents.set(name, callback),
    classList: { add: name => classes.add(name), remove: name => classes.delete(name) }
  };
  const context = {
    $: selector => { assert.equal(selector, '#upload-dropzone'); return zone; },
    window: { addEventListener: (name, callback) => windowEvents.set(name, callback) },
    uploading: false,
    uploadFiles: files => uploads.push(files),
    notice: message => notices.push(message)
  };
  vm.createContext(context);
  vm.runInContext(eventCode, context);
  return { zoneEvents, windowEvents, classes, uploads, notices, context };
}

function dragEvent(types = ['Files'], files = [{ name: 'lesson.md' }]) {
  return {
    prevented: 0, stopped: 0,
    dataTransfer: { types, files, dropEffect: '' },
    preventDefault() { this.prevented++; },
    stopPropagation() { this.stopped++; }
  };
}

test('file drop shows activity, prevents navigation, dispatches selected files, and clears activity', () => {
  const f = fixture();
  const enter = dragEvent();
  f.zoneEvents.get('dragenter')(enter);
  assert.equal(enter.prevented, 1);
  assert.ok(f.classes.has('drag-active'));
  const over = dragEvent();
  f.zoneEvents.get('dragover')(over);
  assert.equal(over.prevented, 1);
  assert.equal(over.stopped, 1);
  assert.equal(over.dataTransfer.dropEffect, 'copy');
  const drop = dragEvent();
  f.zoneEvents.get('drop')(drop);
  assert.equal(drop.prevented, 1);
  assert.equal(drop.stopped, 1);
  assert.equal(f.uploads.length, 1);
  assert.equal(f.uploads[0][0], drop.dataTransfer.files[0]);
  assert.ok(!f.classes.has('drag-active'));
});

test('window guards prevent file navigation outside the dropzone while allowing ordinary text drags', () => {
  const f = fixture();
  for (const type of ['dragenter', 'dragover', 'drop']) {
    const event = dragEvent();
    f.windowEvents.get(type)(event);
    assert.equal(event.prevented, 1);
  }
  assert.equal(f.uploads.length, 0);
  assert.equal(f.notices.length, 1);
  const text = dragEvent(['text/plain'], []);
  f.windowEvents.get('dragover')(text);
  assert.equal(text.prevented, 0);
});

test('busy uploads reject the drag effect and leaving or ending a drag clears its activity', () => {
  const f = fixture();
  f.context.uploading = true;
  const over = dragEvent();
  f.zoneEvents.get('dragover')(over);
  assert.equal(over.dataTransfer.dropEffect, 'none');
  f.zoneEvents.get('dragenter')(dragEvent());
  f.zoneEvents.get('dragleave')(dragEvent());
  assert.ok(!f.classes.has('drag-active'));
  f.zoneEvents.get('dragenter')(dragEvent());
  f.windowEvents.get('dragend')();
  assert.ok(!f.classes.has('drag-active'));
});

function helperContext(extra = {}) {
  const context = vm.createContext(extra);
  const end = source.indexOf("$('#add-role').addEventListener");
  assert.ok(end > 0);
  vm.runInContext(source.slice(0, end), context);
  const helpers = vm.runInContext('({readRoundSettings, clampPanelWidths, connectPanelResize, modelOptions, readSelectedModel, renderModelOptions})', context);
  return { context, helpers };
}

test('round settings accept custom positive integers and unlimited conditions, rejecting invalid counts', () => {
  const { helpers } = helperContext();
  for (const value of ['1', '2', '3']) assert.equal(helpers.readRoundSettings(value, '', '').rounds, Number(value));
  assert.equal(helpers.readRoundSettings('custom', '10000', '').rounds, 10000);
  for (const invalid of ['0', '-1', '1.5', '', 'not a number', 'Infinity']) {
    assert.throws(() => helpers.readRoundSettings('custom', invalid, ''), /1 이상의 정수/);
  }
  assert.equal(helpers.readRoundSettings('unlimited', '', '  조건 충족  ').rounds, null);
  assert.equal(helpers.readRoundSettings('unlimited', '', '  조건 충족  ').stopCondition, '조건 충족');
  assert.equal(helpers.readRoundSettings('unlimited', '', '').stopCondition, '');
});

test('panel width bounds preserve both side minimums and conversation space with invalid or oversized stored values', () => {
  const { helpers } = helperContext();
  for (const [widths, total] of [[{setup:600,activity:900},1191], [{setup:-20,activity:0},1280], [{setup:NaN,activity:Infinity},1191.7], [null,840]]) {
    const result = helpers.clampPanelWidths(widths, total);
    assert.ok(result.setup >= 240);
    assert.ok(result.activity >= 220);
    assert.ok(total - result.setup - result.activity - 20 >= 360);
  }
});

test('registered resize handlers restore stored widths, handle pointer and keyboard changes, persist and reset', () => {
  function target() {
    return { events:new Map(), attributes:new Map(), addEventListener(name, fn){this.events.set(name,fn)}, setAttribute(name,value){this.attributes.set(name,value)}, setPointerCapture(){} };
  }
  const left = target(), right = target(), reset = target();
  const properties = new Map(), storage = new Map(), classes = new Set();
  storage.set('codeplant-dialogue-panel-widths-v1', JSON.stringify({setup:350,activity:300}));
  const workspace = {getBoundingClientRect:()=>({width:1280}),style:{setProperty:(name,value)=>properties.set(name,value)}};
  const media = {matches:true,addEventListener(){}};
  const elements = {'.workspace':workspace,'#setup-separator':left,'#activity-separator':right,'#reset-layout':reset};
  const { helpers } = helperContext({
    document:{querySelector:selector=>elements[selector],body:{classList:{add:value=>classes.add(value),remove:value=>classes.delete(value)}}},
    window:{matchMedia:()=>media,addEventListener(){}},
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)}
  });
  helpers.connectPanelResize();
  assert.equal(properties.get('--setup-width'),'350px');
  assert.equal(properties.get('--activity-width'),'300px');
  const down = {button:0,pointerId:1,clientX:350,preventDefault(){}};
  left.events.get('pointerdown')(down);
  assert.ok(classes.has('resizing-panels'));
  left.events.get('pointermove')({pointerId:1,clientX:430});
  assert.equal(properties.get('--setup-width'),'430px');
  assert.equal(left.attributes.get('aria-valuenow'),'430');
  left.events.get('pointerup')();
  assert.ok(!classes.has('resizing-panels'));
  assert.equal(JSON.parse(storage.get('codeplant-dialogue-panel-widths-v1')).setup,430);
  let prevented = false;
  right.events.get('keydown')({key:'ArrowLeft',preventDefault(){prevented=true}});
  assert.ok(prevented);
  assert.equal(properties.get('--activity-width'),'320px');
  media.matches = false;
  right.events.get('keydown')({key:'ArrowRight',preventDefault(){assert.fail('Narrow layouts must not resize');}});
  assert.equal(properties.get('--activity-width'),'320px');
  media.matches = true;
  reset.events.get('click')();
  assert.equal(properties.get('--setup-width'),'310px');
  assert.equal(properties.get('--activity-width'),'278px');
  assert.ok(!storage.has('codeplant-dialogue-panel-widths-v1'));
});

test('model options use returned model IDs and preserve a previous choice when the current lookup is empty', () => {
  const { helpers } = helperContext();
  const options = helpers.modelOptions([{id:'gpt-6-sol',label:'GPT 6 Sol'},{id:'gpt-6-sol',label:'duplicate'},{id:'bad id',label:'invalid'}], 'gpt-6-sol');
  assert.equal(options.filter(option=>option.id==='gpt-6-sol').length,1);
  assert.ok(!options.some(option=>option.id==='bad id'));
  assert.equal(options[0].id,'');
  assert.equal(options.at(-1).id,'__custom__');
  const failed = helpers.modelOptions([], 'gpt-6-sol');
  assert.equal(failed.find(option=>option.id==='gpt-6-sol').label,'이전 선택: gpt-6-sol');
});

test('model list refresh keeps the selected ID and custom text, and request values use the selected control', () => {
  const select = {value:'gpt-6-sol',children:[],replacements:0,replaceChildren(){this.children=[];this.replacements++},append(item){this.children.push(item)}};
  const input = {value:'my-model',disabled:true,required:false};
  const custom = {hidden:true};
  const message = {textContent:''};
  const elements = {'#codex-model-select':select,'#codex-model':input,'#codex-model-custom-group':custom,'#codex-model-list-message':message};
  const { helpers } = helperContext({document:{querySelector:selector=>elements[selector],createElement:()=>({textContent:''})}});
  const connection = {models:[{id:'gpt-6-sol',label:'<strong>literal label</strong>'}]};
  helpers.renderModelOptions('codex',connection);
  assert.equal(select.value,'gpt-6-sol');
  assert.equal(select.children.find(option=>option.value==='gpt-6-sol').textContent,'<strong>literal label</strong>');
  assert.equal(helpers.readSelectedModel('codex'),'gpt-6-sol');
  const replacements = select.replacements;
  helpers.renderModelOptions('codex',connection);
  assert.equal(select.replacements,replacements);
  helpers.renderModelOptions('codex',{models:[],modelListMessage:'조회 실패'});
  assert.equal(select.value,'gpt-6-sol');
  assert.equal(message.textContent,'조회 실패');
  select.value='__custom__';
  helpers.renderModelOptions('codex',connection);
  assert.equal(select.value,'__custom__');
  assert.equal(input.value,'my-model');
  assert.equal(custom.hidden,false);
  assert.equal(input.disabled,false);
  assert.equal(helpers.readSelectedModel('codex'),'my-model');
  input.value='bad model';
  assert.throws(()=>helpers.readSelectedModel('codex'),/모델 이름/);
  select.value='';
  assert.equal(helpers.readSelectedModel('codex'),'');
});

test('disabled model choices stay unavailable after lookup failure without replacing an explicit custom choice', () => {
  const select = {value:'unavailable-model',children:[],replaceChildren(){this.children=[]},append(item){this.children.push(item)}};
  const input = {value:'explicit-custom-model',disabled:true,required:false};
  const custom = {hidden:true};
  const elements = {'#codex-model-select':select,'#codex-model':input,'#codex-model-custom-group':custom,'#codex-model-list-message':{textContent:''}};
  const { helpers } = helperContext({document:{querySelector:selector=>elements[selector],createElement:()=>({textContent:''})}});
  const connection = {models:[{id:'unavailable-model',label:'Server-provided unavailable label',disabled:true}]};
  helpers.renderModelOptions('codex',connection);
  const option = select.children.find(item=>item.value==='unavailable-model');
  assert.equal(option.disabled,true);
  assert.equal(option.textContent,'Server-provided unavailable label');
  assert.throws(()=>helpers.readSelectedModel('codex'),/비활성/);
  helpers.renderModelOptions('codex',{models:[],modelListMessage:'조회 실패'});
  assert.equal(select.value,'unavailable-model');
  assert.equal(select.children.find(item=>item.value==='unavailable-model').disabled,true);
  assert.throws(()=>helpers.readSelectedModel('codex'),/비활성/);
  select.value='__custom__';
  helpers.renderModelOptions('codex',connection);
  assert.equal(select.value,'__custom__');
  assert.equal(input.value,'explicit-custom-model');
  assert.equal(custom.hidden,false);
  assert.equal(helpers.readSelectedModel('codex'),'explicit-custom-model');
});
