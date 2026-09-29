/* Local SVG icons; no font, external requests or platform-specific emoji rendering. */
(function(root,factory){
  const icons=factory();
  if(typeof module==='object'&&module.exports)module.exports=icons;
  else {root.APVIcons=icons;icons.observe(document);}
})(typeof window==='undefined'?this:window,function(){
  'use strict';
  const paths={
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    'check-circle':'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    chat:'<path d="M21 11a8 8 0 0 1-8 8H8l-5 3 1.5-6A8 8 0 1 1 21 11Z"/><path d="M8 10h8M8 14h5"/>',
    heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
    sliders:'<path d="M4 6h5m4 0h7M4 12h10m4 0h2M4 18h2m4 0h10M9 3v6m5 0v6M6 15v6"/>',
    trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
    lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
    key:'<circle cx="8" cy="8" r="5"/><path d="m12 12 9 9m-4-4 3-3m-6 0 3-3"/>',
    car:'<path d="m4 10 2-6h12l2 6M3 10h18v9H3zM6 19v2m12-2v2M6 14h2m8 0h2"/>',
    truck:'<path d="M3 5h11v12H3zM14 9h4l3 4v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
    gear:'<path d="m10 3-1 3-3-1-2 4 2 2v2l-2 2 2 4 3-1 1 3h4l1-3 3 1 2-4-2-2v-2l2-2-2-4-3 1-1-3z"/><circle cx="12" cy="12" r="3"/>',
    fuel:'<path d="M4 21V4h10v17M3 21h12M4 10h10m0 3h2v5a2 2 0 0 0 4 0V8l-3-3M18 6v4h2"/>',
    calculator:'<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 6h8M8 10h1m3 0h1m3 0h0M8 14h1m3 0h1m3 0h0M8 18h1m3 0h1m3 0h0"/>',
    tool:'<path d="M14 6a6 6 0 0 0-7 7l-5 5 4 4 5-5a6 6 0 0 0 7-8l-4 4-3-3 4-4Z"/>',
    bulb:'<path d="M9 18h6m-6 3h6M8 14a6 6 0 1 1 8 0l-1 3H9z"/>',
    bank:'<path d="m3 8 9-5 9 5H3Zm2 3v7m5-7v7m4-7v7m5-7v7M3 21h18"/>',
    clipboard:'<rect x="5" y="5" width="14" height="17" rx="2"/><rect x="9" y="2" width="6" height="5" rx="1"/><path d="M8 12h8m-8 4h6"/>',
    handshake:'<path d="m2 9 4-5 5 1 3-1 8 5-4 9-5 3-9-7-2-5Zm4-5 5 1-4 5 3 2 4-4 6 7M7 16l3-3m0 6 3-4m0 6 3-4"/>',
    scale:'<path d="M12 3v18M7 21h10M3 7h18M5 7l-3 7h6L5 7Zm14 0-3 7h6l-3-7Z"/>',
    briefcase:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V3h8v4M3 12h18m-11-2v4h4v-4"/>',
    gavel:'<path d="m14 3 7 7-3 3-7-7 3-3Zm-7 7 7 7-3 3-7-7 3-3Zm3 3 4-4M3 21l6-6M14 22h8"/>',
    chart:'<path d="M3 3v18h18M7 17v-5m5 5V7m5 10V4"/>',
    bolt:'<path d="m13 2-9 12h7l-1 8 10-12h-7l1-8Z"/>',
    warning:'<path d="m12 3 10 18H2L12 3Zm0 6v5m0 3v1"/>',
    document:'<path d="M14 2H5v20h14V7l-5-5Zm0 0v6h5M8 12h8m-8 4h8"/>',
    edit:'<path d="M12 4H4v17h17v-8M10 14l1-5 8-8 4 4-8 8-5 1Z"/>',
    star:'<path d="m12 2 3 6.5 7 .9-5.1 5 1.2 7.1-6.1-3.4-6.1 3.4 1.2-7.1L2 9.4l7-.9L12 2Z"/>',
    drive:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M3 12h6m6 0h6m-9 3v6"/>',
    gauge:'<path d="M4 19a10 10 0 1 1 16 0H4Zm8-6 5-5"/><circle cx="12" cy="13" r="1"/>',
    cylinder:'<path d="m12 2 9 5v10l-9 5-9-5V7l9-5Zm0 0v20M3 7l9 5 9-5"/>',
    close:'<path d="m6 6 12 12M6 18 18 6"/>'
  };
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function svg(name){
    const base=name.replace(/-filled$/,'');
    if(!Object.hasOwn(paths,base))return '';
    return `<svg class="apv-icon${name.endsWith('-filled')?' apv-icon-filled':''}" data-icon="${name}" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[base]}</svg>`;
  }
  function renderText(text){
    return escape(text).replace(/\[icon:([a-z-]+)\]/g,(marker,name)=>svg(name)||marker);
  }
  function observe(doc){
    // Translated labels and live components use textContent. Decorate only explicit
    // icon tokens, never reinterpret arbitrary user text as HTML.
    const excluded='script,style,svg,textarea,option,[contenteditable]';
    function decorate(node){
      if(!node.parentElement||node.parentElement.closest(excluded)||!node.data.includes('[icon:'))return;
      const html=renderText(node.data);
      if(!html.includes('<svg'))return;
      const template=doc.createElement('template');template.innerHTML=html;
      node.replaceWith(template.content);
    }
    function scan(root){
      if(root.nodeType===3){decorate(root);return;}
      if(root.nodeType!==1||root.closest(excluded))return;
      const walker=doc.createTreeWalker(root,4),nodes=[];
      while(walker.nextNode())nodes.push(walker.currentNode);
      nodes.forEach(decorate);
    }
    scan(doc.body);
    const observer=new MutationObserver(records=>{
      const roots=new Set();
      for(const record of records){
        if(record.type==='characterData')roots.add(record.target);
        else for(const node of record.addedNodes)roots.add(node);
      }
      for(const node of roots)if(node.isConnected)scan(node);
    });
    observer.observe(doc.body,{subtree:true,childList:true,characterData:true});
    return observer;
  }
  return {svg,renderText,observe};
});
