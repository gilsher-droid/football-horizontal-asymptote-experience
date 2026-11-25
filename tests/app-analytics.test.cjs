const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const script = fs.readFileSync(path.join(__dirname, '../app-analytics.js'), 'utf8');
const guard = fs.readFileSync(path.join(__dirname, '../simulator-access-guard.js'), 'utf8');
const langScript = fs.readFileSync(path.join(__dirname, '../language-support.js'), 'utf8');
const key = 'football-asymptote.analytics-consent';
const DAY = 86400000;
const startTime = Date.parse('2026-11-25T16:00:00Z');
const labels = 'utm_source=linkedin&utm_medium=paid_social&utm_campaign=lead_football_20261125&utm_content=en_30s_global_asia';
function setup({ url='https://asymptote.fundamatics.com/?lang=en&'+labels, stored=[], lang='en', access=true, privateLanding=false, storageFails=false, now=startTime }={}) {
  let currentTime=now, reloads=0;
  const nodes=[], observers=[], docListeners=new Map(), winListeners=new Map(), storage=new Map(stored);
  class Element {
    constructor(tag='div') {this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.listeners=new Map();this.className='';this.id='';this.hidden=false;this.textContent='';this.classList={add:()=>{},remove:()=>{}};nodes.push(this);}
    append(...items){this.children.push(...items);}
    appendChild(item){this.children.push(item);return item;}
    setAttribute(name,value){this[name]=value;}
    addEventListener(name,handler){if(!this.listeners.has(name))this.listeners.set(name,[]);this.listeners.get(name).push(handler);}
    click(){for(const fn of this.listeners.get('click')||[])fn({target:this});}
    focus(){this.focused=true;}
    closest(){return ['randomButton','analyzeButton'].includes(this.id)||this.className==='rule-card'?this:null;}
  }
  const root=new Element('html');root.lang=lang;root.dataset.accessGranted=access?'true':undefined;
  const location=new URL(url);location.reload=()=>reloads++;
  const document={documentElement:root,body:new Element('body'),head:new Element('head'),referrer:'https://fundamatics.com/research/private?token=secret#subscriber',readyState:'loading',createElement:tag=>new Element(tag),querySelectorAll:()=>[],addEventListener:(name,handler)=>{if(!docListeners.has(name))docListeners.set(name,[]);docListeners.get(name).push(handler);}};
  const history={state:{},replaceState:(_state,_title,url)=>{location.href=String(url);}};
  const localStorage={getItem:name=>{if(storageFails)throw Error('storage unavailable');return storage.get(name)||null;},setItem:(name,value)=>{if(storageFails)throw Error('storage unavailable');storage.set(name,value);},removeItem:name=>storage.delete(name)};
  class DateMock extends Date {static now(){return currentTime;}}
  const window={location,localStorage,history,fundamaticsPrivateLanding:privateLanding,addEventListener:(name,handler)=>{if(!winListeners.has(name))winListeners.set(name,[]);winListeners.get(name).push(handler);}};
  const context=vm.createContext({window,location,localStorage,history,document,Element,URL,URLSearchParams,Date:DateMock,MutationObserver:class{constructor(fn){this.callback=fn;observers.push(this);}observe(){}},console});
  const run=()=>vm.runInContext(script,context);run();
  const buttons=()=>nodes.filter(node=>node.tagName==='BUTTON');
  const sendDocument=(type,target,extra={})=>{for(const handler of docListeners.get(type)||[])handler({target,...extra});};
  const sendWindow=type=>{for(const handler of winListeners.get(type)||[])handler({type});};
  const data=()=>Array.from(window.dataLayer||[],args=>Array.from(args));
  return {context,window,document,location,storage,root,nodes,observers,run,Element,accept:()=>buttons()[0].click(),reject:()=>buttons()[1].click(),preferences:()=>buttons()[2].click(),events:()=>data().filter(c=>c[0]==='event'),data,scripts:()=>document.head.children.filter(n=>n.tagName==='SCRIPT'),reloads:()=>reloads,sendDocument,sendWindow,time:value=>currentTime=value};
}
const consent=(choice,expiresAt=startTime+DAY)=>JSON.stringify({version:1,choice,expiresAt});
test('measurement has no tag or events before explicit local consent; site consent is not app consent',()=>{
 for(const stored of [[],[['fundamatics-analytics-consent',JSON.stringify({version:2,choice:'accepted',expiresAt:startTime+DAY})]]]){const s=setup({stored});assert.equal(s.scripts().length,0);assert.equal(s.events().length,0);assert.equal(s.window.footballAnalytics.allowed(),false);}
});
test('stored rejection and expired/invalid consent never load GA',()=>{
 for(const value of [consent('rejected'),consent('accepted',startTime-1),'not json',JSON.stringify({version:2,choice:'accepted',expiresAt:startTime+DAY}),consent('accepted',startTime+181*DAY)]){const s=setup({stored:[[key,value]]});assert.equal(s.scripts().length,0);}
});
test('acceptance initializes one existing GA tag, one page view and one app open with safe campaign context',()=>{
 const s=setup();s.accept();assert.equal(s.scripts().length,1);assert.match(s.scripts()[0].src,/G-EYHXB09T96$/);assert.deepEqual(s.events().map(c=>c[1]),['page_view','app_open']);
 const config=s.data().find(c=>c[0]==='config')[2];assert.equal(config.send_page_view,false);assert.equal(config.campaign_source,'linkedin');assert.equal(config.campaign_name,'lead_football_20261125');assert.equal(config.app_name,'asymptote');assert.equal(config.cookie_domain,'asymptote.fundamatics.com');assert.equal(config.cookie_prefix,'fm_football');assert.equal(config.page_referrer,'https://fundamatics.com/');assert.ok(!JSON.stringify(s.data()).includes('secret'));
 const saved=JSON.parse(s.storage.get(key));assert.equal(saved.expiresAt,startTime+180*DAY);
});
test('repeated consent and duplicate script evaluation cannot duplicate tag or app_open',()=>{
 const s=setup();s.accept();s.preferences();s.accept();s.run();assert.equal(s.scripts().length,1);assert.equal(s.events().filter(c=>c[1]==='app_open').length,1);assert.equal(s.events().filter(c=>c[1]==='page_view').length,1);
});
test('revocation stores rejection, disables tag and reloads; no further interaction is sent',()=>{
 const s=setup();s.accept();s.reject();assert.equal(s.reloads(),1);assert.equal(s.window['ga-disable-G-EYHXB09T96'],true);const before=s.events().length;s.window.footballAnalytics.interaction('solve');assert.equal(s.events().length,before);assert.equal(JSON.parse(s.storage.get(key)).choice,'rejected');const reload=setup({stored:[...s.storage]});assert.equal(reload.scripts().length,0);
});
test('an accepted choice cannot bypass a closed access guard; a genuine later grant enables once',()=>{
 const s=setup({access:false});s.accept();assert.equal(s.scripts().length,0);assert.equal(s.root.dataset.accessGranted,undefined);s.root.dataset.accessGranted='true';s.observers[0].callback();s.observers[0].callback();assert.equal(s.scripts().length,1);assert.equal(s.events().filter(c=>c[1]==='app_open').length,1);
});
test('private token/hash/path/credential/unknown queries are excluded, including a hash removed by the guard',()=>{
 for(const suffix of ['?lang=en&token=secret','#access=secret','private','?email=person@example.com','?consent=accepted']){const s=setup({url:'https://asymptote.fundamatics.com/'+suffix});s.accept();assert.equal(s.scripts().length,0,suffix);}
 const credentials=setup({url:'https://private:secret@asymptote.fundamatics.com/'});credentials.accept();assert.equal(credentials.scripts().length,0);
 const pinned=setup({privateLanding:true});pinned.accept();assert.equal(pinned.scripts().length,0);
});
test('localhost and preview hosts never send live analytics',()=>{
 for(const host of ['localhost:8852','127.0.0.1:8852','preview.example.com','asymptote.fundamatics.com.evil.example']){const s=setup({url:'https://'+host+'/'});s.accept();assert.equal(s.scripts().length,0);}
});
test('explicit QA switches and registered setup campaign never load Google or emit test events',()=>{
 for(const q of ['analytics_test=1','qa_tracking=1','internal_test=1','utm_source=qa&utm_medium=qa','utm_campaign=fundamatics_measurement_qa_20261125']){const s=setup({url:'https://asymptote.fundamatics.com/?lang=en&'+q});s.accept();s.window.footballAnalytics.interaction('solve');assert.equal(s.scripts().length,0,q);assert.equal(s.events().length,0,q);}
});
test('UTM allowlist accepts finite lowercase labels but rejects malformed and personal values',()=>{
 for(const value of ['Uppercase','a b','person@example.com','x'.repeat(101)]){const s=setup({url:'https://asymptote.fundamatics.com/?utm_campaign='+encodeURIComponent(value)});s.accept();assert.equal(s.scripts().length,0,value);}
 const s=setup({url:'https://asymptote.fundamatics.com/index.html?lang=ar&utm_campaign='+ 'x'.repeat(100)});s.accept();assert.equal(s.scripts().length,1);
});
test('opaque Facebook and LinkedIn click identifiers are removed before tag configuration and never forwarded',()=>{
 const s=setup({url:'https://asymptote.fundamatics.com/?'+labels+'&fbclid=opaque_123&li_fat_id=opaque_456'});s.accept();assert.equal(s.scripts().length,1);assert.equal(s.location.searchParams.has('fbclid'),false);assert.equal(s.location.searchParams.has('li_fat_id'),false);assert.ok(!JSON.stringify(s.data()).includes('opaque_'));assert.equal(s.location.searchParams.get('utm_campaign'),'lead_football_20261125');
});
test('button/change/language and keyboard actions emit one bounded event each, without expression contents',()=>{
 const s=setup();s.accept();
 for(const id of ['randomButton','analyzeButton']){const target=new s.Element('button');target.id=id;s.sendDocument('click',target);}
 const rules=new s.Element();rules.className='rule-card';s.sendDocument('click',rules);
 const quiz=new s.Element('input');quiz.id='timedQuiz';s.sendDocument('change',quiz);
 s.sendWindow('footballasymptote:localechange');
 const input=new s.Element('textarea');input.id='funcInput';input.value='PERSONAL_EXPRESSION_SECRET';s.sendDocument('keydown',input,{key:'Enter',ctrlKey:true,repeat:false});s.sendDocument('keydown',input,{key:'Enter',ctrlKey:true,repeat:true});
 const actions=s.events().filter(c=>c[1]==='app_interaction');assert.deepEqual(actions.map(c=>c[2].action),['new_question','solve','rules','self_quiz','language','solve']);assert.ok(!JSON.stringify(s.data()).includes('PERSONAL_EXPRESSION_SECRET'));s.window.footballAnalytics.interaction('arbitrary_value');assert.equal(s.events().filter(c=>c[1]==='app_interaction').length,6);
});
test('storage unavailable permits explicit consent in this document only; finite consent expiry stops subsequent actions',()=>{
 const s=setup({storageFails:true});s.accept();assert.equal(s.scripts().length,1);s.time(startTime+181*DAY);const before=s.events().length;s.window.footballAnalytics.interaction('solve');assert.equal(s.events().length,before);assert.equal(s.window.footballAnalytics.allowed(),false);
});
test('privacy copy follows English/Hebrew/Arabic app language; changing it does not imply consent',()=>{
 const words={en:'Your privacy choices',he:'הבחירות שלך בנושא פרטיות',ar:'خيارات الخصوصية'};
 for(const lang of ['en','he','ar']){const s=setup({lang});assert.equal(s.nodes.find(n=>n.id==='football-analytics-title').textContent,words[lang]);const panel=s.nodes.find(n=>n.className==='football-analytics-panel');assert.equal(panel.dir,lang==='en'?'ltr':'rtl');s.root.lang=lang==='en'?'he':'en';s.sendWindow('footballasymptote:localechange');assert.equal(s.scripts().length,0);}
});
test('unchanged public guard allows tagged access before expiry and blocks automatic access at exact expiry',()=>{
 for(const [now,expected] of [[Date.parse('2026-12-31T21:59:59Z'),true],[Date.parse('2026-12-31T22:00:00Z'),false]]){
  const s=setup({now,access:false});vm.runInContext(guard,s.context);s.accept();assert.equal(s.root.dataset.accessGranted==='true',expected);assert.equal(s.scripts().length,expected?1:0);assert.equal(s.location.searchParams.get('utm_campaign'),'lead_football_20261125');
 }
});
test('language support preserves campaign labels on the public app URL',()=>{
 const s=setup({lang:'ar',url:'https://asymptote.fundamatics.com/?lang=en&'+labels});s.document.readyState='complete';vm.runInContext(langScript,s.context);assert.equal(s.location.searchParams.get('lang'),'ar');assert.equal(s.location.searchParams.get('utm_campaign'),'lead_football_20261125');
});

test('default LinkedIn hyphenated medium and numeric utm_id do not disable consented app measurement',()=>{
 const s=setup({url:'https://asymptote.fundamatics.com/?lang=en&utm_id=909287303&utm_medium=paid-social&utm_source=linkedin'});s.accept();assert.equal(s.scripts().length,1);assert.equal(s.location.searchParams.has('utm_id'),false);const config=s.data().find(c=>c[0]==='config')[2];assert.equal(config.campaign_medium,'paid-social');assert.ok(!JSON.stringify(s.data()).includes('909287303'));
 const bad=setup({url:'https://asymptote.fundamatics.com/?utm_id=private_email'});bad.accept();assert.equal(bad.scripts().length,0);
});
