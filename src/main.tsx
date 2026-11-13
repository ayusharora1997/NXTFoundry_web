import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import './styles.css';
import ReconciliationLab from './recon/App';
import { posts, resources, TOPICS, RESOURCE_KINDS, type Post, type PostKind, type ResourceKind } from './content';
import ToolPreview, { GstrPreview, InvoicePreview, BankPreview, SettlementPreview } from './ToolPreview';
import PhoneField from './PhoneField';
import Consent, { openConsent } from './Consent';
import { faqs } from './faqs';
import { stories, type Story } from './stories';
import { composePhone, DEFAULT_COUNTRY, COUNTRIES } from './countries';

const Icon=({type}:{type:'up'|'right'|'menu'|'x'})=>{const paths={up:<><path d="M5 19 19 5"/><path d="M9 5h10v10"/></>,right:<><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>,menu:<><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></>,x:<><path d="M6 6l12 12"/><path d="M18 6 6 18"/></>};return <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[type]}</svg>};
const ArrowUpRight=({size=17}:{size?:number})=><span style={{display:'inline-flex',transform:`scale(${size/17})`}}><Icon type="up"/></span>;
const ArrowRight=({size=17}:{size?:number})=><span style={{display:'inline-flex',transform:`scale(${size/17})`}}><Icon type="right"/></span>;
const Menu=()=> <Icon type="menu"/>; const X=()=> <Icon type="x"/>;

const CONTACT_EMAIL = 'hello@nxtfoundry.in';
// Enquiries post to our own Vercel function (api/enquiry.ts), which forwards them to the Apps Script backend.
// The offline bundle (built with base './') has no server, so there the form falls back to a prefilled mailto.
const ENQUIRY_ENDPOINT = '/api/enquiry';
// Longest the browser waits: above the function's 30 s maxDuration (vercel.json), so the server always answers first.
const ENQUIRY_TIMEOUT_MS = 35000;
const OFFLINE_BUILD = import.meta.env.BASE_URL === './';
// Static page in public/; the offline bundle has no server, so it links to the live copy.
// 30-minute diagnostic call (Cal.com). Opens in a new tab.
const BOOKING_URL = 'https://cal.com/ayush-arora-ubgsbp/30min';
const PRIVACY_URL = OFFLINE_BUILD ? 'https://www.nxtfoundry.in/privacy.html' : '/privacy.html';
const FAQ_URL = OFFLINE_BUILD ? 'https://www.nxtfoundry.in/faq.html' : '/faq.html';
// Insights is hidden until there is at least one real article. Flip to true to re-enable the homepage strip.
const SHOW_INSIGHTS = false;
// While false, the Insights and Resources pages show a "preparing something" placeholder (nav links stay).
// Flip to true to bring back the full pages; their content is unchanged below.
const INSIGHTS_PAGE_LIVE = false;
const RESOURCES_PAGE_LIVE = false;
const nav = [['What We Do','solutions'],['Products','products'],['Our Approach','approach'],['Insights','insights'],['Resources','resources'],['Stories','stories'],['About','about']];
const focus = ['Operations & Business Performance','Revenue & Financial Control','Procurement & Supply Chain','Inventory & Margin Intelligence'];
const fitSignals = ['An owner-led or professionally managed business in the ₹50 Cr – ₹1,000 Cr revenue range','Growing fast enough that your operating model is straining','Dealing with revenue leakage, control gaps, procurement complexity, or reconciliation debt','Looking for someone who will implement the fix, not just write a deck'];
// Programmes on the What We Do page. No fees are quoted on the site — every CTA asks the visitor to get in touch.
const programmePath = [['Diagnose','diagnostic','Half a day. What’s actually holding the business back.'],['Plan','reset','Reset, 30 days. Root cause found, fix designed.'],['Execute','reset','Reset, 60 days. The same work, plus four weeks putting it in place.'],['Advise','advisory','Monthly. A senior sounding board once it’s running.']];
type Option = {name:string,time:string,sub:string,gets:string[]};
type Programme = {id:string,tag:string,name:string,line:string,meta:[string,string][],fit:string,gets?:string[],options?:Option[],note?:string};
const programmes:Programme[] = [
  {id:'diagnostic',tag:'Start here',name:'The Diagnostic',line:'In half a day, we tell you what is working, what is not, and the one thing to fix first.',meta:[['Duration','Half a day'],['Format','In person or online'],['Output','One written brief']],
    fit:'For an owner who can name what feels wrong — margins slipping, cash stuck in stock, revenue that doesn’t reconcile, execution that keeps slipping — but doesn’t yet know the cause or what to fix first.',
    gets:['A three-hour working session on the one problem you name (two or three shorter sessions if online)','A written diagnostic brief on that problem: what’s working, what isn’t, and why','A one-hour walkthrough of the brief with you','One clear recommendation for what to do first'],
    note:'If the Diagnostic is all you need, that is the whole engagement — no further obligation.'},
  {id:'reset',tag:'Fixed engagement',name:'The Reset',line:'Four weeks to work out what to do. Four more to make sure it happens.',meta:[['Duration','30 or 60 days'],['Format','Weekly on-site visits'],['Output','Fixes in place, not just findings']],
    fit:'For a problem area you can name but haven’t been able to crack. Option 1 designs the fix; Option 2 stays to make sure it happens.',
    options:[
      {name:'Option 1',time:'30 days',sub:'Four weekly visits · your team executes',gets:['Structured discovery of the named problem area — root cause, not symptoms','The gaps costed in rupees, ranked by impact','A designed fix: what to do, who owns it, by when','One page. Plain language. No deck.']},
      {name:'Option 2',time:'60 days',sub:'Eight weekly visits · we stay for execution',gets:['Everything in Option 1, delivered in the first four weeks','Four more weeks in person with your leadership team','Obstacles cleared while they are still small','A weekly review rhythm installed and handed over — your team runs it, not us']}
    ]},
  {id:'advisory',tag:'Monthly retainer',name:'Ongoing Advisory',line:'A senior sounding board in your corner — every month, for as long as it is useful.',meta:[['Duration','Monthly, min. 3 months'],['Format','Regular check-ins + on call'],['Output','A decision partner, not a report']],
    fit:'For founders and leadership teams who want a senior thinking partner on call — before a hire, a price change, a new market, or a vendor renegotiation. Often how the relationship continues after the Reset; also works on its own.',
    gets:['Two sessions a month, agenda set by you — at your office in Bengaluru, online anywhere else in India','WhatsApp access for the decisions that will not wait','A quarterly business review, and one leadership meeting a quarter if useful','No deliverables. This is thinking, not documents']},
  {id:'custom',tag:'Outside the three',name:'Custom Engagement',line:'If what you need doesn’t fit the Diagnostic, Reset or Advisory, we scope it with you directly.',meta:[['Duration','Scoped to fit'],['Format','Agreed with you upfront'],['Output','A fixed scope before we begin']],
    fit:'For situations that don’t map cleanly to a half-day diagnostic, a four-to-eight week reset, or ongoing advisory — a specific project, a one-time review, or something in between.',
    gets:['A scoping conversation to agree the problem and the end point','A written scope, timeline, and fixed fee agreed before any work begins','The same senior-led team and plain-language outputs as every other programme']}
];
const scopeAreas:[string,string,string[]][] = [
  ['01','Operations & Business Performance',['Execution that keeps slipping','Unclear ownership across teams','No weekly review rhythm','KPIs nobody acts on']],
  ['02','Revenue & Financial Control',['Vendor ledgers that don’t match yours','Customer balances that don’t match theirs','GST credit that doesn’t match GSTR-2B','Channel and marketplace deductions','Bank entries that don’t match the statement','Revenue that doesn’t reconcile','Weak approval and control points','A month-end close that drags']],
  ['03','Procurement & Supply Chain',['Invoices checked by hand against POs','Vendor terms nobody enforces','Purchases outside policy','Single-vendor dependence','Freight and landed-cost leakage']],
  ['04','Inventory & Margin',['Cash tied up in slow stock','Margin erosion by product or channel','Stock records that don’t match the floor','Pricing without cost visibility']]
];
// Problems one of our tools answers -> the tool (an id from `suite`). The live one links to the tool itself;
// the ones still "in the kitchen" link to their product preview and show the same status as the product page.
const scopeTools:Record<string,string> = {
  'Vendor ledgers that don’t match yours':'products-vendor',
  'Customer balances that don’t match theirs':'products-customer',
  'GST credit that doesn’t match GSTR-2B':'products-gstr',
  'Channel and marketplace deductions':'products-settlements',
  'Bank entries that don’t match the statement':'products-bank',
  'Invoices checked by hand against POs':'products-invoice',
};
const kitchenNote:Record<Exclude<Kind,'live'>,string> = {cooking:'Tool on the stove',simmer:'Add-on simmering',prep:'Prepping ingredients',menu:'Next on the menu'};
const notDone = ['Run your finance, procurement, or operations team day to day. We build the system and train the people who run it','Produce decks. You get short written documents your team can actually use','Send a junior to do the work after a senior attends the first meeting. The people you meet are the people who do the work','Sell you software you don’t need. The fix comes first; a tool only if it earns its place','Take on work outside our expertise. If we can’t serve the problem well, we tell you upfront — and point you to someone who can'];
const capabilities = [
  ['01','Business Expertise','Understand business processes, operational challenges, financial controls, and opportunities for improvement.'],
  ['02','Execution','Translate insights into practical solutions and work alongside businesses to implement them.'],
  ['03','Technology & Innovation','Build systems, automation, and products that improve efficiency, visibility, and scalability.']
];
const stages = [['01','Understand','Get close to the real operating model, constraints, and opportunity.'],['02','Design','Find the root cause and shape a practical response.'],['03','Execute','Put better processes, controls, and tools into motion.'],['04','Scale','Make what works repeatable, measurable, and ready to grow.']];

