# Regenerates ios/CurrencyIntelligence/CurrencyIntelligence/Strings.swift from apps/web/i18n.js (same keys on both clients).
import re
js=open('apps/web/i18n.js').read()
entries=re.findall(r'"((?:[^"\\]|\\.)*)": \["((?:[^"\\]|\\.)*)", "((?:[^"\\]|\\.)*)"\]', js)
def sw(s): return s.replace('\\','\\\\').replace('"','\\"')
def un(s): return bytes(s,'utf-8').decode('unicode_escape').encode('latin-1').decode('utf-8') if '\\' in s else s
lines=['// GENERATED from apps/web/i18n.js by scripts/gen-strings.py — do not edit by hand. Same keys as the web client.','import Foundation','','enum Strings {','    static let table: [String: (ja: String, th: String)] = [']
seen=set(); uniq=[]
for k,ja,th in entries:
    if k in seen: continue
    seen.add(k); uniq.append((k,ja,th))
entries=uniq
lines+=[f'        "{sw(un(k))}": ("{sw(un(ja))}", "{sw(un(th))}"),' for k,ja,th in entries]
lines+=['    ]','}']
open('ios/CurrencyIntelligence/CurrencyIntelligence/Strings.swift','w').write('\n'.join(lines)+'\n')
print(len(entries),'strings')
