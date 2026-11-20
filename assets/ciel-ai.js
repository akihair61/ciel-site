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
    ja:{title:'Ciel AI',sub:'髪のこと、メニュー、ご予約の決まり。何でもどうぞ',ph:'例: ブリーチなしでアッシュにできる？',send:'送信',photo:'写真を添付',hello:'こんにちは。Ciel の AI コンシェルジュです。髪質やカラーのご相談、メニューと料金の目安、ご予約の決まり、行き方など何でもお答えします。髪の写真を添えていただくと、より具体的にご提案できます。',chips:['今の髪で明るいアッシュにできる？','縮毛矯正とトリートメント、どっちがいい？','初めての予約の流れと料金は？','バンコクの硬水で髪がきしむ対策は？'],book:'オンライン予約へ',note:'AI の回答は参考情報です。最終的な提案と料金はカウンセリングで確定します。',err:'うまく繋がりませんでした。少し待ってからもう一度お試しください。',limit:'少し混み合っています。しばらくしてからお試しください。',off:'ただいま AI はお休み中です。',big:'写真が大きすぎます（10MB まで）。',close:'閉じる',clear:'会話を消す'},
    en:{title:'Ciel AI',sub:'Hair, menu, booking rules — ask anything',ph:'e.g. Can I go ash without bleach?',send:'Send',photo:'Attach a photo',hello:'Hi, I’m Ciel’s AI concierge. Ask me about your hair, colour feasibility, our menu and price guide, booking rules or how to find us. Attach a photo of your hair for more specific advice.',chips:['Can my hair go light ash?','Straightening or treatment — which first?','First visit: how does booking and payment work?','My hair feels rough from Bangkok water — what helps?'],book:'Book online',note:'AI answers are for guidance. Final advice and prices are confirmed at your consultation.',err:'Connection problem. Please try again in a moment.',limit:'A bit busy right now — please try again shortly.',off:'The AI concierge is resting right now.',big:'Photo too large (max 10MB).',close:'Close',clear:'Clear chat'},
    th:{title:'Ciel AI',sub:'เรื่องผม เมนู กติกาการจอง ถามได้ทุกอย่าง',ph:'เช่น ทำสีแอชได้ไหมถ้าไม่ฟอก',send:'ส่ง',photo:'แนบรูป',hello:'สวัสดีค่ะ นี่คือ AI คอนเซียร์จของ Ciel ถามเรื่องสภาพผม สีที่ทำได้ เมนูและราคาโดยประมาณ กติกาการจอง หรือการเดินทางได้เลย แนบรูปผมมาด้วยจะแนะนำได้ตรงขึ้นค่ะ',chips:['ผมตอนนี้ทำสีแอชสว่างได้ไหม','ยืดผมกับทรีตเมนต์ ควรทำอะไรก่อน','มาครั้งแรก จองและจ่ายเงินยังไง','ผมแห้งหยาบเพราะน้ำกรุงเทพ ทำยังไงดี'],book:'จองออนไลน์',note:'คำตอบจาก AI เป็นข้อมูลเบื้องต้น ข้อเสนอและราคาจริงยืนยันตอนปรึกษาที่ร้าน',err:'เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้งนะคะ',limit:'ตอนนี้มีผู้ใช้เยอะ กรุณาลองใหม่สักครู่',off:'AI พักอยู่ชั่วคราวค่ะ',big:'รูปใหญ่เกินไป (ไม่เกิน 10MB)',close:'ปิด',clear:'ล้างแชท'}
  }[L];
  var KEY='ciel_ai_conv_'+L;
  function ls(k,v){try{if(v===undefined)return sessionStorage.getItem(k);sessionStorage.setItem(k,v);}catch(e){return null;}}
  var conv=[];try{conv=JSON.parse(ls(KEY)||'[]')||[];}catch(e){conv=[];}
  if(!Array.isArray(conv))conv=[];
  function save(){try{ls(KEY,JSON.stringify(conv.slice(-24)));}catch(e){}}
  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  // 軽い Markdown: **太字**・箇条書き・URL をリンクに・段落
  function md(s){
    var lines=String(s).split('\n'),out='',ul=false;
    function inl(t){t=esc(t).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/(https?:\/\/[^\s<）)]+)/g,function(u){return '<a href="'+u+'" target="_blank" rel="noopener">'+(u.indexOf('booking')>-1?T.book:u.replace(/^https?:\/\//,''))+'</a>';});return t;}
    lines.forEach(function(ln){
      var m=ln.match(/^\s*(?:[-・•*]|\d+[.)])\s+(.*)$/);
      if(m){if(!ul){out+='<ul>';ul=true;}out+='<li>'+inl(m[1])+'</li>';return;}
      if(ul){out+='</ul>';ul=false;}
      if(ln.trim())out+='<p>'+inl(ln)+'</p>';
    });
    if(ul)out+='</ul>';
    return out;
  }
  var ui=null;
  function build(host,embed){
    host.innerHTML='<div class="cai-box" role="region" aria-label="'+T.title+'">'+
      '<div class="cai-head"><div><div class="t">'+T.title+'</div><div class="s">'+T.sub+'</div></div>'+(embed?'<button class="x" type="button" title="'+T.clear+'" aria-label="'+T.clear+'" data-clear>↺</button>':'<button class="x" type="button" aria-label="'+T.close+'" data-close>✕</button>')+'</div>'+
      '<div class="cai-log" aria-live="polite"></div>'+
      '<div class="cai-chips"></div>'+
      '<div class="cai-pv" hidden><img alt=""><span></span><button type="button" data-rm>✕</button></div>'+
      '<div class="cai-in"><button class="b" type="button" title="'+T.photo+'" aria-label="'+T.photo+'" data-photo>📷</button><input type="file" accept="image/*" capture="environment" hidden><textarea rows="1" placeholder="'+T.ph+'" aria-label="'+T.title+'"></textarea><button class="b send" type="button" aria-label="'+T.send+'" data-send>➤</button></div>'+
      '<div class="cai-foot"><span>'+T.note+'</span><a href="'+BOOK+'" target="_blank" rel="noopener">'+T.book+'</a></div></div>';
    var o={host:host,log:host.querySelector('.cai-log'),chips:host.querySelector('.cai-chips'),ta:host.querySelector('textarea'),file:host.querySelector('input[type=file]'),pv:host.querySelector('.cai-pv'),send:host.querySelector('[data-send]'),img:null,busy:false};
    o.ta.addEventListener('input',function(){o.ta.style.height='auto';o.ta.style.height=Math.min(140,o.ta.scrollHeight)+'px';});
    o.ta.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&!(/Mobi|Android/i.test(navigator.userAgent))){e.preventDefault();submit(o);}});
    o.send.addEventListener('click',function(){submit(o);});
    host.querySelector('[data-photo]').addEventListener('click',function(){o.file.click();});
    o.file.addEventListener('change',function(){var f=o.file.files&&o.file.files[0];o.file.value='';if(f)pick(o,f);});
    host.querySelector('[data-rm]').addEventListener('click',function(){o.img=null;o.pv.hidden=true;});
    var cl=host.querySelector('[data-clear]');if(cl)cl.addEventListener('click',function(){conv=[];save();render(o);});
    var x=host.querySelector('[data-close]');if(x)x.addEventListener('click',function(){close();});
    render(o);
    return o;
  }
  function render(o){
    o.log.innerHTML='';
    add(o,'a',T.hello,true);
    conv.forEach(function(m){add(o,m.role==='user'?'u':'a',m.text,true,m.img);});
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
  function pick(o,f){
    if(f.size>10*1024*1024){sys(o,T.big);return;}
    var r=new FileReader();r.onload=function(){var im=new Image();im.onload=function(){
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
    o.busy=true;o.send.disabled=true;
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
      o.busy=false;o.send.disabled=false;
      if(ok&&acc){conv.push({role:'assistant',text:acc});save();}
      else{d.remove();}
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
    }).then(function(){finish(true);}).catch(function(e){finish(false);sys(o,T[e.message]||T.err);});
  }
  var dlg=null;
  function open(q){
    if(!dlg){dlg=D.createElement('dialog');dlg.className='cai';D.documentElement.appendChild(dlg);ui=build(dlg,false);dlg.addEventListener('click',function(e){if(e.target===dlg)close();});}
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