function Logo(){return <a className="logo" href="#top" aria-label="NXT Foundry home"><img src="/images/nxt-foundry-logo.png" alt="NXT Foundry" width={1454} height={292}/></a>}
type MenuItem=[string,string,string,string,string?];
function NavMenu({title,items,all,close}:{title:string;items:MenuItem[];all:[string,string];close:()=>void}){return <div className="nav-menu" role="menu" aria-label={title}><span className="nav-menu-title">{title}</span><div className="nav-menu-grid">{items.map(([href,name,tag,line,kind])=><a key={href} href={href} role="menuitem" onClick={close} className={'nav-menu-item'+(kind?' '+kind:'')}><b>{name}</b><small>{line}</small><span className="nav-menu-tag">{kind==='live'&&<i/>}{tag}</span></a>)}</div><a className="nav-menu-all" href={all[0]} onClick={close}>{all[1]} <ArrowRight size={13}/></a></div>}
// Dropdowns: exactly one can be open. Opens on hover or keyboard focus; closes on leaving, on Escape,
// after clicking its heading or an item, and on every page change.
function Header(){const [open,setOpen]=useState(false); const [menu,setMenu]=useState<string|null>(null); const noFocusOpen=React.useRef(false);
React.useEffect(()=>{const f=()=>setMenu(null);window.addEventListener('hashchange',f);return()=>window.removeEventListener('hashchange',f)},[]);
const closeAll=()=>{setOpen(false);setMenu(null)};
const itemProps=(id:string)=>({
  onMouseEnter:()=>setMenu(id),
  onMouseLeave:()=>setMenu(m=>m===id?null:m),
  onFocus:()=>{if(noFocusOpen.current){noFocusOpen.current=false;return}setMenu(id)},
  onBlur:(e:React.FocusEvent<HTMLDivElement>)=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setMenu(m=>m===id?null:m)},
  // Escape closes and returns focus to the heading without reopening it; the flag is cleared straight after,
  // so it can't get stuck when focus was already on the heading.
  onKeyDown:(e:React.KeyboardEvent<HTMLDivElement>)=>{if(e.key==='Escape'){setMenu(null);noFocusOpen.current=true;e.currentTarget.querySelector<HTMLElement>('a')?.focus();setTimeout(()=>{noFocusOpen.current=false},0)}},
});
return <header className="header"><Logo/><nav className={open?'open':''}>{nav.map(([label,id])=>{const dropdown=id==='solutions'?<NavMenu title="Service engagements" all={['#solutions','See all engagements']} items={programmes.map(p=>['#prog-'+p.id,p.name,p.tag,p.line] as MenuItem)} close={closeAll}/>:id==='products'?<NavMenu title="Products" all={['#products','See the product suite']} items={suite.map(([sid,,t,d,k,st])=>['#'+sid,t,st,d,k] as MenuItem)} close={closeAll}/>:null;
  return dropdown?<div className={'nav-item'+(menu===id?' menu-open':'')} key={id} {...itemProps(id)}><a href={'#'+id} onClick={e=>{closeAll();e.currentTarget.blur()}} aria-haspopup="true" aria-expanded={menu===id}>{label}<span className="nav-caret" aria-hidden="true">▾</span></a>{dropdown}</div>:<a href={'#'+id} key={id} onClick={()=>setOpen(false)}>{label}</a>;})}</nav><a className="talk desktop" href={BOOKING_URL} target="_blank" rel="noopener">Book a call <ArrowUpRight size={16}/></a><button className="menu" aria-label="Toggle menu" onClick={()=>setOpen(!open)}>{open?<X/>:<Menu/>}</button></header>}
function ScopeChip({problem}:{problem:string}){const id=scopeTools[problem];const tool=id?suite.find(t=>t[0]===id):undefined;
  if(!tool)return <span>{problem}</span>;
  const [,,name,,kind]=tool;
  if(kind==='live')return <span className="has-tool k-live">{problem}<a className="scope-tool" href="#reconciliation-lab" target="_blank" rel="noopener" aria-label={`${name} is live: view the tool`}><i className="live-dot" aria-hidden="true"/>Live · We’ve a tool for this · View <ArrowUpRight size={12}/></a></span>;
  return <span className={'has-tool k-'+kind}>{problem}<a className="scope-tool" href={'#'+id} title={name} aria-label={`${name}: ${kitchenNote[kind]}. See the preview`}>{kitchenNote[kind]} · Peek</a></span>}
// "Coming soon" page with a little kitchen theatre while we write. Messages rotate; reduced-motion users get the first one, still.
const COMING_LINES:Record<string,string[]> = {
  INSIGHTS:['Sharpening pencils…','Arguing over a headline…','Checking the numbers twice…','Cutting the jargon…','Letting it simmer…','Almost ready to serve…'],
  STORIES:['Finding the plot…','Checking every number in the story…','Cutting the jargon…','Getting the before-and-after right…','Letting it simmer…','Almost ready to tell…'],
  RESOURCES:['Polishing templates…','Testing checklists on real books…','Removing the fluff…','Tidying spreadsheet formulas…','Letting it simmer…','Almost ready to serve…'],
};
function ComingSoon({label,id,title,lede='It will be posted here soon.'}:{label:string,id:string,title?:React.ReactNode,lede?:string}){const lines=COMING_LINES[label]||COMING_LINES.INSIGHTS;const [i,setI]=useState(0);
  React.useEffect(()=>{if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;const t=setInterval(()=>setI(n=>(n+1)%lines.length),2400);return()=>clearInterval(t)},[lines]);
  return <section className="page section coming-soon" id={id}><Label>{label}</Label>
    <h1>{title??<>We’re preparing something <em>for you</em></>}<span className="cs-dots" aria-hidden="true"><i/><i/><i/></span></h1>
    <p className="page-lede">{lede}</p>
    <div className="cs-kitchen" role="status" aria-live="polite"><div className="cs-bar" aria-hidden="true"><span/></div><p className="cs-line" key={i}>{lines[i]}</p></div>
  </section>}
function Label({children}:{children:React.ReactNode}){return <div className="eyebrow"><span className="dot"/>{children}</div>}

function ArrowLink({children,href='#'}:{children:React.ReactNode,href?:string}){return <a className="arrow-link" href={href}>{children}<ArrowUpRight size={17}/></a>}
// Footer products. Only live ones (last field true) are shown; the rest stay listed here for when they launch.
const FOOTER_PRODUCTS:[string,string,string,string,boolean?][] = [
  ['Vendor Payable Reconciliation','#reconciliation-lab','live','Live',true],
  ['Customer Reconciliation','#products-customer','cooking','Cooking'],
  ['GSTR Reconciliation','#products-gstr','simmer','Add-on'],
  ['Invoice Reading & Reconciliation','#products-invoice','prep','In prep'],
  ['Bank Reconciliation','#products-bank','next','Next'],
  ['Payment & Marketplace Settlements','#products-settlements','next','Next'],
];
function Footer(){return <footer><div className="footer-inner">
<div className="footer-top"><div className="footer-brand"><Logo/><p className="footer-copy">A business and technology company building practical solutions for real-world complexity.</p></div>
<div className="footer-cta"><div><p className="footer-cta-title">Start with a conversation</p><p className="footer-cta-line">We reply within 1 business day · <a className="footer-mail" href={'mailto:'+CONTACT_EMAIL}>{CONTACT_EMAIL}</a></p></div><div className="footer-cta-actions"><a className="button" href={BOOKING_URL} target="_blank" rel="noopener">Book a 30-min call <ArrowUpRight size={14}/></a><a className="footer-ghost" href="#contact-form">Request a proposal</a></div></div></div>
<div className="footer-main">
<div className="footer-col"><span className="footer-label">Explore</span>{nav.filter(([,id])=>id!=='about'&&id!=='products').map(([l,id])=><a href={'#'+id} key={id}>{l}</a>)}</div>
<div className="footer-col footer-products"><span className="footer-label">Products <a className="footer-more" href="#products">All <ArrowRight size={12}/></a></span><div className="fp-grid">{FOOTER_PRODUCTS.filter(p=>p[4]).map(([name,href,,,live])=><a key={href} href={href} {...(live?{target:'_blank',rel:'noopener'}:{})}>{name}<em className={live?'fp-live':'fp-wip'}>{live?'Live':'In progress'}</em></a>)}</div></div>
<div className="footer-col"><span className="footer-label">Company</span><a href="#about">About</a><a href={FAQ_URL}>FAQ</a><a href="#contact">Contact</a></div>
<div className="footer-col"><span className="footer-label">Legal</span><a href={PRIVACY_URL}>Privacy Policy</a>{!OFFLINE_BUILD&&<button type="button" className="footer-cookie" onClick={openConsent}>Cookie settings</button>}</div>
</div>
<div className="footer-bottom"><span>© 2026 NXT Foundry. Built around problems. Driven by possibilities.</span><span className="made-in">Made with <i className="heart" aria-label="love">♥</i> in <b lang="kn">ನಮ್ಮ</b> <span className="made-tr">(Namma)</span> Bengaluru, for the world</span></div>
</div></footer>}

