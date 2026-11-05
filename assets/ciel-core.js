/* Ciel site core (2026-11-05): クッキー同意(PDPA)・来訪元の引き継ぎ・計測イベント・Web Vitals・PWA。
   gtag の既定(consent default)と読み込みは各ページ head のインライン。ここは defer で後から動く。 */
(function(){
  var W=window,D=document;
  var L=(D.documentElement.lang||'ja').slice(0,2);if(L!=='en'&&L!=='th')L='ja';
  function gtag(){(W.dataLayer=W.dataLayer||[]).push(arguments);}
  function ls(k,v){try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v);}catch(e){return null;}}
  var CK=ls('ciel-consent');
  W.__trk=function(n,p){try{gtag('event',n,p||{});}catch(e){}try{if(W.fbq)fbq('trackCustom',n,p||{});}catch(e){}};

  /* Meta Pixel: 同意した人だけ・Pixel を使うページ(meta ciel-pixel)だけ */
  function loadPixel(){
    var m=D.querySelector('meta[name="ciel-pixel"]');
    if(CK!=='all'||!m||W.fbq)return;
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(W,D,'script','https://connect.facebook.net/en_US/fbevents.js');
    fbq('init',m.content);fbq('track','PageView');
  }
  function idle(f){if('requestIdleCallback' in W)requestIdleCallback(f,{timeout:4000});else setTimeout(f,2500);}
  idle(loadPixel);

  /* クッキー同意バー（3 言語）。既定は拒否＝head で denied。「同意する」で許可に更新 */
  var T={
    ja:{m:'より良い体験のために、分析・広告のクッキーを使用します（タイ PDPA に基づく同意）。',p:'プライバシーポリシー',ok:'同意する',no:'必要なものだけ',set:'クッキー設定',pu:'/privacy.html'},
    en:{m:'We use analytics and advertising cookies to improve your experience (consent under Thailand’s PDPA).',p:'Privacy policy',ok:'Accept',no:'Essential only',set:'Cookie settings',pu:'/privacy.en.html'},
    th:{m:'เราใช้คุกกี้เพื่อการวิเคราะห์และโฆษณาเพื่อประสบการณ์ที่ดีขึ้น (ความยินยอมตาม PDPA)',p:'นโยบายความเป็นส่วนตัว',ok:'ยอมรับ',no:'เฉพาะที่จำเป็น',set:'ตั้งค่าคุกกี้',pu:'/privacy.th.html'}
  }[L];
  var bar=null;
  function showBar(){
    if(!bar){
      var st=D.createElement('style');
      st.textContent='#ciel-ck{position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:9500;max-width:720px;margin:0 auto;background:rgba(29,30,32,.96);color:#f2f2f3;border:1px solid rgba(242,242,243,.16);padding:14px 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;font:300 12.5px/1.7 "Noto Sans JP","Helvetica Neue",Arial,sans-serif;letter-spacing:.02em;-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);box-shadow:0 10px 36px rgba(0,0,0,.3)}#ciel-ck p{margin:0;flex:1 1 280px}#ciel-ck a{color:#f2f2f3;text-decoration:underline}#ciel-ck .cb{display:flex;gap:8px}#ciel-ck button{all:unset;cursor:pointer;padding:9px 16px;font-size:12.5px;letter-spacing:.08em;border:1px solid rgba(242,242,243,.5);border-radius:999px;white-space:nowrap}#ciel-ck button.ok{background:#f2f2f3;color:#1d1e20;border-color:#f2f2f3}@media(max-width:760px){#ciel-ck{bottom:calc(72px + env(safe-area-inset-bottom,0px))}}@media(min-width:761px){#ciel-ck{left:18px;right:auto;margin:0;max-width:min(680px,calc(100vw - 200px))}}';
      D.head.appendChild(st);
      bar=D.createElement('div');bar.id='ciel-ck';bar.setAttribute('role','dialog');bar.setAttribute('aria-live','polite');bar.setAttribute('aria-label','Cookies');
      var p=D.createElement('p');p.appendChild(D.createTextNode(T.m+' '));
      var a=D.createElement('a');a.href=T.pu;a.textContent=T.p;p.appendChild(a);
      var cb=D.createElement('div');cb.className='cb';
      var ok=D.createElement('button');ok.type='button';ok.className='ok';ok.textContent=T.ok;
      var no=D.createElement('button');no.type='button';no.textContent=T.no;
      cb.appendChild(ok);cb.appendChild(no);bar.appendChild(p);bar.appendChild(cb);
      ok.addEventListener('click',function(){ls('ciel-consent','all');CK='all';gtag('consent','update',{ad_storage:'granted',ad_user_data:'granted',ad_personalization:'granted',analytics_storage:'granted'});bar.style.display='none';loadPixel();__trk('consent',{choice:'all'});});
      no.addEventListener('click',function(){ls('ciel-consent','essential');CK='essential';gtag('consent','update',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied'});bar.style.display='none';__trk('consent',{choice:'essential'});});
      /* body は演出の transform 配下で fixed が壊れるページがあるので html 直下（lang-pick.js と同じ理由） */
      D.documentElement.appendChild(bar);
    }
    bar.style.display='flex';
  }
  if(!CK)setTimeout(showBar,1800);
  var ft=D.querySelector('footer');
  if(ft){var sl=D.createElement('a');sl.href='#';sl.textContent=T.set;sl.style.cssText='display:inline-block;margin-top:12px;font-size:11px;letter-spacing:.08em;opacity:.75;text-decoration:underline;color:inherit';sl.addEventListener('click',function(e){e.preventDefault();showBar();});ft.appendChild(D.createElement('br'));ft.appendChild(sl);}

  /* 来訪元（広告・SNS）を初回だけ覚え、予約サイトへのリンクに付けて引き継ぐ（90 日） */
  var BOOK=/^https?:\/\/ciel-hair-studio\.web\.app\/booking\//;
  try{
    var q=new URLSearchParams(location.search),at={};
    ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','gclid','gbraid','wbraid','fbclid','ttclid'].forEach(function(k){if(q.get(k))at[k]=q.get(k).slice(0,200);});
    if(D.referrer&&!/ciel-japanesehairstudio-bkk\.com|ciel-hair-studio\.web\.app/.test(D.referrer))at.ref=D.referrer.slice(0,120);
    var old=null;try{old=JSON.parse(ls('ciel-attrib')||'null');}catch(e){}
    if(old&&old.t&&Date.now()-old.t>7776e6)old=null;
    if(Object.keys(at).length&&(!old||at.gclid||at.gbraid||at.wbraid)){at.t=Date.now();ls('ciel-attrib',JSON.stringify(at));}
  }catch(e){}
  function attrib(){try{var a=JSON.parse(ls('ciel-attrib')||'{}')||{};if(a.t&&Date.now()-a.t>7776e6)return {};return a;}catch(e){return {};}}
  function deco(a){
    try{
      var u=new URL(a.href),at=attrib();
      Object.keys(at).forEach(function(k){if(k!=='t'&&k!=='ref'&&!u.searchParams.has(k))u.searchParams.set(k,at[k]);});
      if(!u.searchParams.has('src'))u.searchParams.set('src','site');
      if(!u.searchParams.has('lang'))u.searchParams.set('lang',L);
      a.href=u.toString();
    }catch(e){}
  }
  D.addEventListener('click',function(e){
    var a=e.target&&e.target.closest&&e.target.closest('a');if(!a)return;
    var h=a.href||'',t=(a.textContent||'').trim().slice(0,40);
    if(BOOK.test(h)){deco(a);var p={from:'site',label:t,page:location.pathname},at=attrib();['utm_source','utm_medium','utm_campaign'].forEach(function(k){if(at[k])p[k]=at[k];});__trk('begin_booking',p);}
    else if(/apps\.apple\.com|play\.google\.com/.test(h))__trk('app_store_click',{label:t,store:/apple/.test(h)?'ios':'android'});
  },true);

  /* Web Vitals（LCP / CLS / INP）を GA4 へ。外部ライブラリ無し */
  try{
    var lcp=0,cls=0,inp=0,sent=0;
    new PerformanceObserver(function(l){var e=l.getEntries().pop();if(e)lcp=e.startTime;}).observe({type:'largest-contentful-paint',buffered:true});
    new PerformanceObserver(function(l){l.getEntries().forEach(function(e){if(!e.hadRecentInput)cls+=e.value;});}).observe({type:'layout-shift',buffered:true});
    try{new PerformanceObserver(function(l){l.getEntries().forEach(function(e){if(e.interactionId&&e.duration>inp)inp=e.duration;});}).observe({type:'event',buffered:true,durationThreshold:40});}catch(e){}
    addEventListener('visibilitychange',function(){if(D.visibilityState==='hidden'&&!sent){sent=1;__trk('web_vitals',{lcp:Math.round(lcp),cls:Math.round(cls*1000)/1000,inp:Math.round(inp),lang:L,page:location.pathname});}});
  }catch(e){}

  /* どこまで読まれたか */
  try{
    var seen={};
    var io=new IntersectionObserver(function(es){es.forEach(function(x){var id=x.target.id;if(x.isIntersecting&&!seen[id]){seen[id]=1;__trk('section_view',{id:id,page:location.pathname});}});},{threshold:.35});
    [].forEach.call(D.querySelectorAll('section[id],div.panel[id]'),function(s){io.observe(s);});
  }catch(e){}
  var marks=[25,50,75,100],t0=Date.now();
  addEventListener('scroll',function(){
    var d=Math.round((scrollY+innerHeight)/D.documentElement.scrollHeight*100);
    while(marks.length&&d>=marks[0])__trk('scroll_depth',{percent:marks.shift(),sec:Math.round((Date.now()-t0)/1000),page:location.pathname});
  },{passive:true});

  /* JS エラー（1 ページ 5 件まで） */
  var errs=0;
  addEventListener('error',function(e){if(errs++<5&&e.message)__trk('js_error',{msg:String(e.message).slice(0,100),src:String(e.filename||'').split('/').pop().slice(0,60),line:e.lineno,page:location.pathname});});

  /* PWA: 2 回目以降を速く・電波が切れても開く */
  if('serviceWorker' in navigator&&location.protocol==='https:')addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){});});
})();
