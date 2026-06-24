(function(){
  var y=document.getElementById('yr'); if(y) y.textContent=new Date().getFullYear();
  [].forEach.call(document.querySelectorAll('video[autoplay]'),function(v){
    v.muted=true;v.setAttribute('playsinline','');
    function tryplay(){var p=v.play();if(p&&p.catch)p.catch(function(){});}
    tryplay();
    v.addEventListener('loadeddata',tryplay,{once:true});
    v.addEventListener('canplay',tryplay,{once:true});
    ['pointerdown','touchstart','scroll','keydown','mousemove'].forEach(function(ev){
      addEventListener(ev,function h(){tryplay();removeEventListener(ev,h);},{passive:true});
    });
  });
  var nav=document.querySelector('.nav'), rail=document.getElementById('railFill');
  function onScroll(){
    if(nav) nav.classList.toggle('solid', scrollY>40);
    if(rail){ var max=document.body.scrollHeight-innerHeight; rail.style.height=(max>0?scrollY/max*100:0)+'%'; }
  }
  addEventListener('scroll',onScroll,{passive:true});

  var fx=[].slice.call(document.querySelectorAll('[data-fx]'));
  fx.forEach(function(el){
    if(el.dataset.fx==='words'){
      var words=el.textContent.trim().split(/\s+/); el.textContent='';
      el.__w=words.map(function(w){
        var s=document.createElement('span'); s.className='w'; s.textContent=w;
        el.appendChild(s); el.appendChild(document.createTextNode(' ')); return s;
      });
    }
  });
  function ss(p){p=p<0?0:p>1?1:p;return p*p*(3-2*p);}
  function setFx(el,type,e){
    var t='';
    if(type==='standup')t='perspective(1600px) rotateX('+((1-e)*68)+'deg)';
    else if(type==='hingeL')t='perspective(1800px) rotateY('+((1-e)*-58)+'deg)';
    else if(type==='hingeR')t='perspective(1800px) rotateY('+((1-e)*58)+'deg)';
    else if(type==='flip')t='perspective(1300px) rotateY('+((1-e)*72)+'deg)';
    else if(type==='unfold')t='scaleY('+(0.05+0.95*e)+')';
    else if(type==='rise')t='translateY('+((1-e)*52)+'px)';
    else if(type==='fade')t='translateY('+((1-e)*16)+'px)';
    el.style.opacity=e; el.style.transform=t;
  }
  function frame(){
    requestAnimationFrame(frame);
    var vh=innerHeight;
    for(var i=0;i<fx.length;i++){
      var el=fx[i], r=el.getBoundingClientRect();
      var base=(vh-r.top)/(vh*0.8)-((+el.dataset.i||0)*0.07);
      if(el.dataset.fx==='words'){
        el.style.opacity=1; el.style.transform='none';
        el.__w.forEach(function(s,j){var e=ss(base-j*0.05);s.style.opacity=e;s.style.transform='perspective(900px) rotateX('+((1-e)*78)+'deg)';});
      } else setFx(el,el.dataset.fx,ss(base));
    }
  }
  onScroll(); frame();

  var lang=document.documentElement.lang||'ja';
  var bk={ja:['booking.html','ご予約'],en:['booking.en.html','Book'],th:['booking.th.html','จอง']}[lang]||['booking.html','ご予約'];
  if(!/booking\.(html|en\.html|th\.html)$/.test(location.pathname)){
    var fab=document.createElement('a');
    fab.href=bk[0]; fab.className='fab-book'; fab.textContent=bk[1]; fab.setAttribute('aria-label',bk[1]);
    document.body.appendChild(fab);
  }

  // GA: 予約・連絡ボタンのクリックをイベント計測（コンバージョン把握）
  document.addEventListener('click',function(e){
    var a=e.target&&e.target.closest&&e.target.closest('a'); if(!a) return;
    var h=a.getAttribute('href')||'';
    function t(n,m){ if(window.gtag) gtag('event',n,{method:m}); }
    if(/fresha\.com/.test(h)) t('booking_click','fresha');
    else if(/line\.me/.test(h)) t('contact_click','line');
    else if(/wa\.me/.test(h)) t('contact_click','whatsapp');
    else if(/^tel:/.test(h)) t('contact_click','phone');
    else if(/^mailto:/.test(h)) t('contact_click','email');
    else if(a.classList.contains('fab-book')||/booking\.(html|en\.html|th\.html)/.test(h)) t('booking_click','booking_page');
  },true);
})();

(function(){
  var nl=document.querySelector('.nav .nav-links'); if(!nl||nl.querySelector('.nav-toggle')) return;
  var lang=document.documentElement.lang||'ja';
  var ext=lang==='en'?'.en.html':lang==='th'?'.th.html':'.html';
  function u(s,h){return s+ext+(h||'');}
  var th=lang==='th';
  var L=th?{wic:'รู้จัก Ciel',menu:'เมนู',hs:'เฮดสปา',bp:'นโยบายการจอง',story:'เรื่องราว',media:'สื่อ',ig:'Instagram',contact:'ติดต่อ',resv:'จองคิว'}
          :{wic:'What is Ciel',menu:'Menu',hs:'Head Spa',bp:'Booking Policy',story:'Story',media:'Media',ig:'Instagram',contact:'Contact',resv:'Reservation'};
  nl.innerHTML='<div class="nav-main"><a href="'+u('what-is-ciel')+'">'+L.wic+'</a><a href="'+u('menu')+'">'+L.menu+'</a><a href="'+u('headspa')+'">'+L.hs+'</a><a href="'+u('booking-policy')+'">'+L.bp+'</a></div><button class="nav-toggle" aria-label="Menu"><span></span><span></span><span></span></button>';
  var items=[[L.story,u('index','#story')],[L.wic,u('what-is-ciel')],[L.menu,u('menu')],[L.hs,u('headspa')],[L.bp,u('booking-policy')],[L.media,u('press')],[L.ig,u('index','#instagram')],[L.contact,u('contact')],[L.resv,u('booking')]];
  var path=location.pathname.replace(/^\//,''); var slug=path.replace(/\.(en|th)\.html$/,'').replace(/\.html$/,''); if(!slug)slug='index';
  function lu(c){var e=c==='en'?'.en.html':c==='th'?'.th.html':'.html';return '/'+slug+e;}
  var ov=document.createElement('div'); ov.className='nav-overlay'; var html='';
  items.forEach(function(it,i){html+='<a href="'+it[1]+'" style="transition-delay:'+(0.12+i*0.05).toFixed(2)+'s">'+it[0]+'</a>';});
  html+='<div class="ov-lang"><a href="'+lu('ja')+'">JA</a><span style="opacity:.4;color:#9b9ca0">·</span><a href="'+lu('en')+'">EN</a><span style="opacity:.4;color:#9b9ca0">·</span><a href="'+lu('th')+'">TH</a></div>';
  ov.innerHTML=html; document.body.appendChild(ov);
  function setOpen(on){document.body.classList.toggle('menu-open',on);ov.style.visibility=on?'visible':'';ov.style.opacity=on?'1':'';}
  nl.querySelector('.nav-toggle').addEventListener('click',function(){setOpen(!document.body.classList.contains('menu-open'));});
  ov.addEventListener('click',function(e){if(e.target.closest('a'))setOpen(false);});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')setOpen(false);});
})();
