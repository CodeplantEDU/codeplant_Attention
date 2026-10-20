document.querySelectorAll('[data-demo]').forEach(button => button.addEventListener('click', () => {
  document.querySelector('#feedback').textContent = button.dataset.demo;
}));
document.querySelector('#sample-form').addEventListener('submit', event => {
  event.preventDefault();
  document.querySelector('#input-help').textContent = '입력 상태가 확인됐습니다. 저장하거나 전송하지 않습니다.';
});
