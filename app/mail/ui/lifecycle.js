const timers=new Set();
let visible=true;
export function visibleInterval(callback,ms){
 const timer=setInterval(()=>{if(visible&&!document.hidden)void callback();},ms);
 timers.add(timer);return timer;
}
export function installLifecycle(hana){
 const applyBudget=budget=>{visible=budget?.visible!==false;document.body.dataset.hostHidden=String(!visible);};
 const applyTheme=theme=>{document.documentElement.dataset.hostAppearance=theme?.appearance||'light';document.dispatchEvent(new Event('mail:theme'));};
 applyBudget(hana.lifecycle.getSnapshot());applyTheme(hana.theme.getSnapshot());
 const offBudget=hana.lifecycle.subscribe(applyBudget),offTheme=hana.theme.subscribe(applyTheme);
 window.addEventListener('pagehide',()=>{offBudget();offTheme();for(const timer of timers)clearInterval(timer);timers.clear();},{once:true});
}
