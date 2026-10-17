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
