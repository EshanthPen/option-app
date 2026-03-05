import ICAL from 'ical.js';
import { useState, useEffect, useRef } from "react";
import {
  Home, BookOpen, Calculator, Calendar, Clock, ChevronLeft,
  ChevronRight, Plus, Upload, Link, Image, FileText,
  AlertTriangle, Lock, Loader, Sparkles, ArrowRight
} from "lucide-react";
/* ── Fonts ─────────────────────────────────────────────────── */
const FONT = `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;0,900;1,400;1,700&family=DM+Mono:wght@300;400;500&family=Instrument+Sans:wght@300;400;500;600&display=swap');`;


/* ── CSS ───────────────────────────────────────────────────── */
const CSS = `
${FONT}
*{box-sizing:border-box;margin:0;padding:0;}
:root{
  --bg:#f5f4f1;
  --surface:#ffffff;
  --surface2:#eeecea;
  --border:#e2dfda;
  --border2:#ccc9c1;
  --ink:#0d0c0a;
  --ink2:#4e4c47;
  --ink3:#908d86;
  --ink4:#cac7c0;
  --red:#b83232;
  --orange:#c45e1a;
  --green:#1a6e40;
  --blue:#1b4a82;
  --r:6px;
  --ff-d:'Playfair Display',serif;
  --ff-m:'DM Mono',monospace;
  --ff-s:'Instrument Sans',sans-serif;
}
body{font-family:var(--ff-s);background:var(--bg);color:var(--ink);-webkit-font-smoothing:antialiased;}
button,input,select,textarea{font-family:var(--ff-s);}

.shell{display:flex;height:100vh;overflow:hidden;}

/* ── Sidebar ─── */
.sb{
  width:210px;min-width:210px;background:var(--ink);
  display:flex;flex-direction:column;
}
.sb-logo{padding:20px 18px 16px;border-bottom:1px solid #1e1d1a;}
.sb-wordmark{font-family:var(--ff-d);font-size:22px;font-weight:900;color:#fff;letter-spacing:-0.5px;font-style:italic;}
.sb-tagline{font-family:var(--ff-m);font-size:9px;color:#3a3a35;letter-spacing:3px;text-transform:uppercase;margin-top:3px;}
.sb-nav{flex:1;padding:10px 8px;overflow-y:auto;}
.sb-sec{font-family:var(--ff-m);font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#333;padding:12px 10px 5px;}
.sb-item{
  display:flex;align-items:center;gap:9px;padding:8px 10px;
  border-radius:5px;cursor:pointer;font-size:13px;font-weight:500;
  color:#666;transition:all 0.12s;margin-bottom:1px;
}
.sb-item:hover{background:#191917;color:#aaa;}
.sb-item.on{background:#fff;color:var(--ink);}
.sb-item.on svg{color:var(--ink);}
.sb-item svg{width:14px;height:14px;flex-shrink:0;color:#444;}
.sb-foot{padding:14px 18px;border-top:1px solid #181816;}
.sb-user{font-size:11px;color:#383830;font-family:var(--ff-m);}

/* ── Main ─── */
.main{flex:1;overflow-y:auto;background:var(--bg);}
.page{padding:28px 30px;max-width:1080px;}

/* ── Page header ─── */
.ph{margin-bottom:22px;}
.ph-row{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;}
.ph-title{font-family:var(--ff-d);font-size:28px;font-weight:700;letter-spacing:-0.5px;line-height:1.1;}
.ph-sub{font-family:var(--ff-m);font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--ink3);margin-top:4px;}

/* ── Cards ─── */
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:18px 20px;}
.ch{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;}
.ct{font-family:var(--ff-d);font-size:15px;font-weight:600;letter-spacing:-0.2px;}

/* ── Grid ─── */
.g2{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;}
.g4{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;}

/* ── Buttons ─── */
.btn{display:inline-flex;align-items:center;gap:6px;padding:8px 15px;border-radius:var(--r);border:none;cursor:pointer;font-size:13px;font-weight:500;transition:all 0.12s;font-family:var(--ff-s);white-space:nowrap;}
.btn svg{width:13px;height:13px;flex-shrink:0;}
.btn-dark{background:var(--ink);color:#fff;}
.btn-dark:hover{background:#222;}
.btn-out{background:transparent;border:1px solid var(--border2);color:var(--ink2);}
.btn-out:hover{border-color:var(--ink);color:var(--ink);}
.btn-ghost{background:transparent;color:var(--ink3);border:1px solid transparent;}
.btn-ghost:hover{background:var(--surface2);color:var(--ink);}
.btn-red{background:#b83232;color:#fff;}
.btn-red:hover{background:#9e2b2b;}
.btn-sm{padding:5px 10px;font-size:11px;}
.btn-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}

/* ── Priority colors ─── */
.p-high{color:var(--red);}
.p-med{color:var(--orange);}
.p-low{color:var(--green);}
.p-test{color:var(--blue);}
.bg-high{background:#fdf0f0;border-left:3px solid var(--red);}
.bg-med{background:#fdf4ee;border-left:3px solid var(--orange);}
.bg-low{background:#eef7f2;border-left:3px solid var(--green);}
.bg-test{background:#eef2fb;border-left:3px solid var(--blue);}

/* ── Tags ─── */
.tag{display:inline-block;padding:2px 7px;border-radius:3px;font-size:10px;font-weight:600;font-family:var(--ff-m);letter-spacing:0.3px;text-transform:uppercase;}
.t-high{background:#fde0e0;color:var(--red);}
.t-med{background:#fde8d8;color:var(--orange);}
.t-low{background:#e0f3e8;color:var(--green);}
.t-test{background:#dde8f8;color:var(--blue);}
.t-ap{background:var(--ink);color:#fff;}
.t-hn{background:#4e4c47;color:#fff;}
.t-reg{background:var(--surface2);color:var(--ink2);}

/* ── Forms ─── */
.fl{display:block;font-size:10px;font-weight:600;color:var(--ink3);margin-bottom:5px;text-transform:uppercase;letter-spacing:1.2px;font-family:var(--ff-m);}
.fi{width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:var(--r);padding:8px 11px;font-size:13px;color:var(--ink);outline:none;transition:border 0.12s;}
.fi:focus{border-color:var(--ink);}
.fs{width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:var(--r);padding:8px 11px;font-size:13px;color:var(--ink);outline:none;appearance:none;cursor:pointer;}
.fg{margin-bottom:12px;}

/* ── Progress ─── */
.pb{height:4px;background:var(--surface2);border-radius:2px;overflow:hidden;}
.pf{height:100%;border-radius:2px;transition:width 0.5s;}

/* ── Toggle ─── */
.tog{position:relative;width:38px;height:21px;flex-shrink:0;}
.tog input{opacity:0;width:0;height:0;}
.tog-t{position:absolute;cursor:pointer;inset:0;background:var(--surface2);border:1px solid var(--border2);border-radius:21px;transition:.2s;}
.tog input:checked+.tog-t{background:var(--ink);border-color:var(--ink);}
.tog-t::before{content:'';position:absolute;width:15px;height:15px;left:2px;top:2px;background:#fff;border-radius:50%;transition:.2s;}
.tog input:checked+.tog-t::before{transform:translateX(17px);}

/* ── Divider ─── */
.dv{height:1px;background:var(--border);margin:16px 0;}

/* ── Modal ─── */
.ov{position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;backdrop-filter:blur(4px);}
.modal{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:26px;width:480px;max-width:95vw;max-height:90vh;overflow-y:auto;}
.mt{font-family:var(--ff-d);font-size:20px;font-weight:700;margin-bottom:18px;letter-spacing:-0.3px;}

/* ── Asgn row ─── */
.ar{display:flex;align-items:center;gap:10px;padding:10px 13px;border-radius:var(--r);margin-bottom:4px;border:1px solid transparent;}
.an{font-size:13px;font-weight:600;flex:1;min-width:0;}
.am{font-family:var(--ff-m);font-size:10px;color:var(--ink3);}

/* ── Scrollbar ─── */
::-webkit-scrollbar{width:4px;}
::-webkit-scrollbar-track{background:transparent;}
::-webkit-scrollbar-thumb{background:var(--border2);border-radius:2px;}

/* ── Animations ─── */
@keyframes fu{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
.fu{animation:fu 0.25s ease both;}
@keyframes sd{from{opacity:0;transform:translateY(-5px);}to{opacity:1;transform:translateY(0);}}
.sd{animation:sd 0.2s ease both;}
@keyframes spin{to{transform:rotate(360deg);}}
.spin{animation:spin 0.8s linear infinite;}

/* ── Calendar ─── */
.cal-hd{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin-bottom:3px;}
.cal-dow{text-align:center;font-family:var(--ff-m);font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--ink3);padding:5px 2px;}
.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;}
.cal-cell{min-height:86px;background:var(--surface);border:1px solid var(--border);border-radius:5px;padding:6px;cursor:pointer;transition:border-color 0.12s;position:relative;overflow:hidden;}
.cal-cell:hover{border-color:var(--border2);}
.cal-cell.today{border-color:var(--ink);border-width:2px;}
.cal-cell.other{background:var(--surface2);opacity:0.45;}
.cal-num{font-family:var(--ff-m);font-size:11px;font-weight:500;margin-bottom:3px;color:var(--ink2);}
.cal-cell.today .cal-num{font-weight:700;color:var(--ink);}
.cal-ev{font-size:9px;padding:2px 5px;border-radius:3px;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--ff-s);font-weight:500;display:flex;align-items:center;gap:3px;}
.cal-ev.high{background:#fde0e0;color:var(--red);}
.cal-ev.med{background:#fde8d8;color:var(--orange);}
.cal-ev.low{background:#e0f3e8;color:var(--green);}
.cal-ev.test{background:#dde8f8;color:var(--blue);}
.cal-more{font-size:9px;color:var(--ink3);font-family:var(--ff-m);cursor:pointer;padding:1px 4px;}
.cal-more:hover{color:var(--ink);}
.cal-key{display:flex;flex-wrap:wrap;gap:14px;align-items:center;padding:10px 14px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r);margin-bottom:12px;}
.ck-item{display:flex;align-items:center;gap:5px;font-size:10px;font-family:var(--ff-m);color:var(--ink2);}
.ck-swatch{width:9px;height:9px;border-radius:2px;flex-shrink:0;}

/* Day popover */
.day-pop{position:absolute;top:calc(100% + 4px);background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px;z-index:50;min-width:190px;box-shadow:0 4px 20px rgba(0,0,0,0.1);}
.dp-date{font-family:var(--ff-m);font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--ink3);margin-bottom:8px;}

/* ── Grades ─── */
.class-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;}
.cc{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:16px 18px;cursor:pointer;transition:all 0.12s;position:relative;overflow:hidden;}
.cc::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;}
.cc.A::before,.cc.Ap::before{background:var(--green);}
.cc.B::before{background:var(--blue);}
.cc.C::before{background:var(--orange);}
.cc.D::before,.cc.F::before{background:var(--red);}
.cc:hover{box-shadow:0 2px 12px rgba(0,0,0,0.07);border-color:var(--border2);}
.cc-code{font-family:var(--ff-m);font-size:9px;letter-spacing:1px;color:var(--ink3);margin-bottom:3px;}
.cc-name{font-size:13px;font-weight:600;margin-bottom:10px;line-height:1.3;}
.cc-letter{font-family:var(--ff-d);font-size:40px;font-weight:900;letter-spacing:-1px;line-height:1;}
.cc-pct{font-size:13px;color:var(--ink2);margin-top:2px;}
.cc-gp{font-family:var(--ff-m);font-size:9px;color:var(--ink3);margin-top:1px;}

/* Grade detail */
.gd-top{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:22px;margin-bottom:14px;display:flex;gap:20px;align-items:center;}
.gd-letter{font-family:var(--ff-d);font-size:80px;font-weight:900;letter-spacing:-2px;line-height:1;flex-shrink:0;}
.gd-nm{font-family:var(--ff-d);font-size:22px;font-weight:700;margin-bottom:3px;}
.gd-row{display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r);margin-bottom:3px;}
.gd-n{flex:1;font-size:13px;font-weight:500;}
.gd-d{font-family:var(--ff-m);font-size:10px;color:var(--ink3);}
.gd-s{font-family:var(--ff-m);font-size:12px;font-weight:500;}
.gd-pct{font-size:11px;color:var(--ink3);width:38px;text-align:right;}
.sec-label{font-family:var(--ff-m);font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--ink3);padding:10px 0 5px;border-bottom:1px solid var(--border);margin-bottom:5px;}

/* ── GPA ─── */
.gpa-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:22px 24px;}
.gpa-lbl{font-family:var(--ff-m);font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--ink3);margin-bottom:8px;}
.gpa-num{font-family:var(--ff-d);font-size:58px;font-weight:900;letter-spacing:-2px;line-height:1;}
.gpa-sub{font-size:12px;color:var(--ink3);margin-top:5px;}
.drag-row{display:flex;align-items:center;gap:10px;padding:8px 12px;background:#fdf0f0;border-radius:var(--r);margin-bottom:4px;border-left:3px solid var(--red);}
.cls-row{display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r);margin-bottom:4px;}
.what-result{background:var(--ink);color:#fff;border-radius:var(--r);padding:22px 24px;margin-bottom:14px;text-align:center;}
.wr-lbl{font-family:var(--ff-m);font-size:9px;letter-spacing:3px;text-transform:uppercase;color:#444;margin-bottom:4px;}
.wr-num{font-family:var(--ff-d);font-size:72px;font-weight:900;letter-spacing:-3px;line-height:1;color:#fff;}
.wr-sub{font-size:12px;color:#555;margin-top:6px;}

/* ── Screen Time ─── */
.opal{background:var(--ink);border-radius:8px;padding:24px;position:relative;overflow:hidden;margin-bottom:14px;}
.opal::before{content:'';position:absolute;top:-60px;right:-60px;width:220px;height:220px;background:rgba(255,255,255,0.02);border-radius:50%;}
.opal-idle{background:var(--surface);border:1px solid var(--border);}
.opal-status{font-family:var(--ff-m);font-size:9px;letter-spacing:3px;text-transform:uppercase;color:#333;margin-bottom:5px;}
.opal-idle .opal-status{color:var(--ink3);}
.opal-title{font-family:var(--ff-d);font-size:30px;font-weight:900;letter-spacing:-0.5px;color:#fff;margin-bottom:3px;}
.opal-idle .opal-title{color:var(--ink2);}
.opal-time{font-family:var(--ff-m);font-size:13px;color:#444;margin-bottom:18px;}
.opal-idle .opal-time{color:var(--ink3);}
.app-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px;}
.app-tile{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:11px;text-align:center;cursor:pointer;transition:all 0.12s;user-select:none;}
.app-tile.on{background:var(--ink);border-color:var(--ink);}
.app-tile:hover:not(.on){border-color:var(--border2);}
.app-icon{font-size:20px;margin-bottom:3px;}
.app-nm{font-size:10px;font-family:var(--ff-m);color:var(--ink3);}
.app-tile.on .app-nm{color:#555;}
.dur-btn{padding:10px 8px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--r);text-align:center;cursor:pointer;font-size:13px;font-weight:500;transition:all 0.12s;}
.dur-btn.on{background:var(--ink);border-color:var(--ink);color:#fff;}
.pomo-opt{padding:12px 14px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--r);cursor:pointer;transition:all 0.12s;margin-bottom:8px;}
.pomo-opt.on{background:var(--ink);border-color:var(--ink);color:#fff;}
.pomo-opt-t{font-size:13px;font-weight:600;}
.pomo-opt-s{font-size:11px;color:var(--ink3);margin-top:2px;}
.pomo-opt.on .pomo-opt-s{color:#666;}

/* ── Importer ─── */
.dz{border:2px dashed var(--border2);border-radius:8px;padding:32px;text-align:center;cursor:pointer;transition:all 0.15s;}
.dz:hover{border-color:var(--ink);background:var(--surface2);}
.dz.drag{border-color:var(--ink);background:var(--surface2);}
.imp-tab{display:flex;background:var(--surface2);border:1px solid var(--border);border-radius:var(--r);padding:3px;margin-bottom:18px;gap:3px;}
.imp-t{flex:1;padding:8px;border-radius:4px;text-align:center;font-size:12px;font-weight:500;cursor:pointer;color:var(--ink3);transition:all 0.12s;display:flex;align-items:center;justify-content:center;gap:5px;}
.imp-t svg{width:12px;height:12px;}
.imp-t.on{background:var(--surface);color:var(--ink);box-shadow:0 1px 4px rgba(0,0,0,0.08);}
.ev-extracted{padding:10px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--r);margin-bottom:6px;display:flex;align-items:center;gap:10px;}
.ee-check{width:18px;height:18px;border:1px solid var(--border2);border-radius:3px;flex-shrink:0;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:10px;background:var(--surface);}
.ee-check.checked{background:var(--ink);border-color:var(--ink);color:#fff;}
.ai-thinking{display:flex;align-items:center;gap:10px;padding:14px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--r);margin-top:10px;}
.ai-t{font-size:13px;color:var(--ink2);}
.ai-sub{font-size:11px;color:var(--ink3);margin-top:1px;font-family:var(--ff-m);}
`;