// Stories (#stories): question-first tiles, one per entry in src/stories.ts; the first gets the large tile.
// Each story opens at #stories/<id>: a chaptered read (chapter menu on the left) with an optional
// "Where it broke" chapter that follows one case step by step. **text** is highlighted.
const rich=(t:string)=>t.split(/\*\*(.+?)\*\*/g).map((x,i)=>i%2?<strong key={i}>{x}</strong>:x);
const richQ=(t:string)=>t.split(/\*\*(.+?)\*\*/g).map((x,i)=>i%2?<em key={i}>{x}</em>:x);
const storyText=(t:string)=>t.replace(/\*\*/g,'');
function StoryTags({s}:{s:Story}){return <div className="story-tags">{s.earlier&&<span className="chip-tag">EW</span>}{s.earlier&&' '}{s.areas.map(a=><span className="chip-tag area" key={a}>{a}</span>)}</div>}
function Stories(){const [area,setArea]=useState('All');
  const areas=['All',...Array.from(new Set(stories.flatMap(s=>s.areas)))];
  const list=area==='All'?stories:stories.filter(s=>s.areas.includes(area));
  return <section className="page section stories-page" id="stories-page"><Label>STORIES</Label><h1>Every story starts <em>with a question.</em></h1>
    <p className="page-lede">Real problems, what we found and what changed.</p>
    {stories.length>=4&&<div className="filter-row story-filters">{areas.map(x=><button type="button" className={area===x?'active':''} aria-pressed={area===x} onClick={()=>setArea(x)} key={x}>{x}</button>)}</div>}
    <div className={'story-tiles'+(list.length===1?' single':'')}>{list.map((s,i)=>{const r=s.stats[s.stats.length-1];
      return <a className={'story-tile'+(i===0?' lead':'')} href={'#stories/'+s.id} key={s.id}><StoryTags s={s}/>
        <p className="story-q">{richQ(s.question)}</p>{i===0&&<p className="story-hook">{s.hook}</p>}
        <div className="story-ans"><span>What changed</span><p className="story-did">{s.did}</p>{r&&<div className="story-res"><b>{r.value}</b><p>{r.label}</p></div>}</div>
        <span className="story-read">Read the story <ArrowRight size={14}/></span></a>})}
      {list.length<3&&<div className="story-tile soon" aria-hidden="true"><p className="story-q">More stories are being written.</p><div className="story-ans"><p>New ones are added here as clients agree to share them.</p></div></div>}
    </div>
  </section>}
function StoryPage({s}:{s:Story}){
  const chapters:[string,string][]=[['problem','The problem'],...(s.journey?[['journey','Where it broke'] as [string,string]]:[]),['what','What we did'],['outcome','The outcome']];
  const [active,setActive]=useState('problem');
  React.useEffect(()=>{if(typeof IntersectionObserver==='undefined')return;const io=new IntersectionObserver(es=>{es.forEach(e=>{if(e.isIntersecting)setActive(e.target.id.replace('ch-',''))})},{rootMargin:'-30% 0px -60% 0px'});chapters.forEach(([id])=>{const el=document.getElementById('ch-'+id);if(el)io.observe(el)});return()=>io.disconnect()},[s.id]);
  const go=(id:string)=>document.getElementById('ch-'+id)?.scrollIntoView({behavior:'smooth',block:'start'});
  const first=s.stats[0], last=s.stats[s.stats.length-1];
  return <article className="page section story-page" id="story-page">
    <a className="story-back" href="#stories"><span aria-hidden="true">←</span> All stories</a>
    <StoryTags s={s}/><h1>{s.title}</h1>
    <div className="story-layout">
      <nav className="story-rail" aria-label="Chapters">{chapters.map(([id,label],i)=><button type="button" key={id} className={active===id?'on':''} aria-current={active===id?'true':undefined} onClick={()=>go(id)}><small>{String(i+1).padStart(2,'0')}</small>{label}</button>)}</nav>
      <div className="story-chapters">
        <section className="story-ch" id="ch-problem"><h2>01 · The problem</h2><p>{rich(s.problem[0])}</p>
          {first&&<div className="story-pull"><b>{first.value}</b> <span>{first.label}</span></div>}
          {s.problem.slice(1).map((p,i)=><p key={i}>{rich(p)}</p>)}</section>
        {s.journey&&<section className="story-ch" id="ch-journey"><h2>02 · Where it broke</h2><p className="story-jt">{s.journey.title}</p>
          <div className="story-legend"><span><i className="bad"/>Where it broke</span><span><i className="good"/>What we put in place</span></div>
          <ol className="story-steps">{s.journey.steps.map((st,i)=><li key={i} className={st.fix?'broke':''}><h3>{i+1} · {st.title}</h3><p>{st.text}</p>{st.fix&&<div className="story-fix"><b>Fix</b> {st.fix}</div>}</li>)}</ol></section>}
        <section className="story-ch" id="ch-what"><h2>{s.journey?'03':'02'} · What we did</h2>{s.whatWeDid.map((p,i)=><p key={i}>{rich(p)}</p>)}</section>
        <section className="story-ch" id="ch-outcome"><h2>{s.journey?'04':'03'} · The outcome</h2>
          {last&&last!==first&&<div className="story-pull"><b>{last.value}</b> <span>{last.label}</span></div>}
          {s.outcome.map((p,i)=><p key={i}>{rich(p)}</p>)}
          <p className="story-meta">{s.meta}</p>{s.note&&<p className="story-note">{s.note}</p>}
        </section>
        <div className="story-cta"><p>Have a problem that sounds familiar?</p><a className="button" href={BOOKING_URL} target="_blank" rel="noopener">Book a 30-min call <ArrowUpRight size={15}/></a></div>
      </div>
    </div>
  </article>}
