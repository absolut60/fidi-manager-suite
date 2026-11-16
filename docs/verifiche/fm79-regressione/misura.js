(() => {
 const W=innerWidth, de=document.documentElement;
 const out={scrollX: de.scrollWidth>W+1 ? de.scrollWidth : 0};
 const vis=e=>{const r=e.getBoundingClientRect();const s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!='hidden'&&s.display!='none'};
 // touch targets
 const small=[...document.querySelectorAll('button,a[href],[role=button],input:not([type=hidden]),select,[role=combobox],[role=checkbox],[role=switch],[role=tab]')].filter(vis).filter(e=>{const r=e.getBoundingClientRect();return r.height<40||(r.width<40&&r.height<40)});
 out.touchSmall=small.length; out.touchEs=[...new Set(small.slice(0,6).map(e=>(e.getAttribute('aria-label')||e.innerText||e.tagName).trim().slice(0,25)+':'+Math.round(e.getBoundingClientRect().height)))];
 // one-letter columns: text elements narrower than 30px with >3 lines
 const narrow=[...document.querySelectorAll('td,th,p,span,div')].filter(e=>e.children.length==0&&vis(e)&&(e.innerText||'').trim().length>6).filter(e=>{const r=e.getBoundingClientRect();const lh=parseFloat(getComputedStyle(e).lineHeight)||16;return r.width<36&&r.height>lh*3});
 out.colonneStrette=narrow.length; out.strEs=narrow.slice(0,3).map(e=>e.innerText.trim().slice(0,20));
 // clipped content to the right
 const clip=[...document.querySelectorAll('td,th,h1,h2,button,span')].filter(e=>vis(e)&&e.children.length==0&&(e.innerText||'').trim()).filter(e=>{const r=e.getBoundingClientRect();return r.right>W+2&&r.left<W});
 out.tagliati=clip.length; out.tagliEs=clip.slice(0,3).map(e=>e.innerText.trim().slice(0,20));
 // overlapping th
 let ov=0; document.querySelectorAll('thead tr').forEach(tr=>{const ths=[...tr.children].filter(vis);ths.forEach(th=>{const sp=th.querySelector('*')||th;const r=document.createRange();r.selectNodeContents(th);const rr=r.getBoundingClientRect();const tr2=th.getBoundingClientRect();if(rr.width>tr2.width+4)ov++;})});
 out.intestSovrapposte=ov;
 const dl=[...document.querySelectorAll('[role=dialog]')].filter(vis).map(e=>e.getBoundingClientRect()).filter(r=>r.right>W+1||r.bottom>innerHeight+1||r.left<-1||r.top<-1);
 out.dialogFuori=dl.length;
 out.titolo=(document.querySelector('h1')?.innerText||'').slice(0,40);
 out.erroreApp=/Something went wrong|Errore imprevisto|404/.test(document.body.innerText.slice(0,2000));
 return out;})()