/* ── Data ─────────────────────────────────────────────────── */
const CLASSES = [
  { id:1, code:"MTH-701", name:"AP Calculus BC", type:"AP", pct:94.2, letter:"A", wGP:5.0, uGP:4.0,
    assignments:[
      {name:"Problem Set 6",type:"Formative",score:46,total:50,date:"Feb 19"},
      {name:"Problem Set 5",type:"Formative",score:48,total:50,date:"Feb 12"},
      {name:"Chapter 5 Test",type:"Summative",score:91,total:100,date:"Feb 7"},
      {name:"Midterm",type:"Final",score:188,total:200,date:"Jan 28"},
    ]},
  { id:2, code:"BIO-701", name:"AP Biology", type:"AP", pct:88.4, letter:"B+", wGP:4.5, uGP:3.5,
    assignments:[
      {name:"Lab Report 3",type:"Summative",score:88,total:100,date:"Feb 18"},
      {name:"Reading Quiz 7",type:"Formative",score:18,total:20,date:"Feb 14"},
      {name:"Chapter 9 Test",type:"Summative",score:85,total:100,date:"Feb 6"},
    ]},
  { id:3, code:"ENG-701", name:"AP English Literature", type:"AP", pct:91.1, letter:"A-", wGP:4.7, uGP:3.7,
    assignments:[
      {name:"Essay 3 — Hamlet",type:"Summative",score:92,total:100,date:"Feb 17"},
      {name:"Reading Journal",type:"Formative",score:28,total:30,date:"Feb 11"},
      {name:"Midterm Essay",type:"Final",score:178,total:200,date:"Jan 29"},
    ]},
  { id:4, code:"HIS-701", name:"AP US History", type:"AP", pct:85.0, letter:"B", wGP:4.0, uGP:3.0,
    assignments:[
      {name:"DBQ Practice",type:"Summative",score:83,total:100,date:"Feb 20"},
      {name:"Chapter 14 Quiz",type:"Formative",score:17,total:20,date:"Feb 13"},
      {name:"Unit 4 Test",type:"Summative",score:86,total:100,date:"Feb 5"},
    ]},
  { id:5, code:"CHE-701", name:"AP Chemistry", type:"AP", pct:79.3, letter:"C+", wGP:3.3, uGP:2.3,
    assignments:[
      {name:"Lab Report 5",type:"Summative",score:78,total:100,date:"Feb 18"},
      {name:"Quiz 8",type:"Formative",score:15,total:20,date:"Feb 15"},
      {name:"Chapter 12 Test",type:"Summative",score:80,total:100,date:"Feb 4"},
    ]},
  { id:6, code:"HNR-601", name:"Honors English 11", type:"HN", pct:93.5, letter:"A", wGP:4.5, uGP:4.0,
    assignments:[
      {name:"Socratic Seminar",type:"Summative",score:95,total:100,date:"Feb 16"},
      {name:"Vocab Quiz 9",type:"Formative",score:28,total:30,date:"Feb 10"},
    ]},
];

