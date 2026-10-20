document.querySelectorAll('[data-demo]').forEach(button => button.addEventListener('click', () => {
  document.querySelector('#feedback').textContent = button.dataset.demo;
}));
document.querySelector('#sample-form').addEventListener('submit', event => {
  event.preventDefault();
  document.querySelector('#input-help').textContent = '입력 상태가 확인됐습니다. 저장하거나 전송하지 않습니다.';
});
document.fonts.ready.then(() => {
  document.querySelectorAll('[data-font-check]').forEach(el => {
    const role = el.dataset.fontCheck, family = el.dataset.family, uploaded = el.dataset.uploaded === 'true';
    const face = [...document.fonts].filter(f => f.family.replaceAll('"', '') === (uploaded ? 'DS-' + role : family));
    const loaded = face.length && face.every(f => f.status === 'loaded');
    el.textContent = `${role === 'body' ? '본문' : '제목'} · ${family} · ${loaded ? uploaded ? '업로드 파일 로딩 확인' : '포함된 글꼴 로딩 확인' : uploaded ? '글꼴 로딩 실패 · 대체 글꼴 사용' : '이 PC의 설치 상태에 따라 시스템 대체 글꼴 사용 가능'}`;
  });
});
