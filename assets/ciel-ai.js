/* Ciel AI コンシェルジュ（2026-11-21）
   ・右下の「AI に相談」ボタン → <dialog> のチャット。contact ページは <div class="cai-embed" data-cai-embed> に埋め込み
   ・返事はサーバー（functions/siteAi.js）の SSE を逐次表示。写真は端末で 1024px に縮めてから送る（1 通 1 枚）
   ・会話は sessionStorage（タブを閉じると消える）。個人情報は保存しない
   ・ciel-core.js が初回クリック時にこのファイルを読む（普段のページは軽いまま） */
(function(){
  var W=window,D=document;
  var L=(D.documentElement.lang||'ja').slice(0,2);if(L!=='en'&&L!=='th')L='ja';
  var URL_=W.CIEL_AI_URL||'https://asia-southeast1-ciel-hair-studio.cloudfunctions.net/siteAi';
  var BOOK='https://ciel-hair-studio.web.app/booking/menu.html?lang='+L;
  var T={
    ja:{title:'Ciel AI',sub:'メニュー・料金の目安・ご予約の決まり・行き方',ph:'例: 初めての予約の流れは？',send:'送信',photo:'写真を添付',hello:'こんにちは。Ciel の AI レセプションです。メニューの内容と料金の目安、所要時間、ご予約の決まり（デポジット・キャンセル）、営業時間、行き方、お支払い方法、どのメニューが合うかのご相談にお答えします。髪の状態を見ての判断はご来店時のカウンセリングで担当が行います（カウンセリングのみのご予約も可能です）。',chips:['初めての予約の流れと料金は？','営業時間と行き方は？','キャンセル・変更の決まりは？','メニューと所要時間を教えて'],book:'オンライン予約へ',note:'AI の回答は参考情報です。最終的な提案と料金はカウンセリングで確定します。',err:'うまく繋がりませんでした。少し待ってからもう一度お試しください。',limit:'少し混み合っています。しばらくしてからお試しください。',off:'ただいま AI はお休み中です。',big:'写真が大きすぎます（10MB まで）。',close:'閉じる',clear:'会話を消す',cut:'（通信が途中で切れました。続きは、もう一度送ってください）'},
    en:{title:'Ciel AI',sub:'Menu, price guide, booking rules, directions',ph:'e.g. How does a first booking work?',send:'Send',photo:'Attach a photo',hello:'Hi, I’m Ciel’s AI reception. I can help with our menu and price guide, service times, booking rules (deposit, cancellation), opening hours, directions, payment and which menu suits your goal. Advice that depends on your hair’s condition is given at the consultation in the salon (a consultation-only booking is also available).',chips:['First visit: how does booking and payment work?','Opening hours and how to get there?','Cancellation and change rules?','Menu and how long each service takes'],book:'Book online',note:'AI answers are for guidance. Final advice and prices are confirmed at your consultation.',err:'Connection problem. Please try again in a moment.',limit:'A bit busy right now — please try again shortly.',off:'The AI concierge is resting right now.',big:'Photo too large (max 10MB).',close:'Close',clear:'Clear chat',cut:'(The connection dropped mid-reply. Please send again for the rest.)'},
    th:{title:'Ciel AI',sub:'เมนู ราคาโดยประมาณ กติกาการจอง การเดินทาง',ph:'เช่น จองครั้งแรกต้องทำยังไง',send:'ส่ง',photo:'แนบรูป',hello:'สวัสดีค่ะ นี่คือ AI รีเซปชันของ Ciel ถามเรื่องเมนูและราคาโดยประมาณ เวลาที่ใช้ กติกาการจอง (มัดจำ ยกเลิก) เวลาทำการ การเดินทาง การชำระเงิน และเมนูไหนเหมาะกับคุณได้เลย ส่วนการประเมินสภาพผม ช่างจะดูให้ตอนปรึกษาที่ร้าน (จองปรึกษาอย่างเดียวก็ได้ค่ะ)',chips:['มาครั้งแรก จองและจ่ายเงินยังไง','เวลาทำการและการเดินทาง','กติกาการยกเลิกและเปลี่ยนคิว','เมนูและเวลาที่ใช้แต่ละอย่าง'],book:'จองออนไลน์',note:'คำตอบจาก AI เป็นข้อมูลเบื้องต้น ข้อเสนอและราคาจริงยืนยันตอนปรึกษาที่ร้าน',err:'เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้งนะคะ',limit:'ตอนนี้มีผู้ใช้เยอะ กรุณาลองใหม่สักครู่',off:'AI พักอยู่ชั่วคราวค่ะ',big:'รูปใหญ่เกินไป (ไม่เกิน 10MB)',close:'ปิด',clear:'ล้างแชท',cut:'(การเชื่อมต่อหลุดระหว่างตอบ กรุณาส่งอีกครั้ง)'}
  }[L];
  var KEY='ciel_ai_conv_'+L;
  function ls(k,v){try{if(v===undefined)return sessionStorage.getItem(k);sessionStorage.setItem(k,v);}catch(e){return null;}}
  var conv=[];try{conv=JSON.parse(ls(KEY)||'[]')||[];}catch(e){conv=[];}
  if(!Array.isArray(conv))conv=[];
  function save(){try{ls(KEY,JSON.stringify(conv.slice(-24).map(function(m){return {role:m.role,text:m.text,img:m.img?1:null};})));}catch(e){}} // 写真は保存しない（印だけ）
  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  // 軽い Markdown: **太字**・箇条書き・URL をリンクに・段落
  function md(s){
    var lines=String(s).split('\n'),out='',ul=false;
    var OK_HOST=/^https:\/\/(ciel-hair-studio\.web\.app|www\.ciel-japanesehairstudio-bkk\.com|apps\.apple\.com|play\.google\.com|maps\.google\.com|www\.google\.com)\//; // リンクにするのは自社の宛先だけ（それ以外は文字のまま）
    function inl(t){t=esc(t).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/(https?:\/\/[^\s<）)]+)/g,function(u){if(!OK_HOST.test(u))return u;var book=/ciel-hair-studio\.web\.app\/booking/.test(u);return '<a href="'+(book?BOOK:u)+'" target="_blank" rel="noopener">'+(book?T.book:u.replace(/^https?:\/\//,''))+'</a>';});return t;}
    lines.forEach(function(ln){
      var m=ln.match(/^\s*(?:[-・•*]|\d+[.)])\s+(.*)$/);
      if(m){if(!ul){out+='<ul>';ul=true;}out+='<li>'+inl(m[1])+'</li>';return;}
      if(ul){out+='</ul>';ul=false;}
      if(ln.trim())out+='<p>'+inl(ln)+'</p>';
    });
    if(ul)out+='</ul>';
    return out;
  }
  var ui=null,reqId=0;
  function build(host,embed){
    host.innerHTML='<div class="cai-box" role="region" aria-label="'+T.title+'">'+
      '<div class="cai-head"><div><div class="t">'+T.title+'</div><div class="s">'+T.sub+'</div></div>'+(embed?'<button class="x" type="button" title="'+T.clear+'" aria-label="'+T.clear+'" data-clear>↺</button>':'<button class="x" type="button" aria-label="'+T.close+'" data-close>✕</button>')+'</div>'+
      '<div class="cai-log"></div><div class="cai-status" aria-live="polite" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)"></div>'+
      '<div class="cai-chips"></div>'+
      '<div class="cai-pv" hidden><img alt=""><span></span><button type="button" data-rm>✕</button></div>'+
      '<div class="cai-in"><textarea rows="1" placeholder="'+T.ph+'" aria-label="'+T.title+'"></textarea><button class="b send" type="button" aria-label="'+T.send+'" data-send>➤</button></div>'+
      '<div class="cai-foot"><span>'+T.note+'</span><a href="'+BOOK+'" target="_blank" rel="noopener">'+T.book+'</a></div></div>';
    var o={host:host,log:host.querySelector('.cai-log'),chips:host.querySelector('.cai-chips'),ta:host.querySelector('textarea'),file:null,pv:host.querySelector('.cai-pv'),send:host.querySelector('[data-send]'),img:null,busy:false};
    o.ta.addEventListener('input',function(){o.ta.style.height='auto';o.ta.style.height=Math.min(140,o.ta.scrollHeight)+'px';});
    o.ta.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&!(/Mobi|Android/i.test(navigator.userAgent))){e.preventDefault();submit(o);}});
    o.send.addEventListener('click',function(){submit(o);});
    host.querySelector('[data-rm]').addEventListener('click',function(){o.img=null;o.pv.hidden=true;});
    var cl=host.querySelector('[data-clear]');if(cl)cl.addEventListener('click',function(){reqId++;o.busy=false;o.send.disabled=false;conv=[];save();render(o);});
    var x=host.querySelector('[data-close]');if(x)x.addEventListener('click',function(){close();});
    render(o);
    return o;
  }
  function render(o){
    o.log.innerHTML='';
    add(o,'a',T.hello,true);
    conv.forEach(function(m){add(o,m.role==='user'?'u':'a',m.text,true,typeof m.img==='string'?m.img:null);});
    chips(o);
    o.log.scrollTop=o.log.scrollHeight;
  }
  function chips(o){
    o.chips.innerHTML='';
    if(conv.length)return;
    T.chips.forEach(function(q){var b=D.createElement('button');b.type='button';b.textContent=q;b.addEventListener('click',function(){o.ta.value=q;submit(o);});o.chips.appendChild(b);});
  }
  function add(o,who,text,silent,img){
    var d=D.createElement('div');d.className='cai-m '+who;
    if(img){var im=D.createElement('img');im.src=img;im.alt='';d.appendChild(im);}
    if(who==='a'){var w=D.createElement('div');w.innerHTML=md(text);d.appendChild(w);}else d.appendChild(D.createTextNode(text));
    o.log.appendChild(d);if(!silent)o.log.scrollTop=o.log.scrollHeight;return d;
  }
  function sys(o,text){var d=D.createElement('div');d.className='cai-m sys';d.textContent=text;o.log.appendChild(d);o.log.scrollTop=o.log.scrollHeight;}
  var pickId=0;
  function pick(o,f){
    if(f.size>10*1024*1024){sys(o,T.big);return;}
    var pid=++pickId;
    var r=new FileReader();r.onload=function(){var im=new Image();im.onerror=function(){if(pid===pickId)sys(o,T.err);};im.onload=function(){if(pid!==pickId)return;
      var mx=1024,s=Math.min(1,mx/Math.max(im.width,im.height)),c=D.createElement('canvas');c.width=Math.round(im.width*s);c.height=Math.round(im.height*s);
      c.getContext('2d').drawImage(im,0,0,c.width,c.height);var url=c.toDataURL('image/jpeg',.82);
      o.img=url;o.pv.hidden=false;o.pv.querySelector('img').src=url;o.pv.querySelector('span').textContent=T.photo;
    };im.src=r.result;};r.readAsDataURL(f);
  }
  function submit(o){
    var text=o.ta.value.trim();if((!text&&!o.img)||o.busy)return;
    var img=o.img;o.img=null;o.pv.hidden=true;o.ta.value='';o.ta.style.height='auto';
    var shown=text||(L==='en'?'(photo)':L==='th'?'(รูป)':'（写真）');
    conv.push({role:'user',text:shown,img:img||null});save();
    add(o,'u',shown,false,img);o.chips.innerHTML='';
    ask(o,text,img);
  }
  function ask(o,text,img){
    o.busy=true;o.send.disabled=true;var my=++reqId;
    var d=add(o,'a','',false);d.innerHTML='<span class="cai-typing"><i></i><i></i><i></i></span>';
    var msgs=conv.slice(-12).map(function(m,i,arr){
      if(m.role==='assistant')return {role:'assistant',content:m.text};
      var parts=[];
      if(m.img&&i===arr.length-1&&img){parts.push({type:'image',media_type:'image/jpeg',data:img.split(',')[1]});}
      parts.push({type:'text',text:m.text||(L==='en'?'Please look at this photo of my hair.':L==='th'?'ช่วยดูรูปผมของฉันหน่อย':'この髪の写真を見てください。')});
      return {role:'user',content:parts};
    });
    // 直前のアシスタントの返事が空（失敗）なら除く・user/assistant を交互に
    msgs=msgs.filter(function(m){return !(m.role==='assistant'&&!String(m.content).trim());});
    var fixed=[];msgs.forEach(function(m){if(fixed.length&&fixed[fixed.length-1].role===m.role){if(m.role==='user'){fixed[fixed.length-1].content=fixed[fixed.length-1].content.concat(m.content);}return;}fixed.push(m);});
    while(fixed.length&&fixed[0].role!=='user')fixed.shift();
    var acc='',done=false;
    function finish(ok){
      if(my!==reqId)return; // 消去や新しい送信の後に届いた古い返事は捨てる
      o.busy=false;o.send.disabled=false;
      if(acc){conv.push({role:'assistant',text:acc});save();if(!ok)sys(o,T.cut);}
      else{d.remove();}
      var st=o.host.querySelector('.cai-status');if(st&&acc)st.textContent=acc;
      try{W.__trk&&W.__trk('ai_chat',{ok:ok?1:0,len:acc.length,has_photo:img?1:0});}catch(e){}
    }
    fetch(URL_,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({lang:L,messages:fixed})}).then(function(r){
      if(!r.ok){var k=r.status===429?'limit':r.status===503?'off':'err';return r.text().then(function(){throw new Error(k);});}
      var reader=r.body.getReader(),dec=new TextDecoder(),buf='';
      function pump(){return reader.read().then(function(x){
        if(x.done){return;}
        buf+=dec.decode(x.value,{stream:true});var i;
        while((i=buf.indexOf('\n\n'))>=0){var ch=buf.slice(0,i);buf=buf.slice(i+2);var ln=ch.split('\n').find(function(l){return l.indexOf('data:')===0;});if(!ln)continue;
          var ev;try{ev=JSON.parse(ln.slice(5));}catch(e){continue;}
          if(ev.t){acc+=ev.t;d.innerHTML=md(acc);o.log.scrollTop=o.log.scrollHeight;}
          else if(ev.error){throw new Error('err');}
          else if(ev.done){done=true;}
        }
        return pump();
      });}
      return pump();
    }).then(function(){finish(done);}).catch(function(e){if(my!==reqId)return;var had=!!acc;finish(false);if(!had)sys(o,T[e.message]||T.err);});
  }
  var dlg=null;
  function open(q){
    if(!dlg){dlg=D.createElement('dialog');dlg.className='cai';dlg.setAttribute('aria-label',T.title);D.documentElement.appendChild(dlg);
      /* 携帯のキーボードで入力欄が隠れないように */
      try{if(W.visualViewport){W.visualViewport.addEventListener('resize',function(){if(innerWidth<=600&&dlg.open){dlg.style.height=Math.round(W.visualViewport.height)+'px';}});}}catch(e){}
      ui=build(dlg,false);dlg.addEventListener('click',function(e){if(e.target===dlg)close();});}
    if(!dlg.open){try{dlg.showModal();}catch(e){dlg.setAttribute('open','');}}
    if(q){ui.ta.value=q;submit(ui);}else setTimeout(function(){ui.ta.focus();},300);
    try{W.__trk&&W.__trk('ai_open',{q:q?1:0});}catch(e){}
  }
  function close(){if(dlg&&dlg.open){dlg.close();}}
  function mount(el,q){var o=build(el,true);if(q){o.ta.value=q;submit(o);}return o;}
  W.CielAI={open:open,close:close,mount:mount};
  // 埋め込み先があれば描く（contact ページ）
  [].forEach.call(D.querySelectorAll('[data-cai-embed]'),function(el){if(!el.__cai){el.__cai=1;mount(el);}});
  if(W.__cielAiPending){var p=W.__cielAiPending;W.__cielAiPending=null;open(p===true?'':p);}
})();