const EVENTS_INIT = [
  {id:1,name:"Calc Problem Set 7",date:"2026-02-24",priority:"med",blockScreen:false},
  {id:2,name:"Biology Lab Report",date:"2026-02-25",priority:"high",blockScreen:true},
  {id:3,name:"Study Session",date:"2026-02-26",priority:"low",blockScreen:true},
  {id:4,name:"AP Chem Test",date:"2026-03-01",priority:"test",blockScreen:false},
  {id:5,name:"English Essay Due",date:"2026-02-27",priority:"med",blockScreen:false},
  {id:6,name:"APUSH DBQ",date:"2026-03-03",priority:"high",blockScreen:false},
  {id:7,name:"Chem Study Block",date:"2026-03-01",priority:"low",blockScreen:true},
  {id:8,name:"AP Bio Test",date:"2026-03-10",priority:"test",blockScreen:false},
  {id:9,name:"Essay Outline",date:"2026-02-24",priority:"low",blockScreen:false},
  {id:10,name:"Physics Quiz",date:"2026-02-24",priority:"test",blockScreen:false},
];

const APPS = [
  {name:"Instagram",icon:"📸"},{name:"TikTok",icon:"🎵"},{name:"YouTube",icon:"▶️"},
  {name:"Twitter",icon:"🐦"},{name:"Snapchat",icon:"👻"},{name:"Discord",icon:"💬"},
  {name:"Reddit",icon:"🤖"},{name:"Netflix",icon:"🎬"},{name:"Twitch",icon:"🎮"},
  {name:"BeReal",icon:"📷"},{name:"Pinterest",icon:"📌"},{name:"Spotify",icon:"🎧"},
];