function Home(){return <><section className="hero" id="top"><div className="hero-copy"><Label>BUSINESS / TECHNOLOGY / INNOVATION</Label><h1>We solve real business problems and build <em>what comes next.</em></h1><p>We combine domain expertise, hands-on execution, and innovation to improve how businesses operate, grow, and make decisions.</p><div className="hero-actions"><a className="button" href={BOOKING_URL} target="_blank" rel="noopener">Book a 30-min diagnostic <ArrowRight size={17}/></a><a className="text-link" href="#approach">Our approach <ArrowUpRight size={16}/></a></div><p className="cta-note">No sales pitch. Bring a problem; leave with a view on it.</p></div><div className="hero-image"><img src="/images/hero-operations-v2.png" alt="Dark industrial operations interior"/><div className="hero-caption">01 / FOUNDATIONS FOR WHAT’S NEXT</div></div></section><section className="intro section"><div className="split"><div><Label>01 — WHAT WE DO</Label><h2>Good ideas matter.<br/><em>Good execution</em> changes things.</h2></div><div className="intro-copy"><p className="large">NXT Foundry brings together the commercial, operational, and technical thinking needed to move from a business problem to a solution that works in the real world.</p><ArrowLink href="#solutions">Explore our capabilities</ArrowLink></div></div><div className="cap-grid">{capabilities.map(([n,t,d])=><div className="cap" key={n}><span className="num">{n}</span><h3>{t}</h3><p>{d}</p></div>)}</div></section><section className="focus section" id="focus"><div className="split"><div><Label>02 — AREAS OF FOCUS</Label><h2>Where business meets <em>possibility.</em></h2></div><div className="intro-copy"><p>We start where the friction is. These are the business areas we focus on — our advisory, execution, and technology services are applied to each of them.</p><ArrowLink href="#solutions">See how we help</ArrowLink></div></div><div className="focus-list">{focus.map((x,i)=><a className="focus-row" href="#solutions" key={x}><span>0{i+1}</span><h3>{x}</h3><ArrowUpRight size={19}/></a>)}</div></section><section className="process section" id="impact"><div className="process-head"><Label>03 — HOW WE CREATE IMPACT</Label><h2>Understand → Design → Execute → <em>Scale.</em></h2></div><div className="stage-grid">{stages.map(([n,t,d])=><div className="stage" key={n}><span className="num">{n}</span><h3>{t}</h3><p>{d}</p></div>)}</div></section>{SHOW_INSIGHTS&&<section className="insight-strip section" id="thinking"><div><Label>04 — OUR THINKING</Label><h2>Ideas for building <em>better businesses.</em></h2><p className="section-note">Short, useful thinking on operations, controls, technology, and the work of building a company.</p></div><div className="insight-grid">{['Business operations','Finance & controls','Technology & innovation'].map((x,i)=><div className="insight-placeholder" key={x}><span>0{i+1} / {x}</span><h3>Article coming soon.</h3><ArrowLink href="#insights">Read the note</ArrowLink></div>)}</div></section>}<section className="help section"><Label>{SHOW_INSIGHTS?'05':'04'} — WHO WE ARE BUILT TO HELP</Label><div className="help-grid"><h2>For businesses where growth has made the operating model harder to see.</h2><div><p className="fit-label">We’re a good fit if you’re:</p><ul className="fit-list">{fitSignals.map(x=><li key={x}>{x}</li>)}</ul></div></div></section><CTA/></>}
// Pages are hash routes, so in-page jumps scroll directly instead of changing the hash.
const jump=(id:string)=>(e:React.MouseEvent)=>{e.preventDefault(); document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'})};
const Ticks=({items}:{items:string[]})=><ul className="prog-list">{items.map(g=><li key={g}>{g}</li>)}</ul>;
// Five fixed slots (head, meta, fit, content, foot) so cards side by side line up row for row via subgrid.
function ProgrammeCard({p}:{p:Programme}){return <article className="prog-card" id={'prog-'+p.id}><div className="prog-head"><span className="prog-tag">{p.tag}</span><h3>{p.name}</h3><p className="prog-line">{p.line}</p></div><dl className="prog-meta">{p.meta.map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl><p className="prog-fit">{p.fit}</p><div className="prog-content">{p.gets&&<><span className="engagement-label">What you get</span><Ticks items={p.gets}/></>}{p.options&&<div className="prog-options">{p.options.map(o=><div className="prog-option" key={o.name}><span className="prog-tag">{o.name}</span><h4>{o.time}</h4><p className="prog-sub">{o.sub}</p><Ticks items={o.gets}/></div>)}</div>}</div><div className="prog-foot">{p.note&&<p className="prog-note">{p.note}</p>}<a className="button prog-cta" href="#contact-form">{p.id==='custom'?'Tell us what you need':'Get in touch'} <ArrowRight size={17}/></a></div></article>}
function FAQ(){const [open,setOpen]=useState<number|null>(null); return <div className="faq">{faqs.map(([q,a],i)=>{const on=open===i; return <div className={'faq-item'+(on?' open':'')} key={q}><h3><button className="faq-q" id={'faq-q-'+i} aria-expanded={on} aria-controls={'faq-a-'+i} onClick={()=>setOpen(on?null:i)}><span>{q}</span><i aria-hidden="true"/></button></h3><div className="faq-a" id={'faq-a-'+i} role="region" aria-labelledby={'faq-q-'+i} hidden={!on}><p>{a}</p></div></div>})}</div>}
function Solutions(){return <section className="page section" id="solutions-page"><Label>WHAT WE DO</Label><h1>Management consulting for <em>growing businesses.</em></h1><p className="page-lede">Fixed-scope consulting and advisory programmes for owner-led and professionally managed businesses. Senior-led — the people you meet are the people who do the work. Based in Bengaluru, working across India.</p><figure className="page-figure"><img src="/images/diagnostic-whiteboard-v2.png" alt="Dark planning wall with process markers"/></figure>
<div className="prog-path-band"><Label>HOW THE PROGRAMMES FIT TOGETHER</Label><ol className="prog-path">{programmePath.map(([t,id,d],i)=><li key={t}><a href={'#prog-'+id} onClick={jump('prog-'+id)}><span className="num">0{i+1}</span><h3>{t}</h3><p>{d}</p></a></li>)}</ol><p className="prog-path-note">Most clients move through in that order. You can stop at any point. <a href="#prog-custom" onClick={jump('prog-custom')}>Or a custom engagement</a> — if what you need doesn’t fit this sequence, we scope it with you before we begin.</p></div>
<div className="prog-list-wrap">{programmes.map(p=><ProgrammeCard p={p} key={p.id}/>)}</div>
<div className="scope-band"><Label>WHERE WE WORK</Label><h2>The problems we are <em>brought in for.</em></h2><div className="scope-list">{scopeAreas.map(([n,t,items])=><div className="scope-row" key={n}><span className="scope-num">{n}</span><div><h3>{t}</h3><div className="scope-items">{items.map(x=><ScopeChip key={x} problem={x}/>)}</div></div></div>)}</div></div>
<div className="terms-band"><div><Label>HOW THE MONEY WORKS</Label><h2>One scope. <em>One agreed fee.</em></h2><p>Every programme is fixed-fee, agreed in writing before we start. No hourly billing, no scope creep, no surprise invoice at the end.</p><p>If you stop after the Diagnostic, that’s the whole engagement — no further obligation, no upsell conversation.</p></div><div><Label>WHAT WE DON’T DO</Label><ul className="dont-list">{notDone.map(x=><li key={x}>{x}</li>)}</ul></div></div>
<div className="faq-band"><div><Label>COMMON QUESTIONS</Label><h2>Fees and <em>duration.</em></h2></div><FAQ/></div>
<div className="lead-band"><div><Label>START HERE</Label><h2>Start with <em>half a day.</em></h2><p>Most clients begin with the Diagnostic. If that’s all you need, that is perfectly fine too.</p></div><div className="lead-action"><a className="button" href="#contact-form">Schedule an introductory call <ArrowUpRight size={17}/></a><p>A first conversation, not the Diagnostic. We’ll hear the situation and tell you honestly whether we can help.</p></div></div></section>}
// Products: one interactive showcase. Pick a product on the left; the stage shows its one-line pitch and its live animation.
// Vendor recon is live; the others share its engine and are at different stages "in the kitchen".
type Kind='live'|'cooking'|'simmer'|'prep'|'menu';
const suite: [string, string, string, string, Kind, string][] = [
  ['products-vendor', '01', 'Vendor Payable Reconciliation', 'Your payables, checked against every vendor’s own books.', 'live', 'Live · go break it'],
  ['products-customer', '02', 'Customer Reconciliation', 'The same check from the seller’s chair: your receivables against each customer’s books.', 'cooking', 'On the stove'],
  ['products-gstr', '03', 'GSTR Reconciliation', 'Your books against GSTR-1 and GSTR-2B, plugged into both reconciliations.', 'simmer', 'Add-on · simmering'],
  ['products-invoice', '04', 'Invoice Reading & Reconciliation', 'Reads any invoice, then checks it against PO, goods receipt and ledger.', 'prep', 'Prepping ingredients'],
  ['products-bank', '05', 'Bank Reconciliation', 'Your bank statement against your books, line by line.', 'menu', 'On the menu · next'],
  ['products-settlements', '06', 'Payment & Marketplace Settlements', 'Every payout broken back into orders, fees, refunds and taxes.', 'menu', 'On the menu · next'],
];
const SHOW: Record<string,{short:string;points:string[];preview:React.ReactNode;cta:[string,string]}> = {
  'products-vendor': {short:'Vendor recon',points:['Any ledger format','Opening balance checked first','Statement the vendor signs'],preview:<ToolPreview/>,cta:['Open the live tool','#reconciliation-lab']},
  'products-customer': {short:'Customer recon',points:['Same engine, ledger flipped','Short payments surfaced','Customer signs off'],preview:<ToolPreview mode="customer"/>,cta:['Get first taste','#contact']},
  'products-gstr': {short:'GSTR recon',points:['ITC at risk flagged','Late filers listed','Add-on to both recons'],preview:<GstrPreview/>,cta:['Tell us your GST headache','#contact']},
  'products-invoice': {short:'Invoice reading',points:['PDF, scan or email','PO · receipt · invoice match','Feeds every recon'],preview:<InvoicePreview/>,cta:['Send us your messiest invoice','#contact']},
  'products-bank': {short:'Bank recon',points:['UTR + amount matching','Bank charges proposed','Unknown credits flagged'],preview:<BankPreview/>,cta:['Tell us how many banks','#contact']},
  'products-settlements': {short:'Settlements',points:['Payout = bank, proven','Fee rates checked','Claims for short pay'],preview:<SettlementPreview/>,cta:['Tell us where you sell','#contact']},
};
const Steam=()=> <span className="steam" aria-hidden="true"><i/><i/><i/></span>;
const Status=({kind,children}:{kind:Kind;children:React.ReactNode})=> <span className={'ps-status '+kind}>{kind==='live'?<i className="dot"/>:<Steam/>}{children}</span>;
const ROTATE_MS=9000; const durOf=(id:string)=>id==='products-vendor'||id==='products-customer'?14000:ROTATE_MS;
// What changes for a finance team, per product. Follows the product selected in the showcase above.
// The ~% figures are indicative estimates, labelled as such on the page; replace them with measured results once clients report them.
type Fact=[string,number|null,string,string,string]; // prefix, number to count up to (null = show prefix as text), suffix, label, small print
const GAINS:Record<string,{head:[string,string];rows:[string,string][];facts:Fact[]}>={
  'products-vendor':{head:['Less chasing.','More closing.'],rows:[['Chasing vendors for statements over email','Vendors upload in any format; AI reads and maps it'],['Ticking two ledgers line by line in Excel','AI and rule-based matching across invoices, credit notes, payments and TDS'],['A difference nobody can explain at year-end','Every rupee of the gap traced to the entries behind it'],['“Did they agree?” lost in a mail thread','The vendor signs off on the statement itself']],
    facts:[['~',75,'%','less time on vendor recon','compared with manual Excel matching'],['~',60,'%','lower reconciliation cost','fewer hours, fewer follow-ups'],['ML',null,'','assisted matching','learns your vendors’ numbering patterns'],['',100,'%','backtraced and logged','every match, reversal and sign-off']]},
  'products-customer':{head:['Less chasing.','More cash.'],rows:[['Asking customers for their payable ledger','Customers upload in any format; AI reads and maps it'],['Short payments buried in lump-sum receipts','Deductions and short pays surfaced item by item'],['Unapplied cash sitting for months','Receipts matched to invoices automatically'],['Balance confirmations chased over email','The customer signs off on the statement itself']],
    facts:[['~',70,'%','less time on customer recon','compared with manual matching'],['~',55,'%','lower reconciliation cost','fewer hours, faster disputes'],['ML',null,'','assisted matching','pairs receipts with the right invoices'],['',100,'%','backtraced and logged','every match, deduction and sign-off']]},
  'products-gstr':{head:['Less guessing.','More credit.'],rows:[['Downloading GSTR-2B and running VLOOKUPs','2B matched to your purchase register invoice by invoice'],['Input credit lost to suppliers who never filed','Credit at risk flagged, with the supplier to chase'],['Mismatches found at the annual return','Mismatches found every month'],['Sales register checked against GSTR-1 by hand','Books against GSTR-1, automatically']],
    facts:[['~',80,'%','less time on GST recon','compared with spreadsheet matching'],['~',60,'%','lower compliance effort','fewer manual checks each month'],['AI',null,'','fuzzy matching','on GSTIN, invoice number and value'],['',100,'%','backtraced and logged','every match back to the return line']]},
  'products-invoice':{head:['Less typing.','More checking.'],rows:[['Typing every invoice into the ERP','AI reads PDFs, scans, photos and email attachments'],['Three-way match done by eye','PO, goods receipt and invoice matched automatically'],['Duplicate invoices slipping through','Duplicates caught before anything is booked'],['Approvals over WhatsApp','Routed, approved and logged in one place']],
    facts:[['~',85,'%','less data-entry time','compared with manual keying'],['~',50,'%','lower processing cost','per invoice, end to end'],['AI',null,'','field extraction','with a confidence score on every field'],['',100,'%','backtraced and logged','every field linked to the source document']]},
  'products-bank':{head:['Less ticking.','More knowing.'],rows:[['Ticking the bank statement line by line','Matched by UTR, amount and date automatically'],['Bank charges found at month-end','Proposed as entries the day they appear'],['Unknown credits parked in suspense','The most likely payer suggested'],['Bank recon once a month','Bank recon every day']],
    facts:[['~',80,'%','less time on bank recon','compared with manual ticking'],['~',60,'%','lower reconciliation cost','across all your accounts'],['ML',null,'','payer suggestions','learns who usually pays what'],['',100,'%','backtraced and logged','every line, match and entry']]},
  'products-settlements':{head:['Less trusting.','More tracing.'],rows:[['Accepting the payout total as it comes','Every payout broken down to order level'],['Fees never checked against the contract','Commission, shipping and fees checked against agreed rates'],['Short settlements nobody notices','A claim list drafted automatically'],['One spreadsheet per marketplace','One view across gateways and marketplaces']],
    facts:[['~',75,'%','less time on settlements','compared with spreadsheet work'],['~',65,'%','lower reconciliation cost','per payout cycle'],['ML',null,'','order matching','maps platform IDs to your orders'],['',100,'%','backtraced and logged','every order, fee and claim']]},
};
function CountUp({to}:{to:number}){const ref=React.useRef<HTMLSpanElement>(null);const [n,setN]=useState(to);
  React.useEffect(()=>{if(!to||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;setN(0);let raf=0;const io=new IntersectionObserver(([e])=>{if(!e.isIntersecting)return;io.disconnect();const t0=performance.now();const step=(t:number)=>{const k=Math.min(1,(t-t0)/1100);setN(Math.round(to*(1-Math.pow(1-k,3))));if(k<1)raf=requestAnimationFrame(step)};raf=requestAnimationFrame(step)});if(ref.current)io.observe(ref.current);return()=>{io.disconnect();cancelAnimationFrame(raf)}},[to]);
  return <span ref={ref}>{n}</span>}
function Gains({id}:{id:string}){const g=GAINS[id];const p=suite.find(s=>s[0]===id)!;
  return <div className="px-gains" aria-live="polite"><div className="px-gains-h"><Label>WHAT CHANGES</Label><h2>{g.head[0]} <em>{g.head[1]}</em></h2><span className={'px-for '+p[4]}>{p[2]}</span></div>
  <ul className="px-swap">{g.rows.map(([was,now])=><li key={was}><s>{was}</s><span className="px-swap-arrow" aria-hidden="true">→</span><b>{now}</b></li>)}</ul>
  <div className="px-facts">{g.facts.map(([pre,n,suf,t,x])=><div key={t}><b>{n===null?pre:<>{pre}<CountUp to={n}/>{suf}</>}</b><span>{t}</span><small>{x}</small></div>)}</div>
  <p className="px-note">~ Indicative estimates for a typical mid-sized finance team, not a guarantee. Actual savings depend on volumes and data quality.</p></div>}
// Closing block on the Products page: pick the tools you want sooner; the choice is carried into the contact form.
function EarlyAccess(){const soon=suite.filter(s=>s[4]!=='live');const [want,setWant]=useState<string[]>([]);
  const go=()=>{try{sessionStorage.setItem('nxt-interest',JSON.stringify(want.map(id=>suite.find(s=>s[0]===id)![2])))}catch{/* prefill is optional */}};
  return <div className="px-early"><div className="px-early-copy"><Label>EARLY ACCESS</Label><h2>Want one of these <em>sooner?</em></h2><p>Pick the ones you need. The most requested tool goes on the stove next, and you hear first when it is ready.</p></div>
  <div className="px-early-pick"><div className="px-early-chips" role="group" aria-label="Tools you want sooner">{soon.map(([id,,t,,k])=>{const on=want.includes(id);return <button key={id} type="button" aria-pressed={on} className={'px-want '+k+(on?' on':'')} onClick={()=>setWant(on?want.filter(x=>x!==id):[...want,id])}><i aria-hidden="true">{on?'✓':'+'}</i>{t}</button>})}</div>
    <a className="button px-early-btn" href="#contact" onClick={go}>{want.length?`Ask for ${want.length===1?'this one':`these ${want.length}`}`:'Talk to us'} <ArrowUpRight size={16}/></a></div></div>}
function Products(){
  const fromHash=()=>{const h=window.location.hash.slice(1);return suite.some(s=>s[0]===h)?h:'products-vendor'};
  const [sel,setSel]=useState(fromHash); const [auto]=useState(()=>!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const [tick,setTick]=useState(0);
  React.useEffect(()=>{const f=()=>{if(window.location.hash.startsWith('#products-')){setSel(fromHash());setTick(0);}};window.addEventListener('hashchange',f);return()=>window.removeEventListener('hashchange',f)},[]);
  // Auto-advance through the products all the time. Picking one jumps there and the rotation carries on from it.
  React.useEffect(()=>{if(!auto)return;const start=Date.now()-tick;const id=setInterval(()=>{const e=Date.now()-start;if(e>=durOf(sel)){setTick(0);setSel(s=>suite[(suite.findIndex(x=>x[0]===s)+1)%suite.length][0]);}else setTick(e);},100);return()=>clearInterval(id)},[auto,sel]);
  const pick=(id:string)=>{setSel(id);setTick(0)};
  // On phones the product list scrolls sideways; keep the selected product in view without moving the page.
  React.useEffect(()=>{const r=document.querySelector('.px-rail') as HTMLElement|null;const t=document.getElementById(sel);if(r&&t&&r.scrollWidth>r.clientWidth)r.scrollTo({left:t.offsetLeft-12,behavior:'smooth'})},[sel]);
  const cur=suite.find(s=>s[0]===sel)!; const d=SHOW[sel]; const live=cur[4]==='live';
  return <section className="page section px" id="products"><Label>PRODUCTS & PLATFORMS</Label><h1>Every number you share with someone else, <em>checked.</em></h1><p className="page-lede">Six tools, one engine. One is live today; the rest are in the kitchen.</p>
  <div className="px-show" id="products-suite">
    <div className="px-rail" role="tablist" aria-label="Products">{suite.map(([id,n,t,,k,st])=>{const on=id===sel;return <button key={id} role="tab" id={id} aria-selected={on} aria-controls="px-stage" className={'px-tab '+k+(on?' on':'')} onClick={()=>pick(id)}>
      <span className="px-n">{n}</span><span className="px-t"><b>{t}</b><Status kind={k}>{st}</Status></span>{on&&auto&&<i className="px-prog" style={{width:`${(tick/durOf(id))*100}%`}}/>}</button>})}</div>
    <div className="px-stage" id="px-stage" role="tabpanel" aria-labelledby={sel} key={sel}>
      <div className="px-info"><Status kind={cur[4]}>{cur[5]}</Status><h2>{cur[2]}</h2><p>{cur[3]}</p>{live&&<p className="px-ai"><span className="px-ai-badge"><span aria-hidden="true">✦</span> AI sous-chef: in training</span>Learning to read PDFs, explain gaps and suggest matches. Joining the kitchen in the next batch.</p>}
        <ul className="px-points">{d.points.map(x=><li key={x}>{x}</li>)}</ul>
        <a className={'button '+(live?'':'ghost-btn')} href={d.cta[1]} {...(live?{target:'_blank',rel:'noopener'}:{})}>{d.cta[0]} <ArrowUpRight size={16}/></a>{live?<small className="pv-note">Synthetic data · no sign-up</small>:<small className="pv-note">Not live yet · shares the vendor engine</small>}</div>
      {live?<a className="px-visual" href="#reconciliation-lab" target="_blank" rel="noopener" aria-label="Open the live tool (opens in a new tab)">{d.preview}</a>:<div className="px-visual soon">{d.preview}<span className="ps-tape">{cur[4]==='menu'?'Next on the menu':'Something’s cooking'}</span></div>}
    </div>
  </div>
  <div className="px-flow" aria-label="How the products fit together"><span className="px-flow-l">How they fit</span>
    {[[['products-invoice']],[['products-vendor'],['products-customer']],[['products-gstr'],['products-bank'],['products-settlements']]].map((grp,i)=><React.Fragment key={i}>{i>0&&<span className="px-arrow">→</span>}<span className="px-grp">{grp.map(([id])=><button key={id} className={'px-chip '+(suite.find(s=>s[0]===id)![4])+(id===sel?' on':'')} onClick={()=>{pick(id);document.getElementById('products-suite')?.scrollIntoView({behavior:'smooth',block:'start'})}}>{SHOW[id].short}</button>)}</span></React.Fragment>)}
    <span className="px-arrow">→</span><span className="px-end">One statement, signed off</span></div>
  <Gains id={sel} key={sel}/>
  <EarlyAccess/>
  </section>}
// Our Approach page. Written in "we"; no names and no fees anywhere.
const gapSigns = ['Revenue is growing, but nobody can say with confidence what was earned versus what was actually received','Month-end takes longer every quarter, and the numbers still get argued over','Purchases, discounts, and credit notes get approved by whoever happens to be available','Stock on the system doesn’t match stock on the floor, and margin drifts without a clear reason','The same problem has been “fixed” twice already — and it’s back'];
const processSteps = [
  ['01','Introductory call','A conversation about the business, the problem, and whether we are the right people for it. No pitch. If we’re not the right fit, we say so on the call — and point you to someone who is.'],
  ['02','Diagnostic','A structured working session on the one problem you name. We trace it to the actual constraint — process, control, data, or ownership — not the symptom that brought you to us.'],
  ['03','Fix, on site','Weekly visits to the floor, the finance team, the warehouse — wherever the problem lives. The fix is designed with the people who will run it, then put in place alongside them.'],
  ['04','Review and hand over','We track outcomes, not activity. A weekly review rhythm is installed, owned by your team, and still running after we leave. That’s the test.']
];
const diagnosticCovers = ['Where the money actually leaks — revenue, deductions, purchasing, stock, or all four','Which controls exist on paper and which ones actually operate','Who owns what, and where accountability quietly falls between two people','The one change that, if made first, makes everything after it easier'];
const workingTerms = [
  ['Scope','Agreed first','A written problem, scope, and end point before any work starts. If the scope needs to change, we agree that in writing too.'],
  ['Cadence','Weekly, on site','Regular enough to keep momentum. Spaced so your team has time to do the work between visits.'],
  ['Fees','Fixed, never hourly','One agreed fee per engagement. No hourly billing, no scope creep, no surprise invoice at the end.'],
  ['Independence','Vendor-neutral','We don’t resell software. If a tool helps, we say so; if a spreadsheet and a discipline will do, we say that instead.'],
  ['Location','Bengaluru-first','In person wherever the problem allows. Online works well for diagnostics and ongoing advisory across India.'],
  ['Capacity','A few clients at a time','Depth needs focus. We take on a small number of engagements at once, and we’ll tell you when we’re full.']
];
const notFor = ['Businesses looking for a report to justify a decision that has already been made','Owners who want us to run a function permanently rather than build one that runs without us','Teams unwilling to do the implementation work between visits — we work alongside you, not instead of you','Pre-revenue or idea-stage startups — an accelerator will serve that stage far better than we can'];
const outcomes = [
  ['Clarity on the real constraint','Most businesses are solving the wrong problem. After the Diagnostic, you know exactly where the constraint is — and what to do about it first.'],
  ['Revenue you can reconcile','What was earned, what was received, and why they differ — visible every month, not reconstructed at year-end.'],
  ['Controls that actually operate','Approvals, limits, and checks that work in practice — not a policy document nobody has opened since it was written.'],
  ['An operating rhythm that holds','A weekly review your team runs without being chased. Numbers that are current, decisions that are recorded.'],
  ['Decisions tested before they’re made','A senior second opinion on the calls that matter — a price change, a vendor switch, a new channel, a senior hire.'],
  ['Documentation your team owns','Short, plain-language process notes and checklists. Written for the people who use them, not for a filing cabinet.']
];
function Approach(){return <section className="page section" id="approach-page"><Label>OUR APPROACH</Label><h1>The recommendation is the easy part. <em>The fix is the work.</em></h1><p className="page-lede">We work inside the business — on the floor, with the finance team, in the warehouse — until the fix is in place and your people are running it. Senior-led, from the first conversation to the last review.</p><figure className="page-figure"><img src="/images/workshop-floor-v2.png" alt="Working fabrication workshop with tools and metal surfaces"/></figure>
<div className="ap-problem"><div><Label>THE GAP</Label><h2>Most advice stops at the recommendation.</h2><img className="side-img" src="/images/finance-control-v2.png" alt="Hands reviewing unbranded papers at a dark desk" loading="lazy"/></div><div className="ap-prose"><p>Growing businesses don’t lack advice. Auditors tell you what went wrong last year. Software vendors tell you their product will fix it. Large firms send a team, produce a report, and leave.</p><p>What’s harder to find is someone who stays for the unglamorous part — tracing the leak to its source, redesigning the approval that keeps failing, sitting with the team until the new way of working becomes the normal one.</p><p>That gap is where most operating problems survive. It’s the gap we were built to close.</p></div></div>
<div className="ap-signs"><div><Label>SOUND FAMILIAR?</Label><h3>The signs we usually hear about first.</h3></div><ul className="fit-list">{gapSigns.map(x=><li key={x}>{x}</li>)}</ul></div>
<blockquote className="ap-quote"><p>“The hardest stretch isn’t starting up. It’s the one where the business has outgrown the owner’s memory, but the systems to replace it haven’t been built yet.”</p><cite>— How we think about the work</cite></blockquote>
<div className="ap-process"><Label>THE PROCESS</Label><h2>Four steps. <em>One team throughout.</em></h2><div className="approach-list">{processSteps.map(([n,t,d])=><div className="approach-row" key={n}><span>{n}</span><h2>{t}</h2><p>{d}</p></div>)}</div><div className="ap-covers"><span className="engagement-label">What the Diagnostic actually covers</span><ul className="prog-list">{diagnosticCovers.map(x=><li key={x}>{x}</li>)}</ul></div></div>
<div className="ap-terms"><Label>HOW WE WORK WITH YOU</Label><h2>Structured for outcomes, <em>not hours.</em></h2><div className="ap-terms-grid">{workingTerms.map(([k,v,d])=><div key={k}><span className="engagement-label">{k}</span><h3>{v}</h3><p>{d}</p></div>)}</div></div>
<div className="ap-notfor"><div><Label>WORTH BEING DIRECT</Label><h2>We’re not the right fit for everyone.</h2><p>If any of these describe you, we’ll probably say so in the first call — and save us both the time.</p></div><ul className="dont-list">{notFor.map(x=><li key={x}>{x}</li>)}</ul></div>
<div className="ap-outcomes"><Label>OUTCOMES</Label><h2>What’s different <em>when we leave.</em></h2><p className="ap-sub">Not frameworks in a slide deck. Working systems inside the business.</p><div className="ap-outcomes-grid">{outcomes.map(([t,d],i)=><div key={t}><span className="num">0{i+1}</span><h3>{t}</h3><p>{d}</p></div>)}</div></div>
<div className="lead-band"><div><Label>READY TO TALK?</Label><h2>Start with <em>a conversation.</em></h2><p>No pitch, no proposal on the first call. Just a direct conversation about the problem and whether we can help.</p></div><div className="lead-action"><a className="button" href="#contact-form">Get in touch <ArrowUpRight size={17}/></a><p>We’ll hear the situation and tell you honestly whether we’re the right fit.</p></div></div></section>}
// Insights: articles and client case studies. Resources: templates, checklists, guides and tools. Content lives in src/content.ts.
function Insights(){const [kind,setKind]=useState<'all'|PostKind>('all');const [topic,setTopic]=useState('All');
const list=posts.filter(p=>(kind==='all'||p.kind===kind)&&(topic==='All'||p.topic===topic));const live=list.filter(p=>p.status==='published');const soon=list.filter(p=>p.status!=='published');
return <section className="page section" id="insights-page"><Label>INSIGHTS</Label><h1>Field notes from <em>real businesses.</em></h1><p className="page-lede">Articles on the operating realities behind growth, and case studies from the work we do with clients. Every case study is anonymised and published only with the client’s consent.</p>
<div className="ins-filters"><div className="seg" role="tablist" aria-label="Type">{([['all','Everything'],['article','Articles'],['case','Case studies']] as const).map(([k,l])=><button key={k} role="tab" aria-selected={kind===k} className={kind===k?'on':''} onClick={()=>setKind(k)}>{l}<em>{k==='all'?posts.length:posts.filter(p=>p.kind===k).length}</em></button>)}</div>
<div className="filter-row">{['All',...TOPICS].map(x=><button className={topic===x?'active':''} onClick={()=>setTopic(x)} key={x}>{x}</button>)}</div></div>
{live.length>0&&<div className="ins-grid">{live.map(p=><PostCard p={p} key={p.slug}/>)}</div>}
{soon.length>0&&<><h2 className="ins-sub">In preparation <small>{soon.length} piece{soon.length===1?'':'s'} being written</small></h2><div className="ins-grid">{soon.map(p=><PostCard p={p} key={p.slug}/>)}</div></>}
{!list.length&&<p className="ins-empty">Nothing here yet for this filter.</p>}
<div className="ins-cta"><div><Label>HAVE A STORY LIKE THIS?</Label><h2>Tell us what is not adding up.</h2><p>Most of what we write starts as a client’s question. If yours is one we have not covered, we would like to hear it.</p></div><a className="button" href="#contact">Start a conversation <ArrowUpRight size={17}/></a></div></section>}
function PostCard({p}:{p:Post}){const pub=p.status==='published';const inner=<><div className="ins-meta"><span className={'ins-kind '+p.kind}>{p.kind==='case'?'Case study':'Article'}</span><span>{p.topic}</span></div><h3>{p.title}</h3><p>{p.summary}</p>
{p.client&&<dl className="ins-client"><div><dt>Sector</dt><dd>{p.client.sector}</dd></div><div><dt>Business</dt><dd>{p.client.size}</dd></div>{p.client.region&&<div><dt>Region</dt><dd>{p.client.region}</dd></div>}</dl>}
<span className="ins-foot">{pub?<>{p.date}{p.readMins?` · ${p.readMins} min read`:''} <ArrowRight size={13}/></>:'In preparation'}</span></>;
return pub?<a className={'ins-card '+p.kind} href={'#insights/'+p.slug}>{inner}</a>:<article className={'ins-card soon '+p.kind}>{inner}</article>}
function InsightPost({slug}:{slug:string}){const p=posts.find(x=>x.slug===slug&&x.status==='published');if(!p)return <section className="page section"><Label>INSIGHTS</Label><h1>This piece is not published yet.</h1><p className="page-lede">It may still be in preparation.</p><ArrowLink href="#insights">Back to Insights</ArrowLink></section>;
return <article className="page section ins-post"><a className="text-link" href="#insights">← Insights</a><div className="ins-meta"><span className={'ins-kind '+p.kind}>{p.kind==='case'?'Case study':'Article'}</span><span>{p.topic}</span>{p.date&&<span>{p.date}</span>}</div><h1>{p.title}</h1><p className="page-lede">{p.summary}</p>
{p.client&&<dl className="ins-client big"><div><dt>Sector</dt><dd>{p.client.sector}</dd></div><div><dt>Business</dt><dd>{p.client.size}</dd></div>{p.client.region&&<div><dt>Region</dt><dd>{p.client.region}</dd></div>}{p.outcome&&<div><dt>Outcome</dt><dd>{p.outcome}</dd></div>}</dl>}
<div className="ins-body">{(p.body??[]).map((x,i)=>x.startsWith('## ')?<h2 key={i}>{x.slice(3)}</h2>:<p key={i}>{x}</p>)}</div><CTA/></article>}
function Resources(){const [kind,setKind]=useState<'All'|ResourceKind>('All');const list=resources.filter(r=>kind==='All'||r.kind===kind);
return <section className="page section" id="resources-page"><Label>RESOURCES</Label><h1>Practical tools you can <em>use on Monday.</em></h1><p className="page-lede">Templates, checklists, guides and tools from our work. Free to use; no sign-up for the ones that are ready.</p>
<div className="filter-row">{(['All',...RESOURCE_KINDS] as const).map(x=><button className={kind===x?'active':''} onClick={()=>setKind(x)} key={x}>{x==='All'?'All':x+'s'}<em className="res-count">{x==='All'?resources.length:resources.filter(r=>r.kind===x).length}</em></button>)}</div>
<div className="res-grid">{list.map(r=>{const ok=r.status==='available'&&!!r.href;const inner=<><div className="res-top"><span className={'res-kind k-'+r.kind.toLowerCase()}>{r.kind}</span><span className="res-format">{r.format}</span></div><h3>{r.title}</h3><p>{r.summary}</p><span className={'res-action'+(ok?'':' soon')}>{ok?<>{r.kind==='Tool'?'Open':r.href!.startsWith('/')?'Download':'Open'} <ArrowUpRight size={14}/></>:'Coming soon'}</span></>;
  return ok?<a key={r.title} className="res-card" href={r.href} {...(r.href!.startsWith('/')?{download:''}:{})}{...(r.external?{target:'_blank',rel:'noopener noreferrer'}:{})}>{inner}</a>:<article key={r.title} className="res-card soon">{inner}</article>;})}</div>
<div className="ins-cta"><div><Label>NEED SOMETHING SPECIFIC?</Label><h2>Ask for the template you wish existed.</h2><p>If there is a checklist or tool that would save your team time, tell us. The useful ones end up here.</p></div><a className="button" href="#contact">Request a resource <ArrowUpRight size={17}/></a></div></section>}
function About(){return <section className="page section" id="about"><Label>ABOUT NXT FOUNDRY</Label><h1>Built around problems. <em>Driven by possibilities.</em></h1><p className="page-lede">NXT Foundry is a business and technology company combining expertise, execution, and innovation to solve meaningful business problems.</p><div className="founder"><div><Label>WHO YOU WORK WITH</Label><h2>Senior-led. <em>Not staffed out.</em></h2><p className="founder-meta">Based in Bengaluru · Available for engagements across India</p><img className="side-img" src="/images/diagnostic-whiteboard-v2.png" alt="Dark planning wall with process markers" loading="lazy"/></div><div className="founder-copy"><p>Big 4 risk advisory experience across internal controls, internal audit, process reviews, and risk analytics — applied to the operating problems of growing businesses. The people you meet in the first conversation are the people who do the work.</p><h3>Why NXT Foundry exists</h3><p>After years of seeing the same operational and control problems recur across industries — and the same gap between “the deck” and the actual fix — NXT Foundry was built to close that gap. We bring the rigour of a Big 4 practice, the pace of a lean team, and the willingness to stay until the fix is in place.</p></div></div><Label>HOW WE OPERATE</Label><div className="principles">{[['01','Business First','Start with understanding the actual problem.'],['02','Execution Focus','Move beyond recommendations to practical implementation.'],['03','Built for Impact','Prioritize measurable, sustainable business outcomes.'],['04','Innovation With Purpose','Use technology where it creates meaningful value.'],['05','Long-Term Thinking','Build solutions that can evolve and scale.']].map(([n,t,d])=><div className="principle" key={n}><span>{n}</span><h3>{t}</h3><p>{d}</p></div>)}</div></section>}
// The ending of the CTA question rolls through a few phrases. Screen readers get the first one, still;
// so do visitors who prefer reduced motion. All phrases share one grid cell, so the heading never changes width.
// Keep every phrase no wider than 'worth solving?' so the banner wraps exactly as before on every screen.
const CTA_ENDINGS = ['worth solving?','eating profits?','stuck in Excel?','leaking cash?','costing sleep?','worth a chat?','worth a chai?'];
function RollingEnding(){const [i,setI]=useState(0);
  React.useEffect(()=>{if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;const t=setInterval(()=>setI(n=>(n+1)%CTA_ENDINGS.length),2600);return()=>clearInterval(t)},[]);
  return <em className="roll"><span className="sr-only">{CTA_ENDINGS[0]}</span><span className="roll-stack" aria-hidden="true">{CTA_ENDINGS.map((w,k)=><span key={w} className={'roll-word'+(k===i?' in':k===(i+CTA_ENDINGS.length-1)%CTA_ENDINGS.length?' out':'')}>{w}</span>)}</span></em>}
function CTA(){return <section className="cta section" id="contact"><div><Label>START A CONVERSATION</Label><h2>Have a business problem <RollingEnding/></h2></div><div className="cta-action"><a className="button" href="#contact-form">Request a proposal <ArrowUpRight size={17}/></a><p className="cta-note">Typical turnaround: 3 business days.</p></div></section>}
const contactFields:readonly (readonly ['name'|'email'|'phone'|'company',string,string,string,string?])[] = [['name','Name','text','name'],['email','Business email','email','email'],['phone','Phone (optional)','tel','tel','We’re allergic to spam calls. We’ll only ring if you’d rather talk than type.'],['company','Company','text','organization']];
type Enquiry = Record<'name'|'email'|'phone'|'company'|'businessType'|'interest'|'message',string>;
const emptyEnquiry:Enquiry = {name:'',email:'',phone:'',company:'',businessType:'',interest:'',message:''};
// Keep in step with LIMITS in api/enquiry.ts and backend/apps-script/Code.gs.
const ENQUIRY_LIMITS:Record<keyof Enquiry,number> = {name:100,email:254,phone:25,company:150,businessType:80,interest:100,message:5000};
const PHONE_OK=(p:string)=>/^\+?[0-9 ()-]{7,25}$/.test(p)&&p.replace(/\D/g,'').length>=7&&p.replace(/\D/g,'').length<=15;
const newSubmissionId=()=>typeof crypto!=='undefined'&&'randomUUID' in crypto?crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12);
const ENQUIRY_ERRORS:Record<string,string> = {
  rate_limited:'We’ve had several enquiries from you or your network in a short time. Please try again later',
  busy:'We’re handling a lot of enquiries right now. Please try again in a minute',
  too_fast:'That was quicker than we expected. Please press send again',
  validation:'Please check the highlighted fields and try again',
};
const DEFAULT_ENQUIRY_ERROR='We couldn’t send your enquiry just now. Your details are still here, so please try again in a moment';
function validate(f:Enquiry){const e:Partial<Record<keyof Enquiry,string>>={}; if(!f.name.trim())e.name='Please enter your name.'; if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim()))e.email='Please enter a valid email address.'; if(f.phone.trim()&&!PHONE_OK(f.phone.trim()))e.phone='Please enter a valid phone number, or leave it blank.'; if(!f.company.trim())e.company='Please enter your company.'; if(!f.message.trim())e.message='Please tell us a little about what you’re working through.'; return e}
function Contact(){const [form,setForm]=useState<Enquiry>(()=>{try{const raw=sessionStorage.getItem('nxt-interest');if(!raw)return emptyEnquiry;sessionStorage.removeItem('nxt-interest');const names:string[]=JSON.parse(raw);if(!names.length)return emptyEnquiry;return {...emptyEnquiry,interest:names[0],message:`We would like early access to: ${names.join(', ')}.`}}catch{return emptyEnquiry}}); const [errors,setErrors]=useState<Partial<Record<keyof Enquiry,string>>>({}); const [status,setStatus]=useState<'idle'|'sending'|'sent'|'mailto'|'error'>('idle'); const [errorText,setErrorText]=useState(DEFAULT_ENQUIRY_ERROR); const [enquiryId,setEnquiryId]=useState<string|null>(null); const [honeypot,setHoneypot]=useState(''); const [phoneCountry,setPhoneCountry]=useState(DEFAULT_COUNTRY);
// One id per enquiry, reused on retries so the backend can recognise a repeat; renewed after a success.
const submissionId=React.useRef(newSubmissionId()); const startedAt=React.useRef(Date.now()); const inFlight=React.useRef(false);
const set=(k:keyof Enquiry)=>(e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>)=>{setForm({...form,[k]:e.target.value}); if(errors[k])setErrors({...errors,[k]:undefined})};
const submit=async(e:React.FormEvent)=>{e.preventDefault();
  // The phone is sent and stored in international form, e.g. "+91 98765 43210".
  const enquiry={...form,phone:composePhone(phoneCountry,form.phone)}; const errs=validate(enquiry); setErrors(errs); if(Object.keys(errs).length)return;
  if(inFlight.current)return;
  if(OFFLINE_BUILD){const body=`Name: ${form.name}\nEmail: ${form.email}\nPhone: ${enquiry.phone||'—'}\nCompany: ${form.company}\nBusiness type: ${form.businessType||'—'}\nArea of interest: ${form.interest||'—'}\n\n${form.message}`; window.location.href=`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Enquiry from '+form.name+' ('+form.company+')')}&body=${encodeURIComponent(body)}`; setStatus('mailto'); return}
  inFlight.current=true; setStatus('sending'); const ctrl=new AbortController(); const timer=setTimeout(()=>ctrl.abort(),ENQUIRY_TIMEOUT_MS);
  try{const r=await fetch(ENQUIRY_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({...enquiry,hpField:honeypot,submissionId:submissionId.current,elapsedMs:Date.now()-startedAt.current}),signal:ctrl.signal});
    let data:{ok?:boolean,enquiryId?:string|null,error?:string,fields?:Partial<Record<keyof Enquiry,string>>}={}; try{data=await r.json()}catch{/* not JSON: treated as a failure below */}
    // Success only when the backend confirms the enquiry was stored.
    if(r.ok&&data.ok===true){setEnquiryId(data.enquiryId??null); setStatus('sent'); setForm(emptyEnquiry); setHoneypot(''); submissionId.current=newSubmissionId(); startedAt.current=Date.now(); return}
    if(data.error==='validation'&&data.fields)setErrors(data.fields);
    setErrorText(ENQUIRY_ERRORS[data.error??'']??DEFAULT_ENQUIRY_ERROR); setStatus('error')}
  catch{setErrorText(DEFAULT_ENQUIRY_ERROR); setStatus('error')}
  finally{clearTimeout(timer); inFlight.current=false}};
return <section className="page section contact-page" id="contact-form"><Label>CONTACT</Label><h1>Let’s make the <em>next move.</em></h1><div className="contact-grid"><div><p className="large">Tell us a little about the challenge, opportunity, or idea on your mind.</p><a className="contact-email" href={'mailto:'+CONTACT_EMAIL}>{CONTACT_EMAIL}</a><p className="privacy">We’ll use the information you share only to respond to your enquiry. See our <a href={PRIVACY_URL}>Privacy Policy</a>.</p></div>
{status==='sent'?<div className="form-success" role="status"><h3>Thanks — your enquiry is in.</h3><p>We’ve received your message and will be in touch.{enquiryId&&<> Your reference is <strong>{enquiryId}</strong>.</>}</p><button className="text-link" type="button" onClick={()=>{setStatus('idle'); setEnquiryId(null); startedAt.current=Date.now()}}>Send another enquiry</button></div>:
<form onSubmit={submit} noValidate><div className="hp-field" aria-hidden="true"><label>Leave this field empty<input type="text" name="nxt_hp_2f9" id="nxt_hp_2f9" tabIndex={-1} autoComplete="off" data-lpignore="true" data-1p-ignore="true" value={honeypot} onChange={e=>setHoneypot(e.target.value)}/></label></div>{contactFields.map(([k,l,t,ac,hint])=>k==='phone'?<PhoneField key={k} id="phone" label={l} iso={phoneCountry} onIso={setPhoneCountry} value={form.phone} onChange={set('phone')} maxLength={ENQUIRY_LIMITS.phone-2-(COUNTRIES.find(c=>c.iso===phoneCountry)?.dial.length??3)} invalid={!!errors.phone} describedBy={[hint&&'phone-hint',errors.phone&&'phone-error'].filter(Boolean).join(' ')||undefined}>{hint&&<span className="field-hint" id="phone-hint">{hint}</span>}{errors.phone&&<span className="field-error" id="phone-error">{errors.phone}</span>}</PhoneField>:<label key={k}>{l}<input type={t} name={k} placeholder={l} autoComplete={ac} maxLength={ENQUIRY_LIMITS[k]} value={form[k]} onChange={set(k)} aria-invalid={!!errors[k]} aria-describedby={[hint&&k+'-hint',errors[k]&&k+'-error'].filter(Boolean).join(' ')||undefined}/>{hint&&<span className="field-hint" id={k+'-hint'}>{hint}</span>}{errors[k]&&<span className="field-error" id={k+'-error'}>{errors[k]}</span>}</label>)}<label>Business type<select name="businessType" value={form.businessType} onChange={set('businessType')}><option value="">Select one</option><option>Established business</option><option>Emerging business</option><option>Other</option></select></label><label>Area of interest<select name="interest" value={form.interest} onChange={set('interest')}><option value="">Select one</option><option>The Diagnostic</option><option>The Reset</option><option>Ongoing Advisory</option><option>Custom engagement</option><option>Vendor Payable Reconciliation</option><option>Customer Reconciliation</option><option>GSTR Reconciliation</option><option>Invoice Reading &amp; Reconciliation</option><option>Bank Reconciliation</option><option>Payment &amp; Marketplace Settlements</option><option>Not sure yet</option></select></label><label>Message<textarea name="message" placeholder="What are you working through?" rows={4} maxLength={ENQUIRY_LIMITS.message} value={form.message} onChange={set('message')} aria-invalid={!!errors.message} aria-describedby={errors.message?'message-error':undefined}/>{errors.message&&<span className="field-error" id="message-error">{errors.message}</span>}</label><button className="button" type="submit" disabled={status==='sending'}>{status==='sending'?'Sending…':'Send — we reply within 1 business day'} <ArrowRight size={17}/></button><p className="form-privacy">How we store and use what you send: <a href={PRIVACY_URL}>Privacy Policy</a>.</p>{status==='mailto'&&<p className="form-note" role="status">Your email app should open with the enquiry ready to send. If it didn’t, write to us at {CONTACT_EMAIL}.</p>}{status==='error'&&<p className="form-note form-error" role="alert">{errorText}, or email us at <a href={'mailto:'+CONTACT_EMAIL}>{CONTACT_EMAIL}</a>.</p>}</form>}</div></section>}
// If a page crashes, show a way out instead of a blank screen. Keyed by the page, so navigating away resets it.
class PageErrorBoundary extends React.Component<{children:React.ReactNode},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true}}
  componentDidCatch(err:unknown){console.error('Page error:',err instanceof Error?err.message:'unknown')}
  render(){return this.state.failed?<section className="page section"><Label>SOMETHING WENT WRONG</Label><h1>This page hit a <em>snag.</em></h1><p className="page-lede">Reload to try again. If it keeps happening, email us at {CONTACT_EMAIL}.</p><button className="button" type="button" onClick={()=>window.location.reload()}>Reload the page</button></section>:this.props.children}
}
// Vercel Web Analytics + Speed Insights (cookieless). Pages are hash routes, so each is reported under a clean name:
// in-page anchors (#products-customer, #prog-reset) roll up to their page, and tool screens to one route.
// Not loaded in the offline bundle, which has no Vercel backend.
function analyticsRoute(hash:string){const h=hash.replace(/^#/,'');
  if(!h)return '/'; if(h.startsWith('products'))return '/products'; if(h.startsWith('prog-')||h.startsWith('solutions'))return '/solutions';
  if(h.startsWith('contact'))return '/contact'; if(h.startsWith('insights'))return '/insights'; if(h.startsWith('reconciliation-lab'))return '/reconciliation-lab';
  return '/'+h.split('/')[0].replace(/[^a-z0-9-]/gi,'');}
function SiteInsights({hash}:{hash:string}){if(OFFLINE_BUILD)return null;const route=analyticsRoute(hash);
  return <><Analytics route={route} path={route}/><SpeedInsights route={route}/></>}
function App(){const [hash,setHash]=useState(window.location.hash); React.useEffect(()=>{const f=()=>setHash(window.location.hash);window.addEventListener('hashchange',f);return()=>window.removeEventListener('hashchange',f)},[]);
// Each hash is a separate page, so start it at the top — except #contact-form, which is a jump to the form itself.
React.useLayoutEffect(()=>{const target=(hash==='#contact-form'||hash.startsWith('#products-')||hash.startsWith('#prog-'))&&document.getElementById(hash.slice(1)); if(target)target.scrollIntoView({behavior:'instant' as ScrollBehavior}); else window.scrollTo({top:0,behavior:'instant' as ScrollBehavior})},[hash]);
let content=<Home/>; if(hash==='#products'||hash.startsWith('#products-'))content=<Products/>; else if(hash.startsWith('#reconciliation-lab'))content=<ReconciliationLab/>; else if(hash==='#approach')content=<Approach/>; else if(hash==='#insights'||hash.startsWith('#insights/'))content=INSIGHTS_PAGE_LIVE?(hash==='#insights'?<Insights/>:<InsightPost slug={hash.slice(10)}/>):<ComingSoon label="INSIGHTS" id="insights-page"/>; else if(hash==='#resources')content=RESOURCES_PAGE_LIVE?<Resources/>:<ComingSoon label="RESOURCES" id="resources-page"/>; else if(hash.startsWith('#stories/')&&stories.some(st=>'#stories/'+st.id===hash))content=<StoryPage s={stories.find(st=>'#stories/'+st.id===hash)!}/>; else if(hash==='#stories'||hash.startsWith('#stories/'))content=stories.length?<Stories/>:<ComingSoon label="STORIES" id="stories-page" title={<>We’re building the <em>narrative</em></>} lede="Stories from the work — the problem, what we found and what changed — will be told here soon."/>; else if(hash==='#about')content=<About/>; else if(hash==='#contact'||hash==='#contact-form')content=<><CTA/><Contact/></>; else if(hash==='#solutions'||hash==='#solutions-page'||hash.startsWith('#prog-'))content=<Solutions/>; content=<PageErrorBoundary key={hash.split('/')[0]}>{content}</PageErrorBoundary>; if(hash.startsWith('#reconciliation-lab'))return <><main className="tool-only">{content}</main><SiteInsights hash={hash}/>{!OFFLINE_BUILD&&<Consent/>}</>; return <><Header/><main>{content}</main><Footer/><SiteInsights hash={hash}/>{!OFFLINE_BUILD&&<Consent/>}</>}
// Pages rendered to text at build time for /llms-full.txt (scripts/llms-full.tsx). Keep in step with the routes in App.
export const LLM_PAGES:[string,string,React.ReactNode][] = [
  ['Home','https://www.nxtfoundry.in/',<Home/>],
  ['What We Do','https://www.nxtfoundry.in/#solutions',<Solutions/>],
  ['Products','https://www.nxtfoundry.in/#products',<Products/>],
  ['Our Approach','https://www.nxtfoundry.in/#approach',<Approach/>],
  ['About','https://www.nxtfoundry.in/#about',<About/>],
  ...(stories.length?[['Stories','https://www.nxtfoundry.in/#stories',<Stories/>] as [string,string,React.ReactNode]]:[]),
  ...stories.map(st=>[storyText(st.title),'https://www.nxtfoundry.in/#stories/'+st.id,<StoryPage s={st}/>] as [string,string,React.ReactNode]),
  ['Contact','https://www.nxtfoundry.in/#contact',<><CTA/><Contact/></>],
];
if(!import.meta.env.SSR)createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
