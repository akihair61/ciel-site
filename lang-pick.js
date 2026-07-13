// ホーム(トップ)に入った時だけ、言語選択をふわっと表示する。
// サイト内リンクで戻ってきた時は出さない（referrerが同一オリジンならスキップ）。
(function(){
  var p=location.pathname;
  var isTop=/(^|\/)(index(\.en|\.th)?\.html)?$/.test(p);
  if(!isTop)return;
  try{ if(document.referrer && new URL(document.referrer).origin===location.origin) return; }catch(e){}
  var cur=p.indexOf('.en.')>-1?'en':(p.indexOf('.th.')>-1?'th':'ja');
  var FILE={ja:'index.html',en:'index.en.html',th:'index.th.html'};
  function init(){
    var css=document.createElement('style');
    css.textContent='#lang-pick{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(242,242,243,.72);backdrop-filter:blur(18px) saturate(150%);-webkit-backdrop-filter:blur(18px) saturate(150%);opacity:0;transition:opacity .6s ease;}#lang-pick.show{opacity:1;}#lang-pick .lp-card{background:#fff;border-radius:22px;box-shadow:0 24px 70px rgba(29,30,32,.18);padding:34px 30px;text-align:center;width:min(320px,86vw);transform:translateY(14px);transition:transform .6s ease;}#lang-pick.show .lp-card{transform:none;}#lang-pick .lp-logo{font-family:Georgia,serif;font-size:30px;letter-spacing:.06em;color:#1d1e20;}#lang-pick .lp-sub{font-size:9.5px;letter-spacing:.28em;color:#8a8b90;margin:4px 0 20px;}#lang-pick button{display:block;width:100%;margin:9px 0;padding:13px 0;border-radius:999px;border:1px solid #e2e2e4;background:#fff;font-size:14px;font-weight:700;color:#1d1e20;cursor:pointer;font-family:inherit;transition:all .15s;}#lang-pick button:hover{background:#1d1e20;color:#fff;}';
    document.head.appendChild(css);
    var d=document.createElement('div');d.id='lang-pick';
    d.innerHTML='<div class="lp-card"><div class="lp-logo">Ciel</div><div class="lp-sub">JAPANESE HAIR STUDIO</div>'+
      '<button data-l="ja">日本語</button>'+
      '<button data-l="en">English</button>'+
      '<button data-l="th">ภาษาไทย</button></div>';
    document.documentElement.appendChild(d); // bodyはscroll演出のtransform配下でfixedが壊れるためhtml直下に置く
    d.querySelectorAll('button').forEach(function(b){
      b.addEventListener('click',function(){
        var l=b.getAttribute('data-l');
        try{localStorage.setItem('ciel_site_lang',l);}catch(e){}
        d.style.opacity='0';
        setTimeout(function(){ if(l===cur){d.remove();} else {location.href=FILE[l];} },350);
      });
    });
    requestAnimationFrame(function(){requestAnimationFrame(function(){d.classList.add('show');});});
  }
  if(document.body)init(); else document.addEventListener('DOMContentLoaded',init);
})();
