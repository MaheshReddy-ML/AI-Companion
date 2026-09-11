import { initChrome } from "./common.js";

initChrome();

const menuButton = document.querySelector("[data-cinematic-menu]");
const nav = document.querySelector(".cinematic-nav");

menuButton?.addEventListener("click", () => {
  const open = nav?.classList.toggle("menu-open") ?? false;
  menuButton.setAttribute("aria-expanded", String(open));
});

nav?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    nav.classList.remove("menu-open");
    menuButton?.setAttribute("aria-expanded", "false");
  });
});

document.querySelectorAll("[data-cinematic-reveal]").forEach((section) => section.classList.add("is-visible"));

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && nav?.classList.contains("menu-open")) {
    nav.classList.remove("menu-open");
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.focus();
  }
});

// Deliberately local examples: nothing entered or selected here is stored.
const arrivalReplies = {
  listen: "You don’t need the whole plan yet. Tell me what matters most about this idea. We can start there.",
  think: "Let’s take one step at a time. Who is this idea for, and what is the smallest version you could try?",
  light: "Big idea, tiny first step. Even the grandest plans can begin on a napkin. Tea break brainstorm?",
};
document.querySelectorAll('[data-arrival-style]').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-arrival-style]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    const reply=document.getElementById('arrival-reply');reply.textContent=arrivalReplies[button.dataset.arrivalStyle];
    document.querySelector('[data-preview-index]').textContent=`0${Object.keys(arrivalReplies).indexOf(button.dataset.arrivalStyle)+1} / 03`;
    if(!matchMedia('(prefers-reduced-motion: reduce)').matches) reply.animate([{opacity:.35,transform:'translateY(5px)'},{opacity:1,transform:'none'}],{duration:280,easing:'ease-out'});
  });
});

// Content is visible without JavaScript; reveal only offscreen sections once.
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
if(!reducedMotion.matches && 'IntersectionObserver' in window){
  const observer=new IntersectionObserver(entries=>{entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.replace('arrival-reveal-pending','arrival-reveal-shown');observer.unobserve(entry.target);}});},{rootMargin:'0px 0px -30px 0px',threshold:.05});
  document.querySelectorAll('[data-arrival-reveal]').forEach(section=>{if(section.getBoundingClientRect().top>innerHeight){section.classList.add('arrival-reveal-pending');observer.observe(section);}});
  const showAll=()=>{document.querySelectorAll('.arrival-reveal-pending').forEach(section=>section.classList.replace('arrival-reveal-pending','arrival-reveal-shown'));observer.disconnect();};
  reducedMotion.addEventListener('change',showAll,{once:true});
  document.addEventListener('focusin',event=>{const section=event.target.closest('.arrival-reveal-pending');if(section){section.classList.replace('arrival-reveal-pending','arrival-reveal-shown');observer.unobserve(section);}});
  window.addEventListener('beforeprint',showAll);
}
