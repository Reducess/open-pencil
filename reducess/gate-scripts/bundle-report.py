import json,sys,gzip,os,re
stats=json.load(open(sys.argv[1])); pub=sys.argv[2]
def closure(entry, dyn=False):
    seen=set(); st=[entry]
    while st:
        f=st.pop()
        if f in seen or f not in stats: continue
        seen.add(f); st+=stats[f]['imports']+(stats[f]['dynamicImports'] if dyn else [])
    return seen
def sz(files):
    raw=gz=0
    for f in files:
        b=open(os.path.join(pub,f),'rb').read(); raw+=len(b); gz+=len(gzip.compress(b,9))
    return raw,gz
def cat(id):
    if re.search(r'@open-pencil/(fig|kiwi)/|@open-pencil/core/dist/(kiwi|io/formats/fig)/',id): return 'fig+kiwi'
    if 'canvaskit-wasm' in id: return 'canvaskit-js'
    for k in ['@open-pencil/core','@open-pencil/vue','@open-pencil/scene-graph','@open-pencil/pen','reka-ui','@vueuse','yoga-layout','jspdf','svg2pdf','pptxgenjs','fontoxpath','opentype','sucrase','@tanstack','culori','unifont','es-toolkit','fflate','fzstd','valibot','acorn','html2canvas','canvg','dompurify','jszip','@floating-ui','@internationalized','@atlaskit','vue-router','@vue/','nuxt']:
        if k in id: return k
    return 'outros'
ed=[f for f,c in stats.items() if any('GateEditor' in m for m in c['modules'])][0]
page=[f for f,c in stats.items() if any('pages/editor' in m for m in c['modules'])][0]
entry=[f for f,c in stats.items() if any('nuxt/dist/app/entry' in m for m in c['modules'])][0]
base=closure(entry)
static=closure(ed)|closure(page)
lazy=closure(ed,True)|closure(page,True)
print('chunk do editor:',ed,'| pagina:',page,'| entry:',entry)
for name,fs in [('entry Nuxt (base do app, toda rota)',base),('rota /editor estatico, sem a base',static-base),('rota /editor estatico, total com base',static|base),('+ lazy (import() sob demanda), sem a base',lazy-static-base)]:
    r,g=sz(fs); print(f'{name}: {len(fs)} chunks, cru {r/1024:.0f} KiB, gzip {g/1024:.0f} KiB')
for name,fs in [('ESTATICO',static-base),('LAZY',lazy-static-base)]:
    agg={}; tot=0
    for f in fs:
        for id,l in stats[f]['modules'].items(): agg[cat(id)]=agg.get(cat(id),0)+l; tot+=l
    print(f'-- {name}: codigo-fonte renderizado (pre-minify) {tot/1024:.0f} KiB')
    for k,v in sorted(agg.items(),key=lambda x:-x[1])[:14]: print(f'   {k:28s} {v/1024:7.0f} KiB {100*v/tot:5.1f}%')
for f in sorted(lazy-static-base, key=lambda f:-stats[f]['size'])[:6]:
    top=sorted(stats[f]['modules'].items(),key=lambda x:-x[1])[:2]
    print('   lazy',f,stats[f]['size']//1024,'KiB',[t[0][:60] for t in top])
