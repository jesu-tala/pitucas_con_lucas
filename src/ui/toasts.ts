import { icon } from '../icons';
/* ===================== TOASTS ===================== */
export function toast(msg){
  const stack = document.getElementById('toast-stack');
  const el = document.createElement('div');
  el.className='toast';
  el.innerHTML = icon('check')+'<span>'+msg+'</span>';
  stack.appendChild(el);
  requestAnimationFrame(()=>el.classList.add('show'));
  setTimeout(()=>{ el.classList.remove('show'); setTimeout(()=>el.remove(),250); }, 2400);
}

