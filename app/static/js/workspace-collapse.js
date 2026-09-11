const rail=document.querySelector('.shared-workspace-rail');
const layout=rail?.parentElement;
if (rail && layout && !layout.classList.contains('chat-route-layout')) {
  layout.classList.add('collapsible-workspace');
  rail.id ||= 'workspace-sidebar';
  const button=document.createElement('button');button.type='button';button.className='workspace-collapse-toggle';button.setAttribute('aria-controls',rail.id);button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4zM9 5v14m6-10-3 3 3 3"/></svg>';
  rail.prepend(button);
  rail.querySelectorAll('nav a, nav button').forEach(link=>{link.title=link.getAttribute('aria-label')||link.textContent.trim();link.setAttribute('aria-label',link.title);[...link.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE&&node.textContent.trim()).forEach(node=>{const label=document.createElement('span');label.className='workspace-link-label';label.textContent=node.textContent.trim();node.replaceWith(label);});});
  const tooltip=document.createElement('div');tooltip.className='workspace-rail-tooltip';tooltip.hidden=true;tooltip.setAttribute('aria-hidden','true');document.body.append(tooltip);
  function hideTooltip(){tooltip.hidden=true;}
  function showTooltip(item){if(!layout.classList.contains('rail-collapsed'))return;tooltip.textContent=item.getAttribute('aria-label')||item.title;const box=item.getBoundingClientRect();tooltip.style.left=`${rail.getBoundingClientRect().right+10}px`;tooltip.hidden=false;tooltip.style.top=`${Math.max(8,Math.min(innerHeight-tooltip.offsetHeight-8,box.top+(box.height-tooltip.offsetHeight)/2))}px`;}
  rail.querySelectorAll('nav a, nav button, .workspace-person').forEach(item=>{item.addEventListener('mouseenter',()=>showTooltip(item));item.addEventListener('mouseleave',hideTooltip);item.addEventListener('focus',()=>showTooltip(item));item.addEventListener('blur',hideTooltip);item.addEventListener('click',hideTooltip);});
  rail.querySelector('.workspace-rail-scroll')?.addEventListener('scroll',hideTooltip,{passive:true});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')hideTooltip();});
  window.addEventListener('resize',hideTooltip);
  const media=matchMedia('(min-width:901px)');
  let collapsed=false;try{collapsed=localStorage.getItem('emora:sidebar-collapsed')==='true';}catch{}
  function render(){hideTooltip();const active=media.matches&&collapsed;layout.classList.toggle('rail-collapsed',active);button.setAttribute('aria-expanded',String(!active));button.setAttribute('aria-label',active?'Expand sidebar':'Collapse sidebar');button.title=button.getAttribute('aria-label');}
  button.addEventListener('click',()=>{collapsed=!collapsed;try{localStorage.setItem('emora:sidebar-collapsed',String(collapsed));}catch{}render();});media.addEventListener('change',render);render();
}
