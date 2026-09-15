import { icon } from '../icons';
import { esc } from '../esc';
/* ===================== TOASTS ===================== */
// El mensaje se escapa acá adentro, una sola vez, en vez de en cada llamada: esto se pinta con
// .innerHTML, y muchísimos de los ~110 toast() de la app arman el texto con datos escritos por
// una persona ("Regla creada para <comercio>", "<participante> se agregó al grupo", "Plataforma
// agregada: <nombre>"...). Ninguna llamada pasa HTML a propósito -- revisado una por una -- así
// que escapar acá no rompe ningún mensaje y cierra el sink completo de una.
export function toast(msg){
  const stack = document.getElementById('toast-stack');
  const el = document.createElement('div');
  el.className='toast';
  el.innerHTML = icon('check')+'<span>'+esc(msg)+'</span>';
  stack.appendChild(el);
  requestAnimationFrame(()=>el.classList.add('show'));
  setTimeout(()=>{ el.classList.remove('show'); setTimeout(()=>el.remove(),250); }, 2400);
}

