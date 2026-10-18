import test from 'node:test';
import assert from 'node:assert/strict';
import {isSetupRequest} from '../ipc.mjs';

test('setup accepts the same Windows file across drive case, Unicode and URL escaping',()=>{
  const document='C:\\Users\\홍 길동\\프로그램 #1\\resources\\app.asar\\setup.html';
  const main={routingId:7,processId:14,url:'file:///c:/Users/홍%20길동/프로그램%20%231/resources/app.asar/setup.html'};
  const contents={mainFrame:main},event={sender:contents,senderFrame:main};
  assert.equal(isSetupRequest(event,contents,document,'win32'),true);
  main.url='file:///C:/Users/%ed%99%8d%20%ea%b8%b8%eb%8f%99/프로그램%20%231/resources/app.asar/setup.html';
  assert.equal(isSetupRequest(event,contents,document,'win32'),true);
});
test('normalization preserves sender, frame, protocol and exact document checks',()=>{
  const document='C:\\app\\setup.html',main={routingId:7,processId:14,url:'file:///C:/app/setup.html'},contents={mainFrame:main};
  const event={sender:contents,senderFrame:main};
  assert.equal(isSetupRequest({...event,sender:{}},contents,document,'win32'),false);
  assert.equal(isSetupRequest({...event,senderFrame:{...main,routingId:8}},contents,document,'win32'),false);
  for(const url of ['https://example.com/setup.html','file:///C:/app/other.html','file:///C:/app/setup.html?x=1','file:///C:/app/setup.html#x','file:///C:/app%2fsetup.html']){
    assert.equal(isSetupRequest({...event,senderFrame:{...main,url}},contents,document,'win32'),false);
  }
  main.url='file:///Applications/ATTENTION.app/setup.html';
  assert.equal(isSetupRequest(event,contents,'/Applications/ATTENTION.app/setup.html','darwin'),true);
  assert.equal(isSetupRequest(event,contents,'/applications/ATTENTION.app/setup.html','darwin'),false);
});