/* ── Helpers ─────────────────────────────────────────────── */
const lColor = l => l.startsWith("A")?"var(--green)":l.startsWith("B")?"var(--blue)":l.startsWith("C")?"var(--orange)":"var(--red)";
const lClass = l => l.startsWith("A")?"A":l.startsWith("B")?"B":l.startsWith("C")?"C":"D";
const pColor = p => p>=90?"var(--green)":p>=80?"var(--blue)":p>=70?"var(--orange)":"var(--red)";
const fmtT = s => {
  const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;
  return h>0?`${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`:`${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
};
const calcW = cls => {
  const bonus={AP:1,HN:0.5,REG:0};
  const pts = cls.reduce((s,c)=>{
    const b=c.pct>=93?4:c.pct>=90?3.7:c.pct>=87?3.3:c.pct>=83?3:c.pct>=80?2.7:c.pct>=77?2.3:c.pct>=73?2:c.pct>=70?1.7:1;
    return s+b+(bonus[c.type]||0);
  },0);
  return (pts/cls.length).toFixed(2);
};
const calcU = cls => {
  const pts = cls.reduce((s,c)=>{
    return s+(c.pct>=93?4:c.pct>=90?3.7:c.pct>=87?3.3:c.pct>=83?3:c.pct>=80?2.7:c.pct>=77?2.3:c.pct>=73?2:c.pct>=70?1.7:1);
  },0);
  return (pts/cls.length).toFixed(2);
};

/* ── HOME ────────────────────────────────────────────────── */
function HomePage({ events }) {
  const today = new Date(2026,1,23);
  const ds = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const ms = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const upcoming = [...events].filter(e=>new Date(e.date)>=today).sort((a,b)=>new Date(a.date)-new Date(b.date)).slice(0,6);
  const blocked = [...events].filter(e=>e.blockScreen && new Date(e.date)>=today).sort((a,b)=>new Date(a.date)-new Date(b.date)).slice(0,4);

  return (
    <div className="page fu">
      <div style={{marginBottom:26}}>
        <div style={{fontFamily:"var(--ff-m)",fontSize:10,letterSpacing:3,textTransform:"uppercase",color:"var(--ink3)",marginBottom:5}}>
          {ds[today.getDay()]} · {ms[today.getMonth()]} {today.getDate()}, {today.getFullYear()}
        </div>
        <div style={{fontFamily:"var(--ff-d)",fontSize:38,fontWeight:900,letterSpacing:"-1.5px",lineHeight:1.05,marginBottom:2}}>
          Good afternoon,<br/><em>Alex.</em>
        </div>
      </div>

      <div className="g2" style={{gap:20,alignItems:"start"}}>
        <div>
          <div style={{fontFamily:"var(--ff-m)",fontSize:9,letterSpacing:2,textTransform:"uppercase",color:"var(--ink3)",marginBottom:8}}>Upcoming Assignments & Tests</div>
          {upcoming.map((e,i)=>(
            <div key={e.id} className={`ar bg-${e.priority}`} style={{animationDelay:`${i*0.04}s`}}>
              <div style={{flex:1,minWidth:0}}>
                <div className="an">{e.name}</div>
                <div className="am">{e.date}{e.blockScreen?" · 🔒":""}</div>
              </div>
              <span className={`tag t-${e.priority}`}>{e.priority==="test"?"TEST":e.priority.toUpperCase()}</span>
            </div>
          ))}
        </div>
        <div>
          <div style={{fontFamily:"var(--ff-m)",fontSize:9,letterSpacing:2,textTransform:"uppercase",color:"var(--ink3)",marginBottom:8}}>Upcoming Focus Blocks</div>
          {blocked.length===0 ? (
            <div style={{padding:"16px",textAlign:"center",color:"var(--ink3)",fontSize:13,background:"var(--surface)",border:"1px solid var(--border)",borderRadius:"var(--r)"}}>No blocked sessions scheduled</div>
          ) : blocked.map((s,i)=>(
            <div key={s.id} style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:"var(--r)",padding:"10px 13px",marginBottom:5,display:"flex",alignItems:"center",gap:10}}>
              <Lock size={13} style={{color:"var(--ink3)",flexShrink:0}}/>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:600}}>{s.name}</div>
                <div style={{fontFamily:"var(--ff-m)",fontSize:10,color:"var(--ink3)"}}>{s.date}</div>
              </div>
              <span className={`tag t-${s.priority}`}>{s.priority.toUpperCase()}</span>
            </div>
          ))}

          <div style={{marginTop:20}}>
            <div style={{fontFamily:"var(--ff-m)",fontSize:9,letterSpacing:2,textTransform:"uppercase",color:"var(--ink3)",marginBottom:8}}>At a Glance</div>
            <div className="g2" style={{gap:8}}>
              {[["3.72","Weighted GPA"],["3.25","Unweighted GPA"],["6","Classes"],["5","Due This Week"]].map(([v,l])=>(
                <div key={l} style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:"var(--r)",padding:"12px 14px"}}>
                  <div style={{fontFamily:"var(--ff-d)",fontSize:26,fontWeight:900,letterSpacing:"-1px"}}>{v}</div>
                  <div style={{fontFamily:"var(--ff-m)",fontSize:9,color:"var(--ink3)",textTransform:"uppercase",letterSpacing:1,marginTop:2}}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── CALENDAR ────────────────────────────────────────────── */
function CalendarPage({ events, setEvents }) {
  const [month, setMonth] = useState(1);
  const [year] = useState(2026);
  const [popDay, setPopDay] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newEv, setNewEv] = useState({name:"",date:"",priority:"med",blockScreen:false});
  const popContainerRef = useRef(null);
  const MN = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  useEffect(()=>{
    const h = e => { if(popContainerRef.current && !popContainerRef.current.contains(e.target)) setPopDay(null); };
    document.addEventListener("mousedown",h);
    return ()=>document.removeEventListener("mousedown",h);
  },[]);

  const first = new Date(year,month,1).getDay();
  const dim = new Date(year,month+1,0).getDate();
  const cells = [];
  for(let i=0;i<first;i++) cells.push({d:null,other:true});
  for(let i=1;i<=dim;i++) cells.push({d:i,other:false});
  while(cells.length%7!==0) cells.push({d:null,other:true});

  const getEvts = d => {
    if(!d) return [];
    const ds = `${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    return events.filter(e=>e.date===ds);
  };

  const addEvent = () => {
    const conflict = events.find(e=>e.date===newEv.date);
    if(conflict) {
      if(!window.confirm(`⚠️ "${conflict.name}" is already on this date. Add anyway?`)) return;
    }
    setEvents(prev=>[...prev,{...newEv,id:Date.now()}]);
    setShowAdd(false);
    setNewEv({name:"",date:"",priority:"med",blockScreen:false});
  };

  return (
    <div className="page fu">
      <div className="ph">
        <div className="ph-row">
          <div>
            <div className="ph-title">Calendar</div>
            <div className="ph-sub">{MN[month]} {year} · {events.length} events</div>
          </div>
          <button className="btn btn-dark" onClick={()=>setShowAdd(true)}><Plus size={13}/>Add Event</button>
        </div>
      </div>

      <div className="cal-key">
        <span style={{fontFamily:"var(--ff-m)",fontSize:9,letterSpacing:2,textTransform:"uppercase",color:"var(--ink3)"}}>KEY</span>
        {[["high","Urgent HW","#fde0e0","var(--red)"],["med","Normal HW","#fde8d8","var(--orange)"],["low","Study / Event","#e0f3e8","var(--green)"],["test","Test / Quiz","#dde8f8","var(--blue)"]].map(([k,l,bg,c])=>(
          <div key={k} className="ck-item"><div className="ck-swatch" style={{background:bg,border:`1px solid ${c}`}}/>{l}</div>
        ))}
        <div className="ck-item"><Lock size={9} style={{color:"var(--ink3)"}}/> Screen blocked</div>
      </div>

      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
        <button className="btn btn-out btn-sm" onClick={()=>setMonth(m=>Math.max(0,m-1))}><ChevronLeft size={12}/></button>
        <div style={{fontFamily:"var(--ff-d)",fontSize:18,fontWeight:700,letterSpacing:"-0.3px"}}>{MN[month]} {year}</div>
        <button className="btn btn-out btn-sm" onClick={()=>setMonth(m=>Math.min(11,m+1))}><ChevronRight size={12}/></button>
      </div>

      <div className="cal-hd">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=><div key={d} className="cal-dow">{d}</div>)}
      </div>
      <div className="cal-grid" ref={popContainerRef}>
        {cells.map((c,i)=>{
          const evts = getEvts(c.d);
          const isToday = c.d===23&&month===1;
          const visible = evts.slice(0,2);
          const overflow = evts.length-2;
          const isPopped = popDay===`${i}`;
          return (
            <div key={i} className={`cal-cell ${isToday?"today":""} ${c.other?"other":""}`} style={{position:"relative"}}
              onClick={()=>c.d&&setPopDay(isPopped?null:`${i}`)}>
              {c.d && <div className="cal-num">{c.d}</div>}
              {visible.map(e=>(
                <div key={e.id} className={`cal-ev ${e.priority}`}>
                  {e.blockScreen&&<Lock size={7}/>}
                  <span>{e.name}</span>
                </div>
              ))}
              {overflow>0 && <div className="cal-more">+{overflow} more</div>}
              {isPopped && evts.length>0 && (
                <div className="day-pop sd" style={{left:i%7>3?"auto":"0",right:i%7>3?"0":"auto"}}
                  onClick={e=>e.stopPropagation()}>
                  <div className="dp-date">{MN[month]} {c.d}</div>
                  {evts.map(e=>(
                    <div key={e.id} style={{display:"flex",alignItems:"center",gap:6,marginBottom:5,fontSize:12}}>
                      <span style={{width:6,height:6,borderRadius:1,background:e.priority==="high"?"var(--red)":e.priority==="med"?"var(--orange)":e.priority==="low"?"var(--green)":"var(--blue)",flexShrink:0}}/>
                      <span style={{flex:1,fontWeight:500}}>{e.name}</span>
                      {e.blockScreen&&<Lock size={9} style={{color:"var(--ink3)"}}/>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showAdd && (
        <div className="ov" onClick={e=>e.target===e.currentTarget&&setShowAdd(false)}>
          <div className="modal sd">
            <div className="mt">Add Event</div>
            <div className="fg"><label className="fl">Name</label><input className="fi" value={newEv.name} onChange={e=>setNewEv({...newEv,name:e.target.value})} placeholder="e.g. Chemistry Test"/></div>
            <div className="g2"><div className="fg"><label className="fl">Date</label><input type="date" className="fi" value={newEv.date} onChange={e=>setNewEv({...newEv,date:e.target.value})}/></div>
            <div className="fg"><label className="fl">Priority</label><select className="fs" value={newEv.priority} onChange={e=>setNewEv({...newEv,priority:e.target.value})}>
              <option value="high">High — Urgent</option><option value="med">Medium</option><option value="low">Low / Study</option><option value="test">Test / Quiz</option>
            </select></div></div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
              <label className="tog"><input type="checkbox" checked={newEv.blockScreen} onChange={e=>setNewEv({...newEv,blockScreen:e.target.checked})}/><span className="tog-t"/></label>
              <span style={{fontSize:13}}>Block screen time during this event</span>
            </div>
            <div className="btn-row">
              <button className="btn btn-dark" style={{flex:1}} disabled={!newEv.name||!newEv.date} onClick={addEvent}>Add to Calendar</button>
              <button className="btn btn-out" onClick={()=>setShowAdd(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── GRADES ──────────────────────────────────────────────── */
function GradesPage() {
  const [sel, setSel] = useState(null);
  const cls = CLASSES.find(c=>c.id===sel);

  if(cls) return (
    <div className="page fu">
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16,cursor:"pointer",color:"var(--ink3)",fontSize:12,fontFamily:"var(--ff-m)"}} onClick={()=>setSel(null)}>
        <ChevronLeft size={13}/>Back to all classes
      </div>
      <div className="gd-top">
        <div className="gd-letter" style={{color:lColor(cls.letter)}}>{cls.letter}</div>
        <div style={{flex:1}}>
          <div className="gd-nm">{cls.name}</div>
          <div style={{fontSize:13,color:"var(--ink2)",marginBottom:8}}>{cls.pct}% · {cls.code}</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            <span className={`tag t-${cls.type==="AP"?"ap":cls.type==="HN"?"hn":"reg"}`}>{cls.type}</span>
            <span className="tag t-reg">Weighted GP: {cls.wGP}</span>
            <span className="tag t-reg">Unweighted GP: {cls.uGP}</span>
          </div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontFamily:"var(--ff-d)",fontSize:52,fontWeight:900,letterSpacing:"-2px",color:lColor(cls.letter),lineHeight:1}}>{cls.pct}%</div>
          <div className="pb" style={{width:110,marginLeft:"auto",marginTop:6,height:5}}><div className="pf" style={{width:`${cls.pct}%`,background:pColor(cls.pct)}}/></div>
        </div>
      </div>
      {["Final","Summative","Formative"].map(type=>{
        const items = cls.assignments.filter(a=>a.type===type);
        if(!items.length) return null;
        const w = {Final:"40%",Summative:"45%",Formative:"15%"};
        return (
          <div key={type}>
            <div className="sec-label">{type} · {w[type]} weight</div>
            {items.map((a,i)=>(
              <div key={i} className="gd-row">
                <div className="gd-n">{a.name}</div>
                <div className="gd-d">{a.date}</div>
                <div className="gd-s" style={{color:pColor((a.score/a.total)*100)}}>{a.score}/{a.total}</div>
                <div className="gd-pct">{Math.round((a.score/a.total)*100)}%</div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="page fu">
      <div className="ph">
        <div className="ph-title">Grades</div>
        <div className="ph-sub">Spring 2026 · {CLASSES.length} classes · click to expand</div>
      </div>
      <div className="class-grid">
        {CLASSES.map(c=>(
          <div key={c.id} className={`cc ${lClass(c.letter)}`} onClick={()=>setSel(c.id)}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
              <div><div className="cc-code">{c.code}</div><div className="cc-name">{c.name}</div></div>
              <span className={`tag t-${c.type==="AP"?"ap":c.type==="HN"?"hn":"reg"}`}>{c.type}</span>
            </div>
            <div style={{display:"flex",alignItems:"flex-end",gap:8}}>
              <div className="cc-letter" style={{color:lColor(c.letter)}}>{c.letter}</div>
              <div><div className="cc-pct">{c.pct}%</div><div className="cc-gp">GP {c.wGP}W / {c.uGP}U</div></div>
            </div>
            <div className="pb" style={{marginTop:10}}><div className="pf" style={{width:`${c.pct}%`,background:pColor(c.pct)}}/></div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── GPA ─────────────────────────────────────────────────── */
function GPAPage() {
  const [classes, setClasses] = useState(CLASSES);
  const [showAdd, setShowAdd] = useState(false);
  const [showWI, setShowWI] = useState(false);
  const [nc, setNc] = useState({name:"",type:"AP",pct:90});
  const [wiCid, setWiCid] = useState(CLASSES[0].id);
  const [wiAsgn, setWiAsgn] = useState("");
  const [wiType, setWiType] = useState("Summative");
  const [wiTotal, setWiTotal] = useState(100);
  const [wiTarget, setWiTarget] = useState(90);

  const wgpa = calcW(classes);
  const ugpa = calcU(classes);
  const drag = classes.filter(c=>c.pct<85).sort((a,b)=>a.pct-b.pct);

  const addCls = () => {
    const l = nc.pct>=93?"A":nc.pct>=90?"A-":nc.pct>=87?"B+":nc.pct>=83?"B":nc.pct>=80?"B-":"C+";
    const bonus={AP:1,HN:0.5,REG:0};
    const base=nc.pct>=93?4:nc.pct>=90?3.7:nc.pct>=87?3.3:nc.pct>=83?3:nc.pct>=80?2.7:2.3;
    setClasses(prev=>[...prev,{...nc,id:Date.now(),letter:l,code:"NEW",wGP:base+(bonus[nc.type]||0),uGP:base,assignments:[]}]);
    setShowAdd(false); setNc({name:"",type:"AP",pct:90});
  };

  const wiCls = classes.find(c=>c.id===wiCid);
  const weights = {Final:0.4,Summative:0.45,Formative:0.15};
  const avgOf = type => {
    const items = wiCls?.assignments.filter(a=>a.type===type)||[];
    return items.length ? items.reduce((s,a)=>s+(a.score/a.total)*100,0)/items.length : 0;
  };
  let otherScore = 0;
  if(wiType==="Formative") otherScore = avgOf("Summative")*0.45+avgOf("Final")*0.40;
  if(wiType==="Summative") otherScore = avgOf("Formative")*0.15+avgOf("Final")*0.40;
  if(wiType==="Final") otherScore = avgOf("Formative")*0.15+avgOf("Summative")*0.45;
  const needed = Math.max(0,Math.min(100,((wiTarget-otherScore)/(weights[wiType]||0.45)).toFixed(1)));
  const neededPts = ((needed/100)*wiTotal).toFixed(1);

  return (
    <div className="page fu">
      <div className="ph">
        <div className="ph-row">
          <div><div className="ph-title">GPA Calculator</div><div className="ph-sub">Spring 2026</div></div>
          <div className="btn-row">
            <button className="btn btn-out btn-sm" onClick={()=>setShowWI(true)}>What do I need?</button>
            <button className="btn btn-dark btn-sm" onClick={()=>setShowAdd(true)}><Plus size={12}/>Add Class</button>
          </div>
        </div>
      </div>

      <div className="g2" style={{marginBottom:16}}>
        <div className="gpa-card">
          <div className="gpa-lbl">Weighted GPA</div>
          <div className="gpa-num">{wgpa}</div>
          <div className="gpa-sub">AP +1.0 · Honors +0.5</div>
          <div className="pb" style={{marginTop:12,height:5,borderRadius:3}}>
            <div className="pf" style={{width:`${(parseFloat(wgpa)/5)*100}%`,background:parseFloat(wgpa)>=4.2?"var(--green)":"var(--orange)"}}/>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",fontFamily:"var(--ff-m)",fontSize:9,color:"var(--ink3)",marginTop:3}}><span>0.0</span><span>/ 5.0</span></div>
        </div>
        <div className="gpa-card">
          <div className="gpa-lbl">Unweighted GPA</div>
          <div className="gpa-num">{ugpa}</div>
          <div className="gpa-sub">Standard 4.0 scale</div>
          <div className="pb" style={{marginTop:12,height:5,borderRadius:3}}>
            <div className="pf" style={{width:`${(parseFloat(ugpa)/4)*100}%`,background:parseFloat(ugpa)>=3.5?"var(--green)":"var(--orange)"}}/>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",fontFamily:"var(--ff-m)",fontSize:9,color:"var(--ink3)",marginTop:3}}><span>0.0</span><span>/ 4.0</span></div>
        </div>
      </div>

      {drag.length>0 && (
        <div className="card" style={{marginBottom:14}}>
          <div className="ch"><div className="ct" style={{display:"flex",alignItems:"center",gap:6}}><AlertTriangle size={13} style={{color:"var(--red)"}}/>Pulling Your GPA Down</div></div>
          {drag.map(c=>(
            <div key={c.id} className="drag-row">
              <div style={{flex:1,fontSize:13,fontWeight:500}}>{c.name}</div>
              <div style={{fontFamily:"var(--ff-m)",fontSize:11,color:"var(--red)"}}>{c.pct}% · {c.letter}</div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="ch"><div className="ct">All Classes</div></div>
        {classes.map(c=>(
          <div key={c.id} className="cls-row">
            <div style={{flex:1}}><div style={{fontSize:13,fontWeight:500}}>{c.name}</div><div style={{fontFamily:"var(--ff-m)",fontSize:9,color:"var(--ink3)"}}>{c.code}</div></div>
            <span className={`tag t-${c.type==="AP"?"ap":c.type==="HN"?"hn":"reg"}`}>{c.type}</span>
            <div style={{fontFamily:"var(--ff-m)",fontSize:12,fontWeight:500,width:42,textAlign:"right"}}>{c.pct}%</div>
            <div style={{fontFamily:"var(--ff-d)",fontSize:18,fontWeight:700,color:lColor(c.letter),width:28,textAlign:"center"}}>{c.letter}</div>
          </div>
        ))}
      </div>

      {showAdd && (
        <div className="ov" onClick={e=>e.target===e.currentTarget&&setShowAdd(false)}>
          <div className="modal sd">
            <div className="mt">Add Class</div>
            <div className="fg"><label className="fl">Class Name</label><input className="fi" value={nc.name} onChange={e=>setNc({...nc,name:e.target.value})} placeholder="e.g. AP Physics C"/></div>
            <div className="g2">
              <div className="fg"><label className="fl">Level</label><select className="fs" value={nc.type} onChange={e=>setNc({...nc,type:e.target.value})}><option value="AP">AP (+1.0)</option><option value="HN">Honors (+0.5)</option><option value="REG">Regular</option></select></div>
              <div className="fg"><label className="fl">Current Grade %</label><input type="number" className="fi" value={nc.pct} onChange={e=>setNc({...nc,pct:parseFloat(e.target.value)||0})} min={0} max={100}/></div>
            </div>
            <div style={{background:"var(--surface2)",borderRadius:"var(--r)",padding:"12px 14px",marginBottom:14}}>
              <div style={{fontFamily:"var(--ff-m)",fontSize:9,letterSpacing:1,textTransform:"uppercase",color:"var(--ink3)",marginBottom:6}}>GPA Preview After Adding</div>
              <div style={{display:"flex",gap:20}}>
                <div><div style={{fontSize:10,color:"var(--ink3)"}}>Weighted</div><div style={{fontFamily:"var(--ff-d)",fontSize:26,fontWeight:900}}>{calcW([...classes,{...nc,id:99}])}</div></div>
                <div><div style={{fontSize:10,color:"var(--ink3)"}}>Unweighted</div><div style={{fontFamily:"var(--ff-d)",fontSize:26,fontWeight:900}}>{calcU([...classes,{...nc,id:99}])}</div></div>
              </div>
            </div>
            <div className="btn-row">
              <button className="btn btn-dark" style={{flex:1}} onClick={addCls} disabled={!nc.name}>Add Class</button>
              <button className="btn btn-out" onClick={()=>setShowAdd(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showWI && (
        <div className="ov" onClick={e=>e.target===e.currentTarget&&setShowWI(false)}>
          <div className="modal sd">
            <div className="mt">What Do I Need?</div>
            <div className="fg"><label className="fl">Class</label><select className="fs" value={wiCid} onChange={e=>setWiCid(parseInt(e.target.value))}>{classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div className="fg"><label className="fl">Assignment Name</label><input className="fi" value={wiAsgn} onChange={e=>setWiAsgn(e.target.value)} placeholder="e.g. Unit 4 Test"/></div>
            <div className="g2">
              <div className="fg"><label className="fl">Type</label><select className="fs" value={wiType} onChange={e=>setWiType(e.target.value)}><option>Formative</option><option>Summative</option><option>Final</option></select></div>
              <div className="fg"><label className="fl">Worth (points)</label><input type="number" className="fi" value={wiTotal} onChange={e=>setWiTotal(parseInt(e.target.value)||100)}/></div>
            </div>
            <div className="fg"><label className="fl">I want a ___% in this class</label><input type="number" className="fi" value={wiTarget} onChange={e=>setWiTarget(parseInt(e.target.value)||0)} min={0} max={100}/></div>
            <div className="what-result">
              <div className="wr-lbl">You need</div>
              <div className="wr-num">{needed}%</div>
              <div className="wr-sub">{neededPts} out of {wiTotal} pts on {wiAsgn||"this assignment"}</div>
              {needed>=100 && <div style={{marginTop:8,fontSize:11,color:"#c0392b",background:"rgba(192,57,43,0.15)",borderRadius:4,padding:"5px 10px"}}>This target may not be achievable with one assignment.</div>}
            </div>
            <button className="btn btn-out" style={{width:"100%"}} onClick={()=>setShowWI(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── SCREEN TIME ─────────────────────────────────────────── */
function ScreenTimePage() {
  const [blocked, setBlocked] = useState(["Instagram","TikTok","YouTube"]);
  const [active, setActive] = useState(false);
  const [onBreak, setOnBreak] = useState(false);
  const [secs, setSecs] = useState(0);
  const [totalSecs, setTotalSecs] = useState(0);
  const [showStart, setShowStart] = useState(false);
  const [showAddT, setShowAddT] = useState(false);
  const [addMins, setAddMins] = useState(15);
  const [selDur, setSelDur] = useState(50);
  const [isPomo, setIsPomo] = useState(false);
  const [pomoWork, setPomoWork] = useState(25);
  const [pomoBrk, setPomoBrk] = useState(5);
  const [pomoPhase, setPomoPhase] = useState("work");
  const [pomoSecs, setPomoSecs] = useState(25*60);
  const [customH, setCustomH] = useState(1);
  const [customM, setCustomM] = useState(0);
  const ref = useRef(null);

  useEffect(()=>{
    if(active&&!onBreak){
      ref.current=setInterval(()=>{
        setSecs(s=>s+1);
        if(isPomo) setPomoSecs(ps=>{ if(ps<=1){setPomoPhase(p=>{ const np=p==="work"?"break":"work"; setPomoSecs(np==="work"?pomoWork*60:pomoBrk*60); return np; }); return ps;} return ps-1; });
      },1000);
    } else clearInterval(ref.current);
    return()=>clearInterval(ref.current);
  },[active,onBreak,isPomo,pomoWork,pomoBrk]);

  const timeLeft = Math.max(0,totalSecs-secs);
  const pct = totalSecs>0?Math.min(100,(secs/totalSecs)*100):0;

  const start = () => {
    const dur = selDur==="custom"?(customH*60+customM)*60:selDur*60;
    setTotalSecs(dur); setSecs(0); setPomoSecs(pomoWork*60); setPomoPhase("work");
    setActive(true); setOnBreak(false); setShowStart(false);
  };

  const end = () => { setActive(false); setSecs(0); setTotalSecs(0); };

  return (
    <div className="page fu">
      <div className="ph">
        <div className="ph-title">Screen Time</div>
        <div className="ph-sub">Block apps · stay focused</div>
      </div>

      {active ? (
        <div className="opal sd">
          <div className="opal-status">{onBreak?"ON BREAK":isPomo?`POMODORO · ${pomoPhase.toUpperCase()}`:"FOCUS SESSION"}</div>
          <div className="opal-title" style={{fontStyle:"italic"}}>{onBreak?"Resting.":isPomo&&pomoPhase==="break"?"Take a breath.":"Focus."}</div>
          <div className="opal-time">
            {isPomo ? `${fmtT(pomoSecs)} until ${pomoPhase==="work"?"break":"focus"} · session ${fmtT(secs)}` : `${fmtT(timeLeft)} remaining · ${fmtT(secs)} elapsed`}
          </div>
          <div className="pb" style={{background:"rgba(255,255,255,0.08)",marginBottom:18,height:3}}>
            <div className="pf" style={{width:`${pct}%`,background:"rgba(255,255,255,0.5)"}}/>
          </div>
          <div className="btn-row">
            {onBreak
              ? <button className="btn" style={{background:"#fff",color:"var(--ink)"}} onClick={()=>setOnBreak(false)}>▶ Resume</button>
              : <button className="btn" style={{background:"rgba(255,255,255,0.08)",color:"#888",border:"1px solid rgba(255,255,255,0.1)"}} onClick={()=>setOnBreak(true)}>⏸ Break</button>}
            <button className="btn" style={{background:"rgba(255,255,255,0.06)",color:"#666",border:"1px solid rgba(255,255,255,0.08)"}} onClick={()=>setShowAddT(true)}>+ Add Time</button>
            <button className="btn btn-red" onClick={end}>■ End</button>
          </div>
        </div>
      ) : (
        <div className="opal opal-idle">
          <div className="opal-status">NO ACTIVE SESSION</div>
          <div className="opal-title" style={{fontStyle:"italic",fontFamily:"var(--ff-d)"}}>Ready when you are.</div>
          <div className="opal-time">{blocked.length} apps will be blocked</div>
          <button className="btn btn-dark" style={{padding:"10px 22px",fontSize:14}} onClick={()=>setShowStart(true)}>
            Start Focus Session <ArrowRight size={13}/>
          </button>
        </div>
      )}

      <div className="card">
        <div className="ch"><div className="ct">Apps to Block</div><span style={{fontFamily:"var(--ff-m)",fontSize:10,color:"var(--ink3)"}}>{blocked.length} selected</span></div>
        <div className="app-grid">
          {APPS.map(a=>(
            <div key={a.name} className={`app-tile ${blocked.includes(a.name)?"on":""}`} onClick={()=>setBlocked(p=>p.includes(a.name)?p.filter(x=>x!==a.name):[...p,a.name])}>
              <div className="app-icon">{a.icon}</div>
              <div className="app-nm">{a.name}</div>
            </div>
          ))}
        </div>
      </div>

      {showStart && (
        <div className="ov" onClick={e=>e.target===e.currentTarget&&setShowStart(false)}>
          <div className="modal sd">
            <div className="mt">Start Focus Session</div>
            <div style={{fontFamily:"var(--ff-m)",fontSize:9,letterSpacing:2,textTransform:"uppercase",color:"var(--ink3)",marginBottom:8}}>Duration</div>
            <div className="g4" style={{marginBottom:12}}>
              {[25,50,90,"custom"].map(d=>(
                <div key={d} className={`dur-btn ${selDur===d?"on":""}`} onClick={()=>setSelDur(d)}>
                  {d==="custom"?"Custom":`${d}m`}
                </div>
              ))}
            </div>
            {selDur==="custom" && (
              <div className="g2" style={{marginBottom:12}}>
                <div className="fg" style={{marginBottom:0}}><label className="fl">Hours</label><input type="number" className="fi" value={customH} onChange={e=>setCustomH(parseInt(e.target.value)||0)} min={0} max={8}/></div>
                <div className="fg" style={{marginBottom:0}}><label className="fl">Minutes</label><input type="number" className="fi" value={customM} onChange={e=>setCustomM(parseInt(e.target.value)||0)} min={0} max={59}/></div>
              </div>
            )}
            <div className="dv"/>
            <div style={{fontFamily:"var(--ff-m)",fontSize:9,letterSpacing:2,textTransform:"uppercase",color:"var(--ink3)",marginBottom:8}}>Mode</div>
            <div className={`pomo-opt ${!isPomo?"on":""}`} onClick={()=>setIsPomo(false)}>
              <div className="pomo-opt-t">Standard</div>
              <div className="pomo-opt-s">Block apps for the full duration</div>
            </div>
            <div className={`pomo-opt ${isPomo?"on":""}`} onClick={()=>setIsPomo(true)}>
              <div className="pomo-opt-t">🍅 Pomodoro</div>
              <div className="pomo-opt-s">{pomoWork}min focus · {pomoBrk}min break · repeat</div>
            </div>
            {isPomo && (
              <div className="g2" style={{marginTop:8}}>
                <div className="fg" style={{marginBottom:0}}><label className="fl">Work (min)</label><input type="number" className="fi" value={pomoWork} onChange={e=>setPomoWork(parseInt(e.target.value)||25)} min={5} max={60}/></div>
                <div className="fg" style={{marginBottom:0}}><label className="fl">Break (min)</label><input type="number" className="fi" value={pomoBrk} onChange={e=>setPomoBrk(parseInt(e.target.value)||5)} min={1} max={30}/></div>
              </div>
            )}
            <div className="dv"/>
            <div style={{background:"var(--surface2)",borderRadius:"var(--r)",padding:"10px 13px",marginBottom:14,fontSize:12,color:"var(--ink3)"}}>
              <strong style={{color:"var(--ink)"}}>{blocked.length} apps blocked:</strong> {blocked.slice(0,4).join(", ")}{blocked.length>4?` +${blocked.length-4}`:""}</div>
            <div className="btn-row">
              <button className="btn btn-dark" style={{flex:1}} onClick={start}>Start →</button>
              <button className="btn btn-out" onClick={()=>setShowStart(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showAddT && (
        <div className="ov" onClick={e=>e.target===e.currentTarget&&setShowAddT(false)}>
          <div className="modal sd" style={{width:320}}>
            <div className="mt">Add Time</div>
            <div style={{display:"flex",gap:6,marginBottom:14}}>
              {[5,10,15,30].map(m=><div key={m} className={`dur-btn ${addMins===m?"on":""}`} style={{flex:1}} onClick={()=>setAddMins(m)}>{m}m</div>)}
            </div>
            <div className="fg"><label className="fl">Custom (minutes)</label><input type="number" className="fi" value={addMins} onChange={e=>setAddMins(parseInt(e.target.value)||0)}/></div>
            <div className="btn-row">
              <button className="btn btn-dark" style={{flex:1}} onClick={()=>{setTotalSecs(t=>t+addMins*60);setShowAddT(false);}}>Add {addMins} min</button>
              <button className="btn btn-out" onClick={()=>setShowAddT(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── IMPORTER ────────────────────────────────────────────── */
function ImporterPage({ setEvents }) {
  const [tab, setTab] = useState(0);
  const [schoUrl, setSchoUrl] = useState("");
  const [schoStatus, setSchoStatus] = useState("idle");
  const [schoError, setSchoError] = useState("");
  const [schoResult, setSchoResult] = useState([]);
  const [schoChecked, setSchoChecked] = useState({});
  const [pastedText, setPastedText] = useState("");
  const [textStatus, setTextStatus] = useState("idle");
  const [textResult, setTextResult] = useState([]);
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfStatus, setPdfStatus] = useState("idle");
  const [pdfResult, setPdfResult] = useState([]);
  const [imgFile, setImgFile] = useState(null);
  const [imgStatus, setImgStatus] = useState("idle");
  const [imgResult, setImgResult] = useState([]);
  const [checked, setChecked] = useState({});

  const tabs = [
    {label:"Schoology",icon:<Link size={12}/>},
    {label:"Paste Text",icon:<FileText size={12}/>},
    {label:"Upload PDF",icon:<Upload size={12}/>},
    {label:"Photo",icon:<Image size={12}/>},
  ];

  const analyzeText = async (text) => {
    const response = await fetch("https://api.anthropic.com/v1/messages",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        model:"claude-sonnet-4-20250514",
        max_tokens:1000,
        messages:[{role:"user",content:`You are a school assignment extractor. Given the following text from a teacher's agenda or assignment description, extract all assignments, tests, and important events.

Return ONLY a valid JSON array with no other text. Each item should have:
- "name": string (assignment or event name)
- "date": string (e.g. "Feb 28" or "Mar 3" — use 2026 context, current month is February 2026)
- "priority": "high" | "med" | "low" | "test"
- "subject": string (inferred subject if possible)

Text to analyze:
"""
${text}
"""

Return only the JSON array, nothing else.`}]
      })
    });
    const data = await response.json();
    const txt = data.content?.map(b=>b.text||"").join("")||"";
    return JSON.parse(txt.replace(/```json|```/g,"").trim());
  };

  const handleTextAnalyze = async () => {
    if(!pastedText.trim()) return;
    setTextStatus("loading");
    try {
      const result = await analyzeText(pastedText);
      setTextResult(result);
      setChecked(Object.fromEntries(result.map((_,i)=>[i,true])));
      setTextStatus("done");
    } catch(e) {
      setTextStatus("error");
    }
  };

  const handlePdfUpload = async (file) => {
    if(!file) return;
    setPdfFile(file);
    setPdfStatus("loading");
    try {
      const b64 = await new Promise((res,rej)=>{
        const r = new FileReader();
        r.onload=()=>res(r.result.split(",")[1]);
        r.onerror=()=>rej(new Error("Read failed"));
        r.readAsDataURL(file);
      });
      const response = await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:1000,
          messages:[{role:"user",content:[
            {type:"document",source:{type:"base64",media_type:"application/pdf",data:b64}},
            {type:"text",text:`Extract all assignments, tests, and events from this document. Return ONLY a valid JSON array. Each item: {"name":"...","date":"...","priority":"high|med|low|test","subject":"..."}. Use Feb 2026 context for relative dates. No other text.`}
          ]}]
        })
      });
      const data = await response.json();
      const text = data.content?.map(b=>b.text||"").join("")||"";
      const result = JSON.parse(text.replace(/```json|```/g,"").trim());
      setPdfResult(result);
      setChecked(Object.fromEntries(result.map((_,i)=>[i,true])));
      setPdfStatus("done");
    } catch(e) {
      setPdfStatus("error");
    }
  };

  const handleImgUpload = async (file) => {
    if(!file) return;
    setImgFile(file);
    setImgStatus("loading");
    try {
      const b64 = await new Promise((res,rej)=>{
        const r = new FileReader();
        r.onload=()=>res(r.result.split(",")[1]);
        r.onerror=()=>rej(new Error("Read failed"));
        r.readAsDataURL(file);
      });
      const mt = file.type || "image/jpeg";
      const response = await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:1000,
          messages:[{role:"user",content:[
            {type:"image",source:{type:"base64",media_type:mt,data:b64}},
            {type:"text",text:`Read this photo of a whiteboard or assignment sheet. Extract all visible assignments, tests, and deadlines. Return ONLY a valid JSON array. Each item: {"name":"...","date":"...","priority":"high|med|low|test","subject":"..."}. Use Feb 2026 context for relative dates. No other text.`}
          ]}]
        })
      });
      const data = await response.json();
      const text = data.content?.map(b=>b.text||"").join("")||"";
      const result = JSON.parse(text.replace(/```json|```/g,"").trim());
      setImgResult(result);
      setChecked(Object.fromEntries(result.map((_,i)=>[i,true])));
      setImgStatus("done");
    } catch(e) {
      setImgStatus("error");
    }
  };

  const parseICal = (raw) => {
    const events = [];
    const blocks = raw.split("BEGIN:VEVENT").slice(1);
    blocks.forEach(block => {
      const get = (key) => {
        const unfolded = block.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
        const match = unfolded.match(new RegExp(`${key}[^:]*:([^\r\n]+)`));
        return match ? match[1].trim() : "";
      };
      const summary = get("SUMMARY").replace(/\\,/g, ",").replace(/\\n/g, " ").replace(/\\;/g, ";").trim();
      const dtstart = get("DTSTART");
      const description = get("DESCRIPTION").replace(/\\n/g, " ").replace(/\\,/g, ",");
      if (!summary || !dtstart) return;
      const dateStr = dtstart.replace(/T.*/, "");
      const year = dateStr.slice(0, 4);
      const month = dateStr.slice(4, 6);
      const day = dateStr.slice(6, 8);
      const isoDate = `${year}-${month}-${day}`;
      const combined = (summary + " " + description).toLowerCase();
      let priority = "med";
      if (/\btest\b|\bexam\b|\bquiz\b|\bmidterm\b|\bfinal\b/.test(combined)) priority = "test";
      else if (/\burgent\b|\bdue today\b|\boverdue\b/.test(combined)) priority = "high";
      else if (/\breadings?\b|\bnotes?\b|\boptional\b/.test(combined)) priority = "low";
      const subjectMap = {
        "calc|math|algebra|geometry|statistics": "Math",
        "bio|biology|science|lab|chemistry|chem|physics": "Science",
        "english|essay|writing|lit|literature|reading": "English",
        "history|social|apush|gov|economics|econ": "History",
        "spanish|french|latin|language|chinese": "Language",
        "art|music|pe|health|gym": "Elective",
      };
      let subject = "";
      for (const [pattern, label] of Object.entries(subjectMap)) {
        if (new RegExp(pattern).test(combined)) { subject = label; break; }
      }
      events.push({ name: summary, date: isoDate, priority, subject, description });
    });
    return events.sort((a, b) => new Date(a.date) - new Date(b.date));
  };

  const handleSchoConnect = async () => {
    if (!schoUrl.trim()) return;
    setSchoStatus("loading");
    setSchoError("");
    setSchoResult([]);
    try {
      const fetchUrl = schoUrl.trim().replace(/^webcal:\/\//i, "https://");
      const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(fetchUrl)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `Server error ${res.status}`);
      }
      const icalText = await res.text();
      const parsed = parseICal(icalText);
      if (parsed.length === 0) {
        throw new Error("No events found in this calendar. It may be empty or the format is unsupported.");
      }
      setSchoResult(parsed);
      setSchoChecked(Object.fromEntries(parsed.map((_, i) => [i, true])));
      setSchoStatus("done");
    } catch (e) {
      setSchoError(e.message || "Something went wrong. Check the URL and try again.");
      setSchoStatus("error");
    }
  };

  const addSchoToCalendar = () => {
    const toAdd = schoResult
      .filter((_, i) => schoChecked[i] !== false)
      .map(r => ({
        id: Date.now() + Math.random(),
        name: r.name,
        date: r.date,
        priority: r.priority,
        blockScreen: false,
      }));
    setEvents(prev => [...prev, ...toAdd]);
    alert(`✓ Added ${toAdd.length} Schoology events to your calendar!`);
  };

  const addSelectedToCalendar = (results) => {
    const toAdd = results.filter((_,i)=>checked[i]!==false).map(r=>({
      id:Date.now()+Math.random(),
      name:r.name,
      date:`2026-${r.date?.includes("Mar")?"03":"02"}-${String(parseInt(r.date)||15).padStart(2,"0")}`,
      priority:r.priority||"med",
      blockScreen:false
    }));
    setEvents(prev=>[...prev,...toAdd]);
    alert(`✓ Added ${toAdd.length} events to your calendar!`);
  };

  const ResultList = ({results, status, onAdd}) => {
    if(status==="loading") return (
      <div className="ai-thinking sd">
        <Loader size={16} className="spin" style={{color:"var(--ink2)",flexShrink:0}}/>
        <div><div className="ai-t">AI is reading your content…</div><div className="ai-sub">Extracting assignments & dates</div></div>
      </div>
    );
    if(status==="error") return <div style={{color:"var(--red)",fontSize:13,padding:12,background:"#fdf0f0",borderRadius:"var(--r)",border:"1px solid #fbd0d0"}}>Failed to analyze. Check the content and try again.</div>;
    if(status!=="done") return null;
    return (
      <div className="sd">
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <div style={{fontFamily:"var(--ff-m)",fontSize:9,letterSpacing:2,textTransform:"uppercase",color:"var(--ink3)"}}>{results.length} events found</div>
          <button className="btn btn-sm btn-ghost" onClick={()=>setChecked(Object.fromEntries(results.map((_,i)=>[i,!Object.values(checked).every(v=>v)])))}>Toggle All</button>
        </div>
        {results.map((r,i)=>(
          <div key={i} className="ev-extracted">
            <div className={`ee-check ${checked[i]!==false?"checked":""}`} onClick={()=>setChecked(p=>({...p,[i]:!p[i]}))}>
              {checked[i]!==false&&"✓"}
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:500}}>{r.name}</div>
              <div style={{fontFamily:"var(--ff-m)",fontSize:10,color:"var(--ink3)",marginTop:1}}>{r.subject&&`${r.subject} · `}{r.date}</div>
            </div>
            <span className={`tag t-${r.priority}`}>{r.priority==="test"?"TEST":r.priority?.toUpperCase()}</span>
          </div>
        ))}
        <div style={{marginTop:10}} className="btn-row">
          <button className="btn btn-dark" style={{flex:1}} onClick={()=>onAdd(results)}>
            <Sparkles size={12}/>Add {Object.values(checked).filter(v=>v!==false).length} to Calendar
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="page fu">
      <div className="ph">
        <div className="ph-title">Calendar Importer</div>
        <div className="ph-sub">Import assignments from Schoology, documents, or photos</div>
      </div>

      <div className="imp-tab">
        {tabs.map((t,i)=>(
          <div key={i} className={`imp-t ${tab===i?"on":""}`} onClick={()=>setTab(i)}>
            {t.icon}{t.label}
          </div>
        ))}
      </div>

      {tab===0 && (
        <div className="card">
          <div className="ch"><div className="ct">Schoology iCal Sync</div></div>
          <div style={{fontSize:13,color:"var(--ink2)",marginBottom:16,lineHeight:1.6}}>
            In Schoology: go to <strong>Calendar → Export</strong>, copy the iCal URL, and paste it below. Option will import all your assignments and due dates automatically.
          </div>
          <div className="fg">
            <label className="fl">Schoology iCal URL</label>
            <input
              className="fi"
              value={schoUrl}
              onChange={e=>{ setSchoUrl(e.target.value); setSchoStatus("idle"); setSchoError(""); }}
              placeholder="https://app.schoology.com/ical/..."
            />
          </div>
          {schoStatus==="idle" && (
            <button className="btn btn-dark" disabled={!schoUrl.trim()} onClick={handleSchoConnect}>
              <Link size={12}/>Connect & Import →
            </button>
          )}
          {schoStatus==="loading" && (
            <div className="ai-thinking">
              <Loader size={15} className="spin" style={{color:"var(--ink2)",flexShrink:0}}/>
              <div>
                <div className="ai-t">Connecting to Schoology…</div>
                <div className="ai-sub">Fetching and parsing your calendar</div>
              </div>
            </div>
          )}
          {schoStatus==="error" && (
            <div style={{background:"#fdf0f0",border:"1px solid #f0b8b8",borderRadius:"var(--r)",padding:"12px 14px"}}>
              <div style={{fontSize:13,fontWeight:600,color:"var(--red)",marginBottom:4}}>⚠ Could not connect</div>
              <div style={{fontSize:12,color:"var(--red)"}}>{schoError}</div>
              <button className="btn btn-out btn-sm" style={{marginTop:10}} onClick={()=>setSchoStatus("idle")}>Try Again</button>
            </div>
          )}
          {schoStatus==="done" && schoResult.length>0 && (
            <div className="sd">
              <div style={{background:"#eef7f2",border:"1px solid #b0dcc2",borderRadius:"var(--r)",padding:"10px 14px",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{fontSize:13,fontWeight:600,color:"var(--green)"}}> ✓ {schoResult.length} events found</div>
                <button className="btn btn-ghost btn-sm" onClick={()=>setSchoStatus("idle")}>Change URL</button>
              </div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                <div style={{fontFamily:"var(--ff-m)",fontSize:9,letterSpacing:2,textTransform:"uppercase",color:"var(--ink3)"}}>Select events to import</div>
                <button className="btn btn-ghost btn-sm" onClick={()=>setSchoChecked(Object.fromEntries(schoResult.map((_,i)=>[i,!Object.values(schoChecked).every(v=>v)])))}>Toggle All</button>
              </div>
              <div style={{maxHeight:320,overflowY:"auto",marginBottom:12}}>
                {schoResult.map((r,i)=>(
                  <div key={i} className="ev-extracted">
                    <div className={`ee-check ${schoChecked[i]!==false?"checked":""}`} onClick={()=>setSchoChecked(p=>({...p,[i]:!p[i]}))}>
                      {schoChecked[i]!==false&&"✓"}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</div>
                      <div style={{fontFamily:"var(--ff-m)",fontSize:10,color:"var(--ink3)",marginTop:1}}>
                        {r.subject&&`${r.subject} · `}{r.date}
                      </div>
                    </div>
                    <span className={`tag t-${r.priority}`}>{r.priority==="test"?"TEST":r.priority.toUpperCase()}</span>
                  </div>
                ))}
              </div>
              <button className="btn btn-dark" style={{width:"100%"}} onClick={addSchoToCalendar}>
                <Sparkles size={12}/>
                Add {Object.values(schoChecked).filter(v=>v!==false).length} events to Calendar
              </button>
            </div>
          )}
          <div className="dv"/>
          <div style={{fontFamily:"var(--ff-m)",fontSize:9,letterSpacing:2,textTransform:"uppercase",color:"var(--ink3)",marginBottom:8}}>How to find your iCal URL in Schoology</div>
          {[
            "Log in to Schoology and click Calendar in the left sidebar.",
            "In the top-right corner of the Calendar view, click the gear ⚙ icon.",
            "Select Export Calendar from the dropdown menu.",
            "Copy the full iCal URL that appears and paste it above.",
          ].map((s,i)=>(
            <div key={i} style={{display:"flex",gap:10,marginBottom:7,fontSize:12,color:"var(--ink2)"}}>
              <span style={{fontFamily:"var(--ff-m)",color:"var(--ink4)",flexShrink:0,minWidth:14}}>{i+1}.</span>
              <span>{s}</span>
            </div>
          ))}
        </div>
      )}

      {tab===1 && (
        <div className="card">
          <div className="ch"><div className="ct">Paste Agenda Text</div></div>
          <div style={{fontSize:13,color:"var(--ink2)",marginBottom:14,lineHeight:1.6}}>
            Paste any text — a teacher's email, a copied agenda, or a list of assignments. The AI will extract dates, priorities, and create calendar events.
          </div>
          <div className="fg">
            <label className="fl">Paste text here</label>
            <textarea className="fi" value={pastedText} onChange={e=>setPastedText(e.target.value)}
              placeholder={"e.g.\nRead chapter 5-6 by Thursday\nQuiz on Friday covering unit 3\nLab report due next Monday..."}
              style={{minHeight:120,resize:"vertical",lineHeight:1.6}}/>
          </div>
          <button className="btn btn-dark" disabled={!pastedText.trim()||textStatus==="loading"} onClick={handleTextAnalyze}>
            {textStatus==="loading"?<><Loader size={12} className="spin"/>Analyzing…</>:<><Sparkles size={12}/>Analyze with AI</>}
          </button>
          {textStatus!=="idle" && <div style={{marginTop:14}}><ResultList results={textResult} status={textStatus} onAdd={addSelectedToCalendar}/></div>}
        </div>
      )}

      {tab===2 && (
        <div className="card">
          <div className="ch"><div className="ct">Upload PDF or Document</div></div>
          <div style={{fontSize:13,color:"var(--ink2)",marginBottom:14,lineHeight:1.6}}>
            Upload a teacher's syllabus, quarterly agenda, or assignment sheet. AI will read the document and extract all assignments.
          </div>
          <div className="dz" onClick={()=>document.getElementById("pdf-in").click()}>
            <input id="pdf-in" type="file" accept=".pdf,image/*" style={{display:"none"}} onChange={e=>handlePdfUpload(e.target.files[0])}/>
            <Upload size={28} style={{color:"var(--ink3)",margin:"0 auto 10px"}}/>
            <div style={{fontSize:14,fontWeight:500,marginBottom:4}}>{pdfFile?pdfFile.name:"Drop PDF or image here"}</div>
            <div style={{fontSize:12,color:"var(--ink3)"}}>PDF, JPG, PNG · click to browse</div>
          </div>
          {pdfStatus!=="idle" && <div style={{marginTop:14}}><ResultList results={pdfResult} status={pdfStatus} onAdd={addSelectedToCalendar}/></div>}
        </div>
      )}

      {tab===3 && (
        <div className="card">
          <div className="ch"><div className="ct">Photo of Whiteboard / Board</div></div>
          <div style={{fontSize:13,color:"var(--ink2)",marginBottom:14,lineHeight:1.6}}>
            Take a photo of assignments written on the board and upload it. AI will read the text and create calendar events from what it sees.
          </div>
          <div className="dz" onClick={()=>document.getElementById("img-in").click()}>
            <input id="img-in" type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleImgUpload(e.target.files[0])}/>
            <Image size={28} style={{color:"var(--ink3)",margin:"0 auto 10px"}}/>
            <div style={{fontSize:14,fontWeight:500,marginBottom:4}}>{imgFile?imgFile.name:"Upload a board photo"}</div>
            <div style={{fontSize:12,color:"var(--ink3)"}}>JPG, PNG, HEIC · click to browse or drop</div>
          </div>
          {imgStatus!=="idle" && <div style={{marginTop:14}}><ResultList results={imgResult} status={imgStatus} onAdd={addSelectedToCalendar}/></div>}
        </div>
      )}
    </div>
  );
}

/* ── SHELL ───────────────────────────────────────────────── */
export default function App() {
  const [page, setPage] = useState("home");
  const [events, setEvents] = useState(EVENTS_INIT);

  const NAV = [
    { id:"home",    label:"Home",         icon:<Home size={14}/> },
    { id:"calendar",label:"Calendar",     icon:<Calendar size={14}/> },
    { id:"grades",  label:"Grades",       icon:<BookOpen size={14}/> },
    { id:"gpa",     label:"GPA Calculator",icon:<Calculator size={14}/> },
    { id:"screentime",label:"Screen Time",icon:<Clock size={14}/> },
    { id:"importer",label:"Import Data",  icon:<FileText size={14}/> },
  ];

  return (
    <>
      <style>{CSS}</style>
      <div className="shell">
        <div className="sb">
          <div className="sb-logo">
            <div className="sb-wordmark">Option</div>
            <div className="sb-tagline">Student Dashboard</div>
          </div>
          <nav className="sb-nav">
            <div className="sb-sec">Menu</div>
            {NAV.map(n=>(
              <div key={n.id} className={`sb-item ${page===n.id?"on":""}`} onClick={()=>setPage(n.id)}>
                {n.icon}{n.label}
              </div>
            ))}
          </nav>
          <div className="sb-foot">
            <div className="sb-user">Alex · Spring 2026</div>
          </div>
        </div>
        <div className="main">
          {page === "home"       && <HomePage       events={events} />}
          {page === "calendar"   && <CalendarPage   events={events} setEvents={setEvents} />}
          {page === "grades"     && <GradesPage />}
          {page === "gpa"        && <GPAPage />}
          {page === "screentime" && <ScreenTimePage />}
          {page === "importer"   && <ImporterPage   setEvents={setEvents} />}
        </div>
      </div>
    </>
  );
}

//why are u looking at the code 
