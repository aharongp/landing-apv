(() => {
  'use strict';
  const en = () => document.documentElement.lang === 'en';
  const copy = (es, english) => en() ? english : es;
  const focusable = root => [...root.querySelectorAll('button,a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(el => !el.disabled && !el.closest('[hidden],.hidden,[inert]') && el.getClientRects().length);
  let stack = [], active = null;
  const originalInert = new Map();
  let lastFocus = document.activeElement;
  document.addEventListener('focusin', e => { if (!active || !active.contains(e.target)) lastFocus = e.target; });
  function restoreBackground() {for(const [el, value] of originalInert)el.inert=value;originalInert.clear();}
  function updateDialogs() {
    const shown = [...document.querySelectorAll('.overlay[role="dialog"],dialog[open],#filters-panel.mobile-open')].filter(el => !el.classList.contains('hidden') && !el.hidden && el.getClientRects().length);
    const priorEntry=stack.find(entry=>entry.el===active);
    stack = stack.filter(entry => shown.includes(entry.el));
    for (const el of shown) if (!stack.some(entry => entry.el === el)) stack.push({el, trigger:document.activeElement});
    const next = stack.at(-1)?.el || null;
    if (next === active) return;
    const previous = active; active = next; restoreBackground();
    if (active) {
      let child = active;
      while(child.parentElement && child.parentElement !== document.documentElement) {
        for(const sibling of child.parentElement.children) if(sibling !== child && !['SCRIPT','STYLE','LINK'].includes(sibling.tagName)) {originalInert.set(sibling,sibling.inert);sibling.inert=true;}
        child = child.parentElement;
      }
      if(priorEntry?.trigger?.isConnected && active.contains(priorEntry.trigger))priorEntry.trigger.focus({preventScroll:true});
      else if(!active.contains(document.activeElement)) (focusable(active)[0] || active).focus({preventScroll:true});
    } else if(previous && priorEntry?.trigger?.isConnected && !priorEntry.trigger.closest('.hidden,[hidden],[inert]')) priorEntry.trigger.focus({preventScroll:true});
  }
  const observer = new MutationObserver(updateDialogs);
  observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class','hidden','open']});
  document.addEventListener('keydown', e => {
    if(!active || e.key !== 'Tab')return;
    const items=focusable(active);if(!items.length){e.preventDefault();return;}
    const index=items.indexOf(document.activeElement);
    if(e.shiftKey && index<=0){e.preventDefault();items.at(-1).focus();}
    else if(!e.shiftKey && (index===items.length-1||index<0)){e.preventDefault();items[0].focus();}
  },true);
  document.querySelectorAll('.auth-tabs').forEach(tabs=>tabs.addEventListener('keydown',e=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
    const items=[...tabs.querySelectorAll('[role="tab"]')],index=items.indexOf(document.activeElement);
    const next=e.key==='Home'?0:e.key==='End'?items.length-1:(index+(e.key==='ArrowRight'?1:-1)+items.length)%items.length;
    e.preventDefault();items[next].click();items[next].focus();
  }));
  function passwords() {
    for(const id of ['login-password','register-password','reset-password','hero-register-password']) {
      const input=document.getElementById(id);if(!input||input.dataset.toggleReady)continue;
      input.dataset.toggleReady='1';const button=document.createElement('button');button.type='button';button.className='password-toggle link-button';button.setAttribute('aria-controls',id);button.setAttribute('aria-pressed','false');
      button.onclick=()=>{const visible=input.type==='password';input.type=visible?'text':'password';button.setAttribute('aria-pressed',String(visible));language();};
      (input.closest('label') || input).insertAdjacentElement('afterend',button);
    }
  }
  function language() {
    document.querySelectorAll('.password-toggle').forEach(button=>{const shown=button.getAttribute('aria-pressed')==='true';button.textContent=shown?copy('Ocultar contraseña','Hide password'):copy('Mostrar contraseña','Show password');});
    const country=document.getElementById('register-country-code'),phone=document.getElementById('register-phone');
    if(country&&phone)phone.placeholder=country.value==='+1'?'201 555 0123':country.value==='+58'?'414 123 4567':copy('Número sin código de país','Number without country code');
  }
  passwords();language();document.addEventListener('apv:language',language);
  document.getElementById('register-country-code')?.addEventListener('change',language);
  const reset=document.getElementById('reset-form');if(!reset)return;
  const email=document.getElementById('reset-email'),code=document.getElementById('reset-code'),password=document.getElementById('reset-password'),fields=document.getElementById('reset-code-fields'),submit=document.getElementById('reset-submit'),resend=document.getElementById('reset-resend'),status=document.getElementById('reset-status');
  let stage='request',busy=false,resendAt=0;
  function resetMessage(message){status.textContent=message;}
  function buttonCopy(){submit.removeAttribute('data-i18n');submit.textContent=stage==='request'?copy('Enviar código de recuperación','Send recovery code'):copy('Guardar nueva contraseña','Save new password');}
  document.getElementById('forgot-password')?.addEventListener('click',()=>{
    document.querySelectorAll('#auth-overlay .auth-form').forEach(el=>el.classList.add('hidden'));reset.classList.remove('hidden');document.querySelector('#auth-overlay .auth-tabs').classList.add('hidden');
    const title=document.getElementById('auth-title');title.textContent=copy('Recupera tu cuenta','Recover your account');
    document.getElementById('auth-reason').textContent=copy('Puedes volver a tu compra después de iniciar sesión.','You can return to your purchase after signing in.');
    stage='request';fields.hidden=true;code.required=password.required=false;code.value=password.value='';email.readOnly=false;email.value=document.getElementById('login-email').value;resend.hidden=true;buttonCopy();resetMessage('');email.focus();
  });
  async function requestCode(){
    if(Date.now()<resendAt){resetMessage(copy('Espera un minuto antes de solicitar otro código.','Wait a minute before requesting another code.'));return;}
    const response=await fetch('/api/auth/password-reset/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email.value})});
    if(!response.ok)throw new Error('request');
    resendAt=Date.now()+60000;stage='confirm';fields.hidden=false;resend.hidden=false;email.readOnly=true;code.required=password.required=true;buttonCopy();
    resetMessage(copy('Si existe una cuenta con ese correo, recibirás un código. Revisa también el correo no deseado. Caduca en 15 minutos.','If an account exists with that email, you will receive a code. Check your spam folder too. It expires in 15 minutes.'));code.focus();
  }
  resend.addEventListener('click',async()=>{if(busy)return;busy=true;try{await requestCode();}catch{resetMessage(copy('No pudimos solicitar otro código. Inténtalo en unos minutos.','We could not request another code. Try again in a few minutes.'));}finally{busy=false;}});
  reset.addEventListener('submit',async e=>{
    e.preventDefault();if(busy)return;busy=true;submit.disabled=true;resetMessage('');
    try {
      if(stage==='request')await requestCode();
      else {
        const response=await fetch('/api/auth/password-reset/confirm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email.value,code:code.value,password:password.value})});
        if(!response.ok)throw new Error('code');
        password.value=code.value='';document.querySelector('.auth-tabs [data-auth-tab="login"]').click();document.getElementById('login-email').value=email.value;
        const authStatus=document.getElementById('auth-status');authStatus.textContent=copy('Contraseña actualizada. Inicia sesión para continuar.','Password updated. Sign in to continue.');authStatus.classList.remove('hidden');document.getElementById('login-password').value='';document.getElementById('login-password').focus();
      }
    } catch {resetMessage(stage==='request'?copy('No pudimos solicitar el código. Inténtalo en unos minutos.','We could not request the code. Try again in a few minutes.'):copy('El código es incorrecto o venció. Revisa el código o solicita uno nuevo.','The code is incorrect or expired. Check it or request a new one.'));}
    finally{busy=false;submit.disabled=false;}
  });
  document.addEventListener('apv:language',buttonCopy);
})();
