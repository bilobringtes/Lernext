/* ============================================================
   NEXT LEVEL v2 · App-Logik mit Karrierepfaden
   © 2026 Bülent Uslu · Konzeptvorschau
   ============================================================ */

/* -------- STATUS-BAR (Uhrzeit/Signal/Akku), einmalig definiert und in jeden Screen geklont -------- */
const STATUS_BAR_HTML = `
        <span>9:41</span>
        <span class="right">
          <svg width="16" height="10" viewBox="0 0 16 10" fill="none"><path d="M1 5.5C3.5 3 6 1.5 8 1.5s4.5 1.5 7 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M3.5 7C5 5.5 6.5 4.7 8 4.7s3 .8 4.5 2.3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="8" cy="9" r="1" fill="currentColor"/></svg>
          <svg width="22" height="10" viewBox="0 0 22 10" fill="none"><rect x="0.5" y="0.5" width="18" height="9" rx="2.5" stroke="currentColor" stroke-opacity=".6"/><rect x="2" y="2" width="14" height="6" rx="1.2" fill="currentColor"/><rect x="19.5" y="3.5" width="1.5" height="3" rx=".5" fill="currentColor" opacity=".6"/></svg>
        </span>`;
document.querySelectorAll('[data-status-bar]').forEach(el => el.innerHTML = STATUS_BAR_HTML);

/* -------- STATE -------- */
const DEFAULT_STATE = { name:"Michael", level:7, xp:3250, streak:12, track:null, completedMissions:[], answers:[], missionProgress:{}, xpHistory:[], lastActiveDate:null, battlesWon:0, puzzlesCompleted:0, isAdmin:false, lastSeenMessageId:null, soundOn:true, hapticOn:true, brightness:100, filialeBilanz:{}, battleDifficulty:0.65 };

/* -------- KARRIERE-TITEL pro Track & Level -------- */
const CAREER_TITLES = {
  sales:      ["Sales Trainee","Junior Berater","Berater","Senior Berater","Sales Consultant","Senior Consultant","Account Manager","Key Account Manager","Sales Expert","Sales Lead"],
  service:    ["Service Trainee","Junior Support","Support Specialist","Senior Specialist","Service Consultant","Senior Consultant","Service Expert","Team Lead Service","Service Manager","Head of Service"],
  leadership: ["Nachwuchsführungskraft","Junior Manager","Teamleiter","Senior Teamleiter","Bereichsleiter","Senior Manager","Regionalleiter","Senior Regionalleiter","Direktor","Senior Direktor"],
};
function roleForLevel(track, level){
  const list = CAREER_TITLES[track] || CAREER_TITLES.sales;
  const idx = Math.max(0, Math.min(list.length - 1, level - 1));
  return list[idx];
}

/* -------- ANALYTICS (lokal, für Admin-Panel) -------- */
const AN_KEY = "nextlevel_analytics";
function loadAnalytics(){
  try{
    const raw = localStorage.getItem(AN_KEY);
    return raw ? JSON.parse(raw) : { missionStarts:{}, missionCompletions:{}, wrongAnswers:{}, battleStarts:0, battleDropoffs:0, trackUsage:{}, sessionCount:0, totalSessionMs:0 };
  }catch(e){ return { missionStarts:{}, missionCompletions:{}, wrongAnswers:{}, battleStarts:0, battleDropoffs:0, trackUsage:{}, sessionCount:0, totalSessionMs:0 }; }
}
let analytics = loadAnalytics();
function saveAnalytics(){ try{ localStorage.setItem(AN_KEY, JSON.stringify(analytics)); }catch(e){} }
function trackEvent(type, key){
  if(type === "missionStart"){ analytics.missionStarts[key] = (analytics.missionStarts[key]||0)+1; }
  else if(type === "missionComplete"){ analytics.missionCompletions[key] = (analytics.missionCompletions[key]||0)+1; }
  else if(type === "wrongAnswer"){ analytics.wrongAnswers[key] = (analytics.wrongAnswers[key]||0)+1; }
  else if(type === "battleStart"){ analytics.battleStarts++; }
  else if(type === "battleDropoff"){ analytics.battleDropoffs++; }
  else if(type === "trackUsage"){ analytics.trackUsage[key] = (analytics.trackUsage[key]||0)+1; }
  saveAnalytics();
}

/* -------- WEEKLY EVENT (Montag = doppelte XP) -------- */
function isWeeklyEventActive(){ return new Date().getDay() === 1; }
function weeklyMultiplier(){ return isWeeklyEventActive() ? 2 : 1; }

/* -------- FILIALE-BILANZ (Battle-Historie pro Filiale) -------- */
function getFilialeShort(team){
  return (team || "").replace(/^Filiale\s+/i, "").replace(/^Regionalleitung\s+/i, "");
}
function getFilialeBilanzText(oppTeam){
  const key = getFilialeShort(oppTeam);
  const b = (state.filialeBilanz && state.filialeBilanz[key]) || null;
  if(!b || (b.w + b.t + b.l) === 0) return `Erstes Aufeinandertreffen mit Filiale ${key}.`;
  return `Bilanz gegen ${key}: ${b.w} Sieg${b.w===1?'':'e'} · ${b.t} Unentschieden · ${b.l} Niederlage${b.l===1?'':'n'}`;
}
function recordFilialeBilanz(team, result){
  const key = getFilialeShort(team);
  if(!state.filialeBilanz) state.filialeBilanz = {};
  if(!state.filialeBilanz[key]) state.filialeBilanz[key] = { w:0, t:0, l:0 };
  if(result === "w") state.filialeBilanz[key].w++;
  else if(result === "t") state.filialeBilanz[key].t++;
  else state.filialeBilanz[key].l++;
}

/* -------- ADAPTIVE GEGNERSTÄRKE IM BATTLE-MODUS --------
   state.battleDifficulty = Trefferquote des Gegners (0.35 = leicht, 0.80 = schwer).
   Nach jedem Kampf leicht angepasst: Sieg -> etwas schwerer, Niederlage -> etwas leichter. */
function adjustBattleDifficulty(result){
  let d = state.battleDifficulty || 0.65;
  if(result === "w") d += 0.04;
  else if(result === "l") d -= 0.04;
  state.battleDifficulty = Math.max(0.35, Math.min(0.80, d));
}
function difficultyLabel(){
  const d = state.battleDifficulty || 0.65;
  if(d <= 0.45) return "Einsteiger";
  if(d <= 0.60) return "Ausgewogen";
  if(d <= 0.72) return "Herausfordernd";
  return "Experte";
}
let state = loadState();
let pendingTrack = null;

function loadState(){
  try{
    const raw = localStorage.getItem("nextlevel_user");
    if(!raw) return {...DEFAULT_STATE};
    return {...DEFAULT_STATE, ...JSON.parse(raw)};
  }catch(e){ return {...DEFAULT_STATE}; }
}
let saveStateWarned = false;
function saveState(){
  try{
    localStorage.setItem("nextlevel_user", JSON.stringify(state));
  }catch(e){
    if(!saveStateWarned){
      saveStateWarned = true;
      toast("⚠️ Fortschritt kann nicht gespeichert werden (Speicher voll oder privater Modus)");
    }
  }
}

/* ============================================================
   BACKEND-ANBINDUNG
   Sobald next-level-backend-phase1 auf einem echten Server läuft,
   hier die URL eintragen (z.B. "https://api.deine-domain.de/api") -
   oder im Admin-Modus (5x auf das Copyright tippen) eintragen, ohne
   dass der Code angefasst werden muss. Bis dahin läuft die App
   unverändert im lokalen Modus weiter - jeder Aufruf schlägt still
   fehl und der lokale Stand gilt.
   ============================================================ */
let API_BASE = localStorage.getItem("nextlevel_api_base") || "http://localhost:3000/api";

let authToken = localStorage.getItem("nextlevel_token");
let serverOnline = false;
let authMode = "login";

async function apiCall(path, options = {}){
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { "Authorization": "Bearer " + authToken } : {}),
      ...(options.headers || {})
    }
  });
  const data = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error || ("Fehler " + res.status));
  return data;
}

async function checkServer(){
  try{ await apiCall("/health"); serverOnline = true; }
  catch(e){ serverOnline = false; }
  updateServerPill();
  return serverOnline;
}

function updateServerPill(){
  const pill = document.getElementById("authServerPill");
  if(!pill) return;
  pill.classList.toggle("online", serverOnline);
  pill.classList.toggle("offline", !serverOnline);
  document.getElementById("authServerPillText").textContent =
    serverOnline ? "Server verbunden" : "Server nicht erreichbar – lokaler Modus";
}

function toggleAuthMode(){
  authMode = authMode === "login" ? "register" : "login";
  renderAuthMode();
}
function renderAuthMode(){
  const isLogin = authMode === "login";
  document.getElementById("authTitle").textContent = isLogin ? "Anmelden." : "Konto erstellen.";
  document.getElementById("authSub").textContent = isLogin
    ? "Melde dich an, um deinen Fortschritt geräteübergreifend zu speichern."
    : "Leg ein Konto an – dein Fortschritt bleibt erhalten, egal auf welchem Gerät du weitermachst.";
  document.getElementById("authNameField").style.display = isLogin ? "none" : "block";
  document.getElementById("authSubmitBtn").textContent = isLogin ? "ANMELDEN" : "KONTO ANLEGEN";
  document.getElementById("authSwitchText").textContent = isLogin ? "Noch kein Konto?" : "Schon ein Konto?";
  document.getElementById("authSwitchLink").textContent = isLogin ? "Registrieren" : "Anmelden";
  const localNameInput = document.getElementById("localName");
  if(localNameInput) localNameInput.value = (state.name && state.name !== "Michael") ? state.name : "";
  hideAuthError();
}
function showAuthError(msg){
  const el = document.getElementById("authError");
  el.textContent = msg;
  el.classList.add("show");
}
function hideAuthError(){
  document.getElementById("authError").classList.remove("show");
}

async function submitAuth(){
  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value;
  const displayName = document.getElementById("authName").value.trim();
  hideAuthError();

  if(!email || !password){ showAuthError("E-Mail und Passwort ausfüllen."); return; }
  if(authMode === "register" && password.length < 8){ showAuthError("Passwort muss mindestens 8 Zeichen haben."); return; }

  const btn = document.getElementById("authSubmitBtn");
  const originalText = btn.textContent;
  btn.classList.add("loading");
  btn.textContent = "Einen Moment…";

  try{
    const path = authMode === "login" ? "/auth/login" : "/auth/register";
    const body = authMode === "login" ? { email, password } : { email, password, displayName };
    const data = await apiCall(path, { method:"POST", body: JSON.stringify(body) });

    authToken = data.token;
    localStorage.setItem("nextlevel_token", authToken);
    serverOnline = true;

    state.name = data.user.display_name || email.split("@")[0];
    state.isAdmin = !!data.user.is_admin;
    await syncProgressFromServer();
    saveState();
    go(state.track ? "home" : "trackPicker");
  }catch(e){
    showAuthError(e.message || "Etwas ist schiefgelaufen. Bitte erneut versuchen.");
  }finally{
    btn.classList.remove("loading");
    btn.textContent = originalText;
  }
}

function skipAuth(){
  const nameInput = document.getElementById("localName");
  const typedName = nameInput ? nameInput.value.trim() : "";
  if(typedName) state.name = typedName;
  saveState();
  go(state.track ? "home" : "trackPicker");
}

async function syncProgressFromServer(){
  if(!authToken) return false;
  try{
    const data = await apiCall("/progress");
    state.xp = data.xp;
    state.level = data.level;
    state.completedMissions = (data.completed_modules || []).map(id => ({ id, date:null, score:null }));
    serverOnline = true;
    return true;
  }catch(e){
    serverOnline = false;
    return false;
  }
}

async function syncXpToServer(amount, moduleId){
  if(!authToken) return;
  try{
    await apiCall("/progress/add-xp", { method:"POST", body: JSON.stringify({ amount, moduleId }) });
    serverOnline = true;
  }catch(e){
    serverOnline = false;
    // Kein Problem: der lokale Stand bleibt gültig und ist bereits gespeichert.
  }
}

/* -------- NACHRICHTEN -------- */
let cachedMessages = [];

function escHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

async function checkForNewMessages(){
  if(!authToken){ updateBellDot(false); return; }
  try{
    const data = await apiCall("/messages");
    cachedMessages = data;
    serverOnline = true;
    const newest = data[0];
    updateBellDot(!!newest && newest.id !== state.lastSeenMessageId);
  }catch(e){
    serverOnline = false;
    updateBellDot(false);
  }
}

function updateBellDot(show){
  const dot = document.getElementById("bellDot");
  if(dot) dot.style.display = show ? "block" : "none";
}

function formatMessageDate(iso){
  const d = new Date(iso);
  return d.toLocaleDateString("de-DE", { day:"2-digit", month:"2-digit", year:"numeric" }) + " · " + d.toLocaleTimeString("de-DE", { hour:"2-digit", minute:"2-digit" });
}

async function loadAndRenderMessages(){
  const list = document.getElementById("messagesList");

  if(!authToken){
    list.innerHTML = '<div class="empty-state">Melde dich mit einem echten Konto an, um Nachrichten zu sehen.</div>';
    return;
  }

  list.innerHTML = '<div class="empty-state">Wird geladen…</div>';

  try{
    const data = await apiCall("/messages");
    cachedMessages = data;
    serverOnline = true;

    if(data.length === 0){
      list.innerHTML = '<div class="empty-state">Noch keine Nachrichten.</div>';
    } else {
      list.innerHTML = data.map(m => `
        <div class="msg-item ${m.urgent ? "urgent" : ""}">
          <div class="msg-top">
            ${m.urgent ? '<span class="msg-urgent-tag">WICHTIG</span>' : ""}
            <span class="msg-title">${escHtml(m.title)}</span>
          </div>
          <div class="msg-date">${formatMessageDate(m.created_at)}</div>
          <div class="msg-body">${escHtml(m.body)}</div>
        </div>
      `).join("");

      state.lastSeenMessageId = data[0].id;
      saveState();
      updateBellDot(false);
    }
  }catch(e){
    serverOnline = false;
    list.innerHTML = '<div class="empty-state">Server nicht erreichbar – Nachrichten können gerade nicht geladen werden.</div>';
  }
}

async function adminSendMessage(){
  const title = document.getElementById("adminMsgTitle").value.trim();
  const body = document.getElementById("adminMsgBody").value.trim();
  const urgent = document.getElementById("adminMsgUrgent").checked;

  if(!title || !body){ toast("Titel und Text ausfüllen"); return; }
  if(!authToken){ toast("Dafür musst du mit einem echten Konto angemeldet sein"); return; }

  try{
    await apiCall("/messages", { method:"POST", body: JSON.stringify({ title, body, urgent }) });
    toast("Nachricht verschickt");
    document.getElementById("adminMsgTitle").value = "";
    document.getElementById("adminMsgBody").value = "";
    document.getElementById("adminMsgUrgent").checked = false;
  }catch(e){
    toast("Fehlgeschlagen: " + e.message);
  }
}

function logout(){
  if(!confirm("Wirklich abmelden?")) return;
  authToken = null;
  localStorage.removeItem("nextlevel_token");
  localStorage.removeItem("nextlevel_user");
  state = {...DEFAULT_STATE};
  authMode = "login";
  renderAuthMode();
  go("auth");
}

/* ============================================================
   ADMIN-MODUS
   5x auf das Copyright im Login-Screen tippen zum Ein-/Ausblenden.
   WICHTIG: Das ist kein echter Schutz - nur eine versteckte
   Komfort-Funktion. Jeder mit Zugriff auf den Quellcode könnte das
   finden. Echter Adminschutz braucht später eine Prüfung auf dem
   Server, nicht nur im Browser.
   ============================================================ */
let adminTapCount = 0;
let adminTapTimer = null;

function handleAdminTap(){
  adminTapCount++;
  clearTimeout(adminTapTimer);
  adminTapTimer = setTimeout(() => { adminTapCount = 0; }, 3000);

  if(adminTapCount >= 5){
    adminTapCount = 0;
    toggleAdminPanel();
  }
}

function toggleAdminPanel(){
  const panel = document.getElementById("adminPanel");
  const willShow = panel.classList.contains("hidden");
  if(willShow){
    document.getElementById("adminApiUrl").value = API_BASE;
    document.getElementById("adminMsgSection").style.display = state.isAdmin ? "block" : "none";
    renderAdminState();
  }
  panel.classList.toggle("hidden");
}

function renderAdminState(){
  document.getElementById("adminStateJson").textContent = JSON.stringify(state, null, 2);
  renderAdminAnalytics();
}
function renderAdminAnalytics(){
  const el = document.getElementById("adminAnalytics");
  if(!el) return;
  const totalStarts = Object.values(analytics.missionStarts).reduce((a,b)=>a+b,0);
  const totalCompletions = Object.values(analytics.missionCompletions).reduce((a,b)=>a+b,0);
  const completionRate = totalStarts ? Math.round(totalCompletions/totalStarts*100) : 0;
  let topMission = "–", topStarts = 0;
  Object.entries(analytics.missionStarts).forEach(([id,c])=>{
    if(c > topStarts){ topStarts = c; const m = MISSIONS.find(x=>x.id===id); topMission = m ? m.title : id; }
  });
  let worstQ = "–", worstCount = 0;
  Object.entries(analytics.wrongAnswers).forEach(([key,c])=>{
    if(c > worstCount){
      worstCount = c;
      const qi = key.lastIndexOf("_q");
      const missionId = key.slice(0, qi);
      const qIdx = key.slice(qi+2);
      const m = MISSIONS.find(x=>x.id===missionId);
      worstQ = m ? (m.title + " · F" + (Number(qIdx)+1)) : key;
    }
  });
  const battleDropoffRate = analytics.battleStarts ? Math.round(analytics.battleDropoffs/analytics.battleStarts*100) : 0;
  const trackEntries = Object.entries(analytics.trackUsage).sort((a,b)=>b[1]-a[1]);
  const topTrack = trackEntries.length ? (TRACKS[trackEntries[0][0]] ? TRACKS[trackEntries[0][0]].short : trackEntries[0][0]) : "–";
  const avgSessionMin = analytics.sessionCount ? Math.round((analytics.totalSessionMs/analytics.sessionCount)/60000) : 0;

  el.innerHTML = `
    <div class="admin-stat-grid">
      <div class="admin-stat"><div class="v">${analytics.sessionCount||0}</div><div class="l">Sessions</div></div>
      <div class="admin-stat"><div class="v">${avgSessionMin}m</div><div class="l">Ø Sitzungsdauer</div></div>
      <div class="admin-stat"><div class="v">${totalStarts}</div><div class="l">Missionen gestartet</div></div>
      <div class="admin-stat"><div class="v">${completionRate}%</div><div class="l">Abschlussquote</div></div>
      <div class="admin-stat"><div class="v" style="font-size:11.5px">${topMission}</div><div class="l">Meistgestartet</div></div>
      <div class="admin-stat"><div class="v" style="font-size:11.5px">${worstQ}</div><div class="l">Meiste Fehler</div></div>
      <div class="admin-stat"><div class="v">${analytics.battleStarts||0}</div><div class="l">Battles gestartet</div></div>
      <div class="admin-stat"><div class="v">${battleDropoffRate}%</div><div class="l">Battle-Abbrüche</div></div>
      <div class="admin-stat" style="grid-column:1/-1"><div class="v">${topTrack}</div><div class="l">Meistgenutzter Track</div></div>
    </div>`;
}

function adminSaveApiUrl(){
  const url = document.getElementById("adminApiUrl").value.trim();
  if(!url) return;
  localStorage.setItem("nextlevel_api_base", url);
  API_BASE = url;
  toast("Server-Adresse gespeichert");
  checkServer();
}

function adminAddXp(){
  state.xp += 500;
  state.level = Math.max(1, Math.ceil(state.xp / 500));
  saveState();
  renderAdminState();
  toast("+500 XP (Admin)");
}

function adminCopyState(){
  const text = JSON.stringify(state, null, 2);
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(
      () => toast("State kopiert"),
      () => toast("Kopieren fehlgeschlagen")
    );
  } else {
    toast("Kopieren wird hier nicht unterstützt");
  }
}

function adminResetAll(){
  if(!confirm("Wirklich ALLES zurücksetzen? State und Login-Token werden gelöscht.")) return;
  localStorage.clear();
  location.reload();
}

/* -------- KARRIEREPFADE -------- */
const TRACKS = {
  sales:      { name:"SALES",      short:"Sales",      emj:"🛒" },
  service:    { name:"SERVICE",    short:"Service",    emj:"🛠️" },
  leadership: { name:"LEADERSHIP", short:"Leadership", emj:"👨‍💼" },
};

/* -------- MISSIONEN pro Track -------- */
/* HIER QUIZ-INHALT ANPASSEN */
const MISSIONS = [
  /* ==== SALES TRACK ==== */
  {
    id:"einwand", track:"sales", title:"Einwandbehandlung", subtitle:"Vom Nein zum Ja — Klassiker der Verkaufspsychologie", progress:25, iconType:"chat",
    questions:[
      { q:"Was ist die wichtigste Regel bei einem Einwand?", a:["Zuhören und verstehen","Sofort widersprechen","Rabatt anbieten","Thema wechseln"], correct:0 },
      { q:"Was heißt 'Preis-Einwand isolieren'?", a:["Klären, ob Preis der EINZIGE Grund ist","Preis erhöhen","Preis verstecken","Alternativangebot ohne Preis"], correct:0 },
      { q:"Welche Frage entkräftet einen Einwand am besten?", a:["Angenommen wir lösen das — kaufen Sie dann?","Warum nicht?","Was verdienen Sie?","Was denkt Ihre Frau?"], correct:0 },
      { q:"Was ist der 'Bumerang-Ansatz'?", a:["Einwand als Kaufargument nutzen","Ablehnen","Später zurückkommen","Weiterleiten"], correct:0 },
      { q:"Wann sollte man KEINEN Einwand behandeln?", a:["Wenn der Kunde schon entschieden hat","Immer","Nur montags","Bei Bestandskunden"], correct:0 },
    ]
  },
  {
    id:"tarif", track:"sales", title:"Tarifberatung", subtitle:"Die passenden Tarife souverän erklären", progress:40, iconType:"tag",
    questions:[
      { q:"Womit startet eine gute Tarifberatung?", a:["Mit Fragen zum Nutzungsverhalten","Mit dem teuersten Tarif","Mit Rabatt-Aktion","Mit Vertragslaufzeit"], correct:0 },
      { q:"Was ist bei Datenvolumen-Beratung entscheidend?", a:["Streaming-, Social- & Homeoffice-Nutzung","Nur MB-Zahl","Preis pro GB","Netz-Farbe"], correct:0 },
      { q:"Was ist ein 'Bundle'?", a:["Mehrere Produkte in einem Vertrag","Rabattgutschein","Prepaid-Zusatz","Freundschaftsvorteil"], correct:0 },
      { q:"Welcher Kunde profitiert vom höchsten Tarif?", a:["Vielnutzer mit Streaming, Familie, Homeoffice","Rentner mit Notfall-Handy","Zweit-SIM","Gelegenheitsnutzer"], correct:0 },
      { q:"Welche Frage klärt den Bedarf am schnellsten?", a:["Was frustriert Sie an Ihrem aktuellen Vertrag?","Wie viel wollen Sie zahlen?","Wie alt sind Sie?","Wer ist Ihr Anbieter?"], correct:0 },
    ]
  },
  {
    id:"zubehoer", track:"sales", title:"Zubehörverkauf", subtitle:"Von Case bis Kopfhörer — Cross-Selling im Alltag", progress:0, iconType:"box",
    questions:[
      { q:"Wann bietet man Zubehör an?", a:["Direkt beim Gerätekauf","Erst nach 4 Wochen","Nur auf Nachfrage","Nur bei Neukunden"], correct:0 },
      { q:"Welches Zubehör hat die höchste Abschlussquote?", a:["Schutzhülle & Displayschutz","Selfie-Stick","Autohalterung","Tastatur"], correct:0 },
      { q:"Was ist die '3-Produkte-Regel'?", a:["Immer 3 Zubehör-Optionen anbieten","3 Kunden am Tag","3 % Rabatt","3 Sekunden warten"], correct:0 },
      { q:"Was verkauft sich mit Kopfhörern am besten zusammen?", a:["Streaming-Abo & Reinigungsset","Powerbank","Tablet","Router"], correct:0 },
      { q:"Wann NIE Zubehör aufdrängen?", a:["Wenn der Kunde signalisiert: 'Nur das Gerät bitte'","Bei Familien","Bei Männern","Bei Wiederholungskäufern"], correct:0 },
    ]
  },

  /* ==== SERVICE TRACK ==== */
  {
    id:"reklamation", track:"service", title:"Reklamationen", subtitle:"Beschwerden zu Fans machen", progress:30, iconType:"warn",
    questions:[
      { q:"Was ist der erste Schritt bei einer Reklamation?", a:["Ruhig zuhören und Empathie zeigen","Sofort Lösung anbieten","An Chef weiterleiten","Formular geben"], correct:0 },
      { q:"Wie reagiert man auf einen aufgebrachten Kunden?", a:["Namen ansprechen, ruhig, sachlich","Lauter werden","Ignorieren","Türe schließen"], correct:0 },
      { q:"Was ist die 'LEAP-Methode'?", a:["Listen · Empathize · Apologize · Perform","Löschen · Erneuern · Anrufen · Prüfen","Loop-Escalation-Alert-Prompt","Kein Standard"], correct:0 },
      { q:"Was NIE einem Kunden sagen?", a:["'Das ist nicht mein Problem'","'Ich verstehe Sie'","'Wir kümmern uns'","'Danke für den Hinweis'"], correct:0 },
      { q:"Wann eskaliert man an den Vorgesetzten?", a:["Wenn die Lösung außerhalb der eigenen Kompetenz liegt","Immer sofort","Nie","Nur schriftlich"], correct:0 },
    ]
  },
  {
    id:"vertragsanpassung", track:"service", title:"Vertragsänderungen", subtitle:"Wechsel, Verlängerung, Kündigung — sauber abwickeln", progress:15, iconType:"pen",
    questions:[
      { q:"Was ist bei einer Kündigung besonders wichtig?", a:["Kündigungsgrund verstehen und Alternativen anbieten","Sofort Bestätigung","Ohne Fragen abwickeln","Zusatz-Gebühr","Rabatt"], correct:0 },
      { q:"Vertragsverlängerung — was zieht am besten?", a:["Konkreter Mehrwert (mehr Datenvolumen, neues Gerät)","Nur Preisreduktion","Angst-Argumente","Aufschieben"], correct:0 },
      { q:"Wann ist ein Wechselwunsch legitim?", a:["Immer — Kundenwunsch respektieren","Nie","Nur bei Beschwerden","Nur online"], correct:0 },
      { q:"Was gehört in jede Vertragsdoku?", a:["Datum, Unterschrift, Belehrung, Kontakt","Nur Preis","Nur Laufzeit","Handschriftlicher Zettel"], correct:0 },
      { q:"Widerrufsrecht in Deutschland?", a:["14 Tage bei Fernabsatz","3 Tage","30 Tage","Kein Recht"], correct:0 },
    ]
  },
  {
    id:"technik", track:"service", title:"Technik & Netz", subtitle:"Erste Hilfe bei Handy- und Netz-Problemen", progress:50, iconType:"wifi",
    questions:[
      { q:"Erster Schritt bei 'Kein Netz'-Problem?", a:["Flugmodus an/aus + Neustart","Reset auf Werk","SIM tauschen","Vertrag kündigen"], correct:0 },
      { q:"Was tun bei langsamem mobilen Internet?", a:["Netz-Manuell wählen + APN prüfen","Immer neuen Vertrag","Nichts","Handy tauschen"], correct:0 },
      { q:"Warum funktioniert VoLTE manchmal nicht?", a:["Netz-Feature nicht aktiviert oder Gerät inkompatibel","Kunde falsch","Handy defekt","Immer"], correct:0 },
      { q:"Was bedeutet 'Kein Anschluss unter dieser Nummer'?", a:["Nummer nicht (mehr) vergeben oder Störung","Handy aus","Kein Netz","Vertrag gekündigt"], correct:0 },
      { q:"Bei WLAN-Problemen zuerst?", a:["Router neustarten (30 Sek. Strom weg)","WLAN-Passwort ändern","Provider wechseln","Neues Kabel"], correct:0 },
    ]
  },

  /* ==== LEADERSHIP TRACK ==== */
  {
    id:"coaching", track:"leadership", title:"Coaching", subtitle:"Mitarbeiter entwickeln statt kontrollieren", progress:20, iconType:"talk",
    questions:[
      { q:"Was ist der Kern eines guten Coachings?", a:["Fragen stellen, statt Antworten geben","Ansagen","Kritik","Belohnung"], correct:0 },
      { q:"Was ist das GROW-Modell?", a:["Goal · Reality · Options · Will","Große · Rolle · Ordnung · Wille","Nur ein Trend","Feedbackregel"], correct:0 },
      { q:"Welche Fragetechnik öffnet ein Gespräch?", a:["Offene W-Fragen","Ja/Nein-Fragen","Suggestivfragen","Warum-Fragen"], correct:0 },
      { q:"Wann NICHT coachen?", a:["Wenn eine klare Anweisung nötig ist (Notfall, Compliance)","Immer","Nur nachmittags","Bei neuen Mitarbeitern"], correct:0 },
      { q:"Was ist 'Active Listening'?", a:["Zuhören, spiegeln, klärende Rückfragen","Nur zuhören","Notizen","Nicken"], correct:0 },
    ]
  },
  {
    id:"kennzahlen", track:"leadership", title:"Kennzahlen", subtitle:"KPIs verstehen und mit dem Team steuern", progress:35, iconType:"chart",
    questions:[
      { q:"Was ist eine Vertriebs-Conversion-Rate?", a:["Anteil Interessenten, die kaufen","Umsatz pro Tag","Kunden pro Stunde","Anrufe pro Woche"], correct:0 },
      { q:"Was heißt NPS?", a:["Net Promoter Score","Neue Prepaid Sales","Netz-Performance","Nichts Spezielles"], correct:0 },
      { q:"Welcher KPI zeigt Kundentreue?", a:["Churn-Rate (Abwanderung)","Umsatz","Klickzahl","Öffnungsrate"], correct:0 },
      { q:"Was ist ein SMART-Ziel?", a:["Spezifisch, Messbar, Attraktiv, Realistisch, Terminiert","Schnell, Machbar, Aktiv, Risiko, Test","Nur ein Buzzword","Slack-Regel"], correct:0 },
      { q:"Wie oft sollten KPIs im Team besprochen werden?", a:["Mindestens wöchentlich, immer transparent","Einmal pro Jahr","Nur bei Verlust","Nie"], correct:0 },
    ]
  },
  {
    id:"fuehrung", track:"leadership", title:"Mitarbeiterführung", subtitle:"Feedback, Motivation, schwierige Gespräche", progress:10, iconType:"users",
    questions:[
      { q:"Was ist die WWW-Feedback-Regel?", a:["Wahrnehmung · Wirkung · Wunsch","Warum · Was · Wann","Wir · Wollen · Wachsen","Wertschätzung · Wille · Weg"], correct:0 },
      { q:"Was motiviert Mitarbeiter langfristig?", a:["Autonomie, Meisterschaft, Sinn","Nur Geld","Nur Bonus","Nur Titel"], correct:0 },
      { q:"Wie beginnt man ein schwieriges Gespräch?", a:["Sachlich, ohne Vorwurf, mit klarem Anliegen","Mit Kritik","Mit Kündigung","Mit Witz"], correct:0 },
      { q:"Was ist psychologische Sicherheit?", a:["Team traut sich Fehler & Ideen offen anzusprechen","Verträge sind sicher","Antivirus","Datenschutz"], correct:0 },
      { q:"Wie oft One-on-Ones mit Mitarbeitern?", a:["Alle 1-2 Wochen 30 Minuten","Einmal jährlich","Nie","Bei Bedarf"], correct:0 },
    ]
  }
];

/* Antworten mischen */
MISSIONS.forEach(m=>{
  m.questions.forEach(q=>{
    const correct = q.a[q.correct];
    q.a = shuffle([...q.a]);
    q.correct = q.a.indexOf(correct);
  });
});
function shuffle(a){ for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }

/* -------- Mission-Icons -------- */
const ICN = {
  chat:'💬', tag:'🏷️', box:'📦',
  warn:'⚠️', pen:'✏️', wifi:'📶',
  talk:'🎓', chart:'📊', users:'👥'
};

/* -------- LEADERBOARD MOCK-DATEN pro Track -------- */
const LEADERBOARD = {
  sales: [
    { name:"Sarah K.", team:"Filiale Hamburg", xp:4820 },
    { name:"Julian P.", team:"Filiale München", xp:4210 },
    { name:"Melanie R.", team:"Filiale Berlin", xp:3980 },
    { name:"Tim H.", team:"Filiale Frankfurt", xp:3510, delta:2 },
    { name:"Anja D.", team:"Filiale Stuttgart", xp:3240, delta:-1 },
    { name:"Meltem Ö.", team:"Filiale Köln-City", xp:2890 },
    { name:"YOU", team:"Filiale Köln-City", xp:2450, isYou:true, delta:6 },
    { name:"Kevin M.", team:"Filiale Düsseldorf", xp:2380, delta:-2 },
    { name:"Nina S.", team:"Filiale Leipzig", xp:2110 },
    { name:"Robin B.", team:"Filiale Bremen", xp:1950 },
  ],
  service: [
    { name:"Marc L.", team:"Filiale Berlin", xp:5100 },
    { name:"Lisa T.", team:"Filiale Hamburg", xp:4680 },
    { name:"Dennis F.", team:"Filiale Köln-City", xp:4020 },
    { name:"YOU", team:"Filiale Köln-City", xp:2450, isYou:true, delta:4 },
    { name:"Anna K.", team:"Filiale Frankfurt", xp:2200 },
    { name:"Peter O.", team:"Filiale München", xp:1900 },
  ],
  leadership: [
    { name:"Frank D.", team:"Regionalleitung Nord", xp:6200 },
    { name:"Katrin B.", team:"Regionalleitung West", xp:5480 },
    { name:"YOU", team:"Filiale Köln-City", xp:2450, isYou:true, delta:3 },
    { name:"David K.", team:"Filiale Köln-City", xp:2020 },
    { name:"Stefan W.", team:"Filiale Stuttgart", xp:2100 },
    { name:"Rita J.", team:"Filiale Hannover", xp:1800 },
  ],
};

/* -------- NAV -------- */
let currentScreen = "splash";
function go(id){
  const from = document.getElementById(currentScreen);
  const to = document.getElementById(id);
  if(!to) return;
  if(from){ from.classList.remove("active"); from.classList.add("exit-left"); setTimeout(()=>from.classList.remove("exit-left"), 400); }
  to.classList.add("active");
  currentScreen = id;
  const sc = to.querySelector(".screen-scroll");
  if(sc) sc.scrollTop = 0;
  if(id==="home"){ renderHome(); checkForNewMessages(); }
  if(id==="missions") renderMissions();
  if(id==="progress") renderProgress();
  if(id==="leaderboard") renderLeaderboard("track");
  if(id==="profile") renderProfile();
  if(id==="settings") renderSettings();
  if(id==="trackPicker") renderTrackPicker();
  if(id==="messages") loadAndRenderMessages();
}

/* -------- TRACK PICKER -------- */
function renderTrackPicker(){
  pendingTrack = state.track;
  document.querySelectorAll("#trackOptions .track").forEach(el=>{
    el.classList.toggle("selected", el.dataset.track === pendingTrack);
  });
  document.getElementById("trackBackBtn").style.display = state.track ? "flex" : "none";
}
function selectTrack(track){
  // Bereits aktiver Track erneut angetippt: nur visuell bestätigen, nicht navigieren (kein ungewolltes Zurückspringen)
  if(track === state.track){
    pendingTrack = track;
    renderTrackPicker();
    return;
  }
  pendingTrack = track;
  document.querySelectorAll("#trackOptions .track").forEach(el=>{
    el.classList.toggle("selected", el.dataset.track === track);
  });
  hapticPulse(30);
  const hadTrackBefore = !!state.track;
  state.track = track;
  saveState();
  if(hadTrackBefore) toast("Track gewechselt: " + TRACKS[track].emj + " " + TRACKS[track].name);
  go("home");
}

/* -------- HOME -------- */
function renderHome(){
  document.getElementById("userName").textContent = state.name;
  const initial = (state.name || "?").charAt(0).toUpperCase();
  document.getElementById("topBarAvatar").textContent = initial;
  document.getElementById("helloAvatar").textContent = initial;
  document.getElementById("battleAvatar").textContent = initial;
  document.getElementById("levelNum").textContent = state.level;
  document.getElementById("xpNum").textContent = state.xp;
  const nextXp = state.level * 500;
  const prevXp = (state.level-1) * 500;
  const pct = Math.max(0, Math.min(100, Math.round(((state.xp - prevXp) / (nextXp - prevXp)) * 100)));
  document.getElementById("nextLvlXp").textContent = nextXp;
  document.getElementById("nextLvl").textContent = state.level + 1;
  document.getElementById("xpPct").textContent = pct + "%";
  document.getElementById("xpBar").style.width = pct + "%";
  if(state.track){
    document.getElementById("homeTrackEmj").textContent = TRACKS[state.track].emj;
    document.getElementById("homeTrackName").textContent = TRACKS[state.track].name;
  }

  document.getElementById("weeklyBanner").style.display = isWeeklyEventActive() ? "flex" : "none";

  const track = state.track || "sales";
  const rankedList = (LEADERBOARD[track] || []).map(x => x.isYou ? {...x, xp:state.xp} : x).sort((a,b)=>b.xp-a.xp);
  const myIdx = rankedList.findIndex(x=>x.isYou);
  const chaseCard = document.getElementById("chaseCard");
  if(myIdx > 0){
    const ahead = rankedList[myIdx-1];
    const gap = Math.max(0, ahead.xp - state.xp);
    chaseCard.style.display = "flex";
    document.getElementById("chaseTitle").textContent = "Nur " + gap.toLocaleString('de-DE') + " XP bis Platz " + myIdx;
    document.getElementById("chaseSub").textContent = ahead.name + " in der " + TRACKS[track].name + "-Rangliste überholen";
  } else {
    chaseCard.style.display = "none";
  }
}

/* -------- MISSIONS -------- */
/* -------- MISSIONEN: echter Fortschritt + Filter -------- */
let missionFilter = "empfohlen";

function getMissionProgress(missionId){
  if(state.completedMissions.find(c=>c.id===missionId)) return 100;
  const partial = state.missionProgress && state.missionProgress[missionId];
  if(partial && partial.total > 0) return Math.round((partial.answered / partial.total) * 100);
  return 0;
}
function getMissionStatus(missionId){
  const p = getMissionProgress(missionId);
  if(p >= 100) return "done";
  if(p > 0) return "ongoing";
  return "new";
}

/* -------- Echter Streak, XP-Verlauf, Stärken, Erfolge -------- */
function dateStr(d){ return d.toISOString().slice(0,10); }

function logXpAndStreak(amount){
  const today = dateStr(new Date());

  const entry = state.xpHistory.find(e => e.date === today);
  if(entry) entry.amount += amount;
  else state.xpHistory.push({ date: today, amount });
  if(state.xpHistory.length > 60) state.xpHistory = state.xpHistory.slice(-60);

  if(state.lastActiveDate !== today){
    const yesterday = dateStr(new Date(Date.now() - 86400000));
    state.streak = (state.lastActiveDate === yesterday) ? state.streak + 1 : 1;
    state.lastActiveDate = today;
  }
}

function getMissionAccuracy(missionId){
  const done = state.completedMissions.find(c => c.id === missionId);
  if(!done) return null;
  const mission = MISSIONS.find(m => m.id === missionId);
  if(!mission || !mission.questions.length) return null;
  return Math.round((done.score / mission.questions.length) * 100);
}

const BADGES = [
  { id:"erste", name:"Erste Mission", emj:"🎯", check: s => s.completedMissions.length >= 1 },
  { id:"trackmeister", name:"Track-Meister", emj:"🏅", check: s => {
      const track = s.track || "sales";
      return MISSIONS.filter(m=>m.track===track).every(m => s.completedMissions.some(c=>c.id===m.id));
    } },
  { id:"perfekt", name:"Perfekte Runde", emj:"💯", check: s => s.completedMissions.some(c => {
      const m = MISSIONS.find(mm=>mm.id===c.id);
      return m && c.score === m.questions.length;
    }) },
  { id:"kaempfer", name:"Kämpfer", emj:"⚔️", check: s => s.battlesWon >= 1 },
  { id:"raetsel", name:"Rätsel-Ass", emj:"🧩", check: s => s.puzzlesCompleted >= 1 },
  { id:"streak3", name:"3 Tage dran", emj:"🔥", check: s => !!s.lastActiveDate && s.streak >= 3 },
];

function getEarnedBadges(){ return BADGES.filter(b => b.check(state)); }

function getWeeklyXpData(){
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = (day === 0 ? -6 : 1 - day);
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  monday.setHours(0,0,0,0);

  const values = [];
  for(let i=0;i<7;i++){
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const entry = state.xpHistory.find(e => e.date === dateStr(d));
    values.push(entry ? entry.amount : 0);
  }
  return values;
}

function renderWeeklyChart(){
  const values = getWeeklyXpData();
  const xs = [20,68,116,164,212,260,308];
  const maxVal = Math.max(...values, 100);
  const ys = xs.map((x,i) => Math.round(120 - Math.min(1, values[i]/maxVal) * 100));

  const lineD = "M" + xs.map((x,i) => `${x},${ys[i]}`).join(" L");
  const areaD = lineD + ` L${xs[6]},120 L${xs[0]},120 Z`;

  document.getElementById("xpChartArea").setAttribute("d", areaD);
  document.getElementById("xpChartLine").setAttribute("d", lineD);
  xs.forEach((x,i) => {
    const dot = document.getElementById("xpDot" + i);
    if(dot) dot.setAttribute("cy", ys[i]);
  });
}

function filterMissions(filter){
  missionFilter = filter;
  document.querySelectorAll('#missionChips .chip').forEach(c => c.classList.toggle('active', c.dataset.filter === filter));
  renderMissions();
}

function renderMissions(){
  const list = document.getElementById("missionList");
  const track = state.track || "sales";
  document.getElementById("trackHintEmj").textContent = TRACKS[track].emj;
  document.getElementById("trackHintName").textContent = TRACKS[track].name;

  const trackMissions = MISSIONS.filter(m=>m.track === track);
  if(trackMissions.length === 0){
    list.innerHTML = '<div class="empty-state">Keine Missionen in diesem Track.</div>';
    return;
  }

  let filtered;
  const emptyText = {
    neu: "Alles gestartet oder abgeschlossen — keine neuen Missionen mehr in diesem Track.",
    laufend: "Noch keine begonnene Mission. Starte eine, um hier weiterzumachen.",
    abgeschlossen: "Noch keine Mission abgeschlossen. Leg direkt los!",
    empfohlen: "Alles in diesem Track abgeschlossen — stark!"
  };

  if(missionFilter === "neu"){
    filtered = trackMissions.filter(m => getMissionStatus(m.id) === "new");
  } else if(missionFilter === "laufend"){
    filtered = trackMissions.filter(m => getMissionStatus(m.id) === "ongoing");
  } else if(missionFilter === "abgeschlossen"){
    filtered = trackMissions.filter(m => getMissionStatus(m.id) === "done");
  } else {
    // Empfohlen: alles Unerledigte, begonnene zuerst (dort weitermachen, wo aufgehört wurde)
    filtered = trackMissions
      .filter(m => getMissionStatus(m.id) !== "done")
      .sort((a,b) => (getMissionStatus(a.id) === "ongoing" ? -1 : 0) - (getMissionStatus(b.id) === "ongoing" ? -1 : 0));
  }

  if(filtered.length === 0){
    list.innerHTML = `<div class="empty-state">${emptyText[missionFilter]}</div>`;
    return;
  }

  list.innerHTML = filtered.map(m=>{
    const progress = getMissionProgress(m.id);
    const status = getMissionStatus(m.id);
    return `
    <div class="mission" onclick="startQuiz('${m.id}')">
      <div class="mission-icon">${ICN[m.iconType]||"⭐"}</div>
      <div class="mission-body">
        <h4>${m.title}</h4>
        <p>${m.subtitle}</p>
        <div class="progress"><i style="width:${progress}%"></i></div>
        <div class="meta"><span>${status === "done" ? "✓ Abgeschlossen" : "Fortschritt"}</span><span class="pct">${progress}%</span></div>
      </div>
      <div class="mission-arrow"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></div>
    </div>
  `;}).join("");
}

/* -------- QUIZ -------- */
let quizState = null;
function startQuiz(missionId){
  const mission = MISSIONS.find(m=>m.id===missionId);
  if(!mission) return;
  quizState = { missionId, mission, index:0, correctCount:0, answered:false, xpBefore:state.xp };
  document.getElementById("qTotal").textContent = mission.questions.length;
  trackEvent("missionStart", missionId);
  trackEvent("trackUsage", mission.track);
  renderQuestion();
  go("quiz");
}
function renderQuestion(){
  const { mission, index } = quizState;
  const q = mission.questions[index];
  document.getElementById("qNum").textContent = index + 1;
  document.getElementById("qText").textContent = q.q;
  document.getElementById("qLabel").textContent = mission.title.toUpperCase() + " · " + TRACKS[mission.track].name;
  document.getElementById("quizBar").style.width = ((index) / mission.questions.length * 100) + "%";
  document.getElementById("feedback").classList.remove("show");
  const nb = document.getElementById("nextBtn");
  nb.classList.remove("enabled");
  nb.textContent = (index === mission.questions.length - 1) ? "ERGEBNIS ANZEIGEN" : "NÄCHSTE FRAGE";
  const letters = ["A","B","C","D"];
  document.getElementById("answers").innerHTML = q.a.map((txt, i)=>`
    <button class="answer" data-i="${i}" onclick="answer(${i})">
      <span class="letter">${letters[i]}</span>
      <span>${txt}</span>
      <svg class="letter-check" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
    </button>
  `).join("");
  quizState.answered = false;
}
function answer(i){
  if(quizState.answered) return;
  quizState.answered = true;
  const q = quizState.mission.questions[quizState.index];
  const correct = i === q.correct;
  const nodes = document.querySelectorAll("#answers .answer");
  nodes.forEach(n=>n.classList.add("disabled"));
  const picked = nodes[i];
  if(correct){
    picked.classList.add("correct");
    quizState.correctCount++;
    hapticPulse(100);
    playTone(true);
    showFeedback(true);
    spawnSparkles(picked);
  } else {
    picked.classList.add("wrong");
    nodes[q.correct].classList.add("reveal");
    hapticPulse([50,50,50]);
    playTone(false);
    showFeedback(false);
    trackEvent("wrongAnswer", quizState.missionId + "_q" + quizState.index);
  }
  document.getElementById("quizBar").style.width = ((quizState.index + 1) / quizState.mission.questions.length * 100) + "%";
  document.getElementById("nextBtn").classList.add("enabled");
  state.missionProgress[quizState.missionId] = { answered: quizState.index + 1, total: quizState.mission.questions.length };
  saveState();
}
function showFeedback(ok){
  const fb = document.getElementById("feedback");
  fb.className = "feedback show " + (ok ? "ok" : "bad");
  document.getElementById("fbTitle").textContent = ok ? ("Richtig! +" + (100 * weeklyMultiplier()) + " XP") : "Leider falsch. +0 XP";
  document.getElementById("fbText").textContent = ok ? "Super gemacht, weiter so!" : "Nicht schlimm — die richtige Antwort ist markiert.";
  document.getElementById("fbIcon").innerHTML = ok
    ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
    : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
}
function spawnSparkles(target){
  const rect = target.getBoundingClientRect();
  const scr = document.getElementById("phoneScreen").getBoundingClientRect();
  for(let k=0; k<6; k++){
    const s = document.createElement("div");
    s.className = "sparkle";
    s.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 14 10 22 12 14 14 12 22 10 14 2 12 10 10Z"/></svg>';
    s.style.left = (rect.left - scr.left + Math.random() * rect.width) + "px";
    s.style.top = (rect.top - scr.top + Math.random() * rect.height) + "px";
    s.style.color = Math.random()>0.5 ? "#fff" : "#E60000";
    document.getElementById("phoneScreen").appendChild(s);
    setTimeout(()=>s.remove(), 1000);
  }
}
function nextQuestion(){
  if(!quizState.answered) return;
  if(quizState.index < quizState.mission.questions.length - 1){
    quizState.index++;
    renderQuestion();
  } else {
    finishQuiz();
  }
}
function rollReward(baseXp){
  // 70% normal · 20% Bonus (+50%) · 10% Jackpot (verdoppelt)
  const roll = Math.random();
  if(roll < 0.10) return { xp: Math.round(baseXp * 2), tier:"jackpot" };
  if(roll < 0.30) return { xp: Math.round(baseXp * 1.5), tier:"bonus" };
  return { xp: baseXp, tier:"normal" };
}
function finishQuiz(){
  const base = quizState.correctCount * 100 * weeklyMultiplier();
  const { xp: earned, tier } = quizState.correctCount > 0 ? rollReward(base) : { xp:0, tier:"normal" };
  const before = state.xp;
  const oldLevel = state.level;
  const oldTrack = state.track;
  state.xp += earned;
  const newLevel = Math.max(1, Math.ceil(state.xp / 500));
  const levelUp = newLevel > oldLevel;
  state.level = newLevel;
  if(!state.completedMissions.find(c=>c.id===quizState.missionId)){
    state.completedMissions.push({ id:quizState.missionId, date:new Date().toISOString(), score:quizState.correctCount });
  }
  delete state.missionProgress[quizState.missionId];
  if(earned > 0) logXpAndStreak(earned);
  saveState();
  trackEvent("missionComplete", quizState.missionId);
  if(earned > 0) syncXpToServer(earned, quizState.missionId);
  document.getElementById("scoreN").textContent = quizState.correctCount;
  document.getElementById("scoreTotal").textContent = quizState.mission.questions.length;
  document.getElementById("resultXp").textContent = earned;
  document.getElementById("xpBefore").textContent = before;
  document.getElementById("xpAfter").textContent = state.xp;
  const tagEl = document.getElementById("resultRewardTag");
  tagEl.innerHTML = tier === "jackpot" ? '<span class="jackpot-tag">🎰 JACKPOT · x2 XP</span>' : tier === "bonus" ? '<span class="bonus-tag">⭐ BONUS · x1,5 XP</span>' : "";
  go("result");
  runConfetti();
  if(levelUp){
    setTimeout(()=>showPromotion(oldTrack, newLevel), 700);
  }
}
function exitQuiz(){ quizState = null; go("missions"); }

function runConfetti(){
  const canvas = document.getElementById("confetti");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const colors = ["#E60000","#FFFFFF","#B3000C","#E60000","#FFFFFF"];
  const parts = [];
  for(let i=0;i<80;i++){
    parts.push({ x: Math.random()*W, y: -20 - Math.random()*100, vx: (Math.random()-0.5)*3, vy: 2 + Math.random()*3, w: 5 + Math.random()*6, h: 8 + Math.random()*8, c: colors[Math.floor(Math.random()*colors.length)], r: Math.random()*Math.PI, vr: (Math.random()-0.5)*0.2 });
  }
  const t0 = performance.now();
  function frame(t){
    const elapsed = t - t0;
    ctx.clearRect(0,0,W,H);
    parts.forEach(p=>{
      p.x += p.vx; p.y += p.vy; p.r += p.vr; p.vy += 0.03;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h); ctx.restore();
    });
    if(elapsed < 2200){ requestAnimationFrame(frame); } else { ctx.clearRect(0,0,W,H); }
  }
  requestAnimationFrame(frame);
}

/* -------- LEADERBOARD -------- */
function seededRandom(seed){
  let s = seed % 2147483647; if(s <= 0) s += 2147483646;
  return function(){ s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}
function renderActivityFeed(){
  document.getElementById("lbSectionTitle").textContent = "Was ist passiert?";
  document.getElementById("lbToggleAll").style.display = "none";
  document.getElementById("podium").innerHTML = "";
  const names = ["Sarah K.","Julian P.","Melanie R.","Dennis F.","Tim H.","Anja D.","Meltem Ö.","David K.","Lisa T.","Kevin M."];
  const verbs = [
    m => `hat die Mission <b>${m}</b> abgeschlossen`,
    () => `hat ein Battle gewonnen`,
    () => `ist ein Level aufgestiegen`,
    () => `hat einen Jackpot geknackt 🎰`,
    m => `hat <b>${m}</b> gestartet`,
    () => `hat einen 7-Tage-Streak erreicht 🔥`,
  ];
  const daySeed = Math.floor(Date.now() / 86400000);
  const rnd = seededRandom(daySeed * 97 + 13);
  const items = [];
  let minutesAgo = 4;
  for(let i=0;i<10;i++){
    const name = names[Math.floor(rnd()*names.length)];
    const mission = MISSIONS[Math.floor(rnd()*MISSIONS.length)];
    const verb = verbs[Math.floor(rnd()*verbs.length)];
    items.push({ name, text: verb(mission.title), minutesAgo });
    minutesAgo += Math.floor(rnd()*35) + 5;
  }
  document.getElementById("rankList").innerHTML = items.map(it => {
    const timeStr = it.minutesAgo < 60 ? `vor ${it.minutesAgo} Min` : `vor ${Math.floor(it.minutesAgo/60)} Std`;
    return `
      <div class="activity-item">
        <div class="a-avatar">${it.name.charAt(0)}</div>
        <div class="a-body"><b>${it.name}</b> ${it.text}</div>
        <div class="a-time">${timeStr}</div>
      </div>`;
  }).join("");
}
function renderLeaderboard(mode){
  lbExpanded = false;
  // Chip aktiv setzen
  document.querySelectorAll("#lbChips .chip[data-lb]").forEach(c=>{
    c.classList.toggle("active", c.dataset.lb === mode);
    c.onclick = ()=> renderLeaderboard(c.dataset.lb);
  });

  if(mode === "activity"){ renderActivityFeed(); return; }
  document.getElementById("lbSectionTitle").textContent = "Weitere Ränge";

  const track = state.track || "sales";
  let list = [];
  if(mode === "track"){
    list = [...(LEADERBOARD[track] || [])];
  } else if(mode === "all"){
    // alle Tracks kombiniert und nach XP sortiert
    list = Object.values(LEADERBOARD).flat();
  } else if(mode === "week"){
    // Wochenwerte simulieren (kleinere Zahlen)
    list = (LEADERBOARD[track] || []).map(x=>({...x, xp: Math.round(x.xp * 0.15)}));
  } else if(mode === "filiale"){
    // Alle Kolleg:innen der eigenen Filiale, trackübergreifend (YOU nur einmal)
    const home = "Filiale Köln-City";
    let youUsed = false;
    list = Object.values(LEADERBOARD).flat().filter(x=>{
      if(x.team !== home) return false;
      if(x.isYou){ if(youUsed) return false; youUsed = true; }
      return true;
    });
  }
  // "YOU" durch aktuellen State-XP ersetzen (in "track", "all" und "filiale")
  list = list.map(x => x.isYou ? {...x, xp: mode==="week" ? Math.round(state.xp*0.15) : state.xp, name: state.name.toUpperCase()} : x);
  list.sort((a,b)=>b.xp - a.xp);
  const top3 = list.slice(0,3);
  const rest = list.slice(3);

  // Podium (2. - 1. - 3. Reihenfolge)
  const podClasses = ["silver","gold","bronze"];
  const podOrder = [1,0,2]; // 2.-1.-3.
  const podium = document.getElementById("podium");
  podium.innerHTML = podOrder.map(i=>{
    const p = top3[i]; if(!p) return "";
    const cls = podClasses[i];
    const you = p.isYou ? " you" : "";
    const initial = p.name.charAt(0);
    return `
      <div class="pod-item ${cls}${you}" style="${i===0?'padding-top:22px;padding-bottom:18px':''}">
        <div class="rank-num">#${i+1}</div>
        ${i===0?'<div class="pod-crown"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M2 20h20l-2-10-5 4-3-8-3 8-5-4-2 10z"/></svg></div>':''}
        <div class="pod-avatar">${initial}</div>
        <div class="nm">${p.isYou ? "DU" : p.name}</div>
        <div class="xp">${p.xp.toLocaleString('de-DE')} XP</div>
        <div class="tag">${p.team.split('·')[0]}</div>
      </div>`;
  }).join("");

  // Rest
  lastLbRest = rest;
  renderRankList();
}
let lastLbRest = [];
let lbExpanded = false;
function renderRankList(){
  const rest = lastLbRest || [];
  const shown = lbExpanded ? rest : rest.slice(0,8);
  document.getElementById("rankList").innerHTML = shown.map((p, idx)=>{
    const rank = idx + 4;
    const you = p.isYou ? " you" : "";
    const delta = p.delta || 0;
    const dStr = delta > 0 ? `↑${delta}` : delta < 0 ? `↓${Math.abs(delta)}` : "—";
    const dCls = delta > 0 ? "" : "down";
    return `
      <div class="rank-row${you}">
        <div class="r-num">${rank}</div>
        <div class="r-avatar">${p.name.charAt(0)}</div>
        <div class="r-body"><h5>${p.isYou ? "Du" : p.name}</h5><p>${p.team}</p></div>
        <div class="r-xp">${p.xp.toLocaleString('de-DE')}</div>
        <div class="r-delta ${dCls}">${dStr}</div>
      </div>`;
  }).join("");
  const toggleLink = document.getElementById("lbToggleAll");
  if(rest.length > 8){
    toggleLink.style.display = "inline";
    toggleLink.textContent = lbExpanded ? "Weniger anzeigen" : `Alle anzeigen (${rest.length - 8})`;
  } else {
    toggleLink.style.display = "none";
  }
}
function toggleLbExpand(){
  lbExpanded = !lbExpanded;
  renderRankList();
}

/* -------- PROGRESS -------- */
function getLeagueInfo(){
  const track = state.track || "sales";
  const list = (LEADERBOARD[track] || []).map(x => x.isYou ? {...x, xp: state.xp} : x);
  list.sort((a,b) => b.xp - a.xp);
  const rank = list.findIndex(x => x.isYou) + 1;
  const total = list.length || 1;

  const platinAt = Math.ceil(total * 0.15);
  const goldAt = Math.ceil(total * 0.4);
  const silberAt = Math.ceil(total * 0.7);

  let league = "BRONZE LEAGUE";
  if(rank <= platinAt) league = "PLATIN LEAGUE";
  else if(rank <= goldAt) league = "GOLD LEAGUE";
  else if(rank <= silberAt) league = "SILBER LEAGUE";

  return { rank, total, league, platinAt, goldAt, silberAt };
}

function renderLeagueCard(){
  const { rank, total, league, platinAt, goldAt, silberAt } = getLeagueInfo();
  document.getElementById("leagueName").textContent = league;

  let hint;
  if(league === "PLATIN LEAGUE") hint = "Beste Liga erreicht 🏆";
  else if(league === "GOLD LEAGUE") hint = `Aufstieg zur Platin ab Rang ${platinAt}`;
  else if(league === "SILBER LEAGUE") hint = `Aufstieg zur Gold ab Rang ${goldAt}`;
  else hint = `Aufstieg zur Silber ab Rang ${silberAt}`;

  document.getElementById("leagueSub").textContent = `Rang ${rank} von ${total} · ${hint}`;
  document.getElementById("leagueDelta").textContent = "#" + rank;
}

function renderStreakWeek(){
  const labels = ["So","Mo","Di","Mi","Do","Fr","Sa"];
  const el = document.getElementById("streakWeek");
  if(!el) return;
  const today = new Date();
  let html = "";
  for(let i=6;i>=0;i--){
    const d = new Date(today.getTime() - i*86400000);
    const ds = dateStr(d);
    const active = state.xpHistory.some(e => e.date === ds && e.amount > 0);
    const isToday = i === 0;
    html += `<div class="streak-day ${active?'active':''} ${isToday?'today':''}">
      <div class="d-label">${labels[d.getDay()]}</div>
      <div class="d-dot">${active ? '🔥' : ''}</div>
    </div>`;
  }
  el.innerHTML = html;
}
function renderProgress(){
  document.getElementById("streakNum").textContent = state.streak;
  renderStreakWeek();
  document.getElementById("kpiXp").textContent = state.xp;
  document.getElementById("kpiMissions").textContent = state.completedMissions.length;

  const earned = getEarnedBadges();
  document.getElementById("kpiBadges").textContent = earned.length;

  const track = state.track || "sales";
  const trackMissions = MISSIONS.filter(m => m.track === track);
  document.getElementById("strengthsList").innerHTML = trackMissions.map(m => {
    const acc = getMissionAccuracy(m.id);
    const pct = acc === null ? 0 : acc;
    const label = acc === null ? "Noch nicht absolviert" : pct + "%";
    return `<div class="strength-row"><div class="top"><span class="name">${m.title}</span><span class="val">${label}</span></div><div class="bar"><i style="width:${pct}%"></i></div></div>`;
  }).join("");

  document.getElementById("badgesGrid").innerHTML = BADGES.map(b => {
    const unlocked = earned.some(e => e.id === b.id);
    return `<div class="badge-item ${unlocked ? "unlocked" : ""}"><span class="emj">${b.emj}</span><span class="bname">${b.name}</span></div>`;
  }).join("");

  renderWeeklyChart();
  renderLeagueCard();
}

/* -------- PROFIL -------- */
function renderProfile(){
  document.getElementById("profKpiLvl").textContent = state.level;
  document.getElementById("profKpiXp").textContent = state.xp;
  document.getElementById("profKpiStreak").textContent = state.streak;
  document.getElementById("profName").textContent = state.name;
  document.getElementById("profAvatarInitial").textContent = (state.name || "?").charAt(0).toUpperCase();
  const role = roleForLevel(state.track || "sales", state.level);
  document.getElementById("profRole").textContent = role + (authToken ? " · Angemeldet" : " · Lokaler Demo-Modus");
  document.getElementById("logoutMenuItem").style.display = authToken ? "flex" : "none";
  document.getElementById("resetMenuItem").style.display = authToken ? "none" : "flex";
  const badgeCount = getEarnedBadges().length;
  document.getElementById("profBadgesVal").textContent = badgeCount + " 🏅";
  document.getElementById("profBadgesSub").textContent = badgeCount + " freigeschaltet";
  if(state.track){
    document.getElementById("profTrackEmj").textContent = TRACKS[state.track].emj;
    document.getElementById("profTrackName").textContent = TRACKS[state.track].name + " TRACK";
    document.getElementById("profMenuTrackEmj").textContent = TRACKS[state.track].emj;
    document.getElementById("profMenuTrackName").textContent = TRACKS[state.track].short;
  }
}

function resetApp(){
  if(!confirm("Alle Demo-Werte zurücksetzen? (Level, XP, Track)")) return;
  localStorage.removeItem("nextlevel_user");
  state = {...DEFAULT_STATE};
  go("trackPicker");
  toast("Demo zurückgesetzt");
}

/* -------- BEFÖRDERUNG -------- */
function showPromotion(track, newLevel){
  const t = track || state.track || "sales";
  document.getElementById("promoTitle").textContent = roleForLevel(t, newLevel);
  document.getElementById("promoSub").textContent = "Level " + newLevel + " · " + TRACKS[t].name;
  document.getElementById("promoBadge").textContent = TRACKS[t].emj;
  document.getElementById("promoOverlay").classList.remove("hidden");
  hapticPulse([100,40,100,40,200]);
}
function closePromotion(){
  document.getElementById("promoOverlay").classList.add("hidden");
}

/* -------- SETTINGS -------- */
function renderSettings(){
  document.getElementById("soundToggle").classList.toggle("on", !!state.soundOn);
  document.getElementById("hapticToggle").classList.toggle("on", !!state.hapticOn);
  const b = state.brightness || 100;
  document.getElementById("brightnessRange").value = b;
  document.getElementById("brightnessVal").textContent = b + "%";
}
function toggleSetting(key){
  state[key] = !state[key];
  saveState();
  document.getElementById(key === "soundOn" ? "soundToggle" : "hapticToggle").classList.toggle("on", !!state[key]);
  if(key === "soundOn" && state.soundOn) playTone(true);
  if(key === "hapticOn" && state.hapticOn) hapticPulse(40);
}
function updateBrightness(val){
  state.brightness = Number(val);
  document.getElementById("brightnessVal").textContent = val + "%";
  document.getElementById("phoneScreen").style.filter = "brightness(" + (val/100) + ")";
  saveState();
}
function sendFeedback(){
  const txt = document.getElementById("feedbackText").value.trim();
  if(!txt) { toast("Bitte erst etwas eintippen"); return; }
  try{
    const list = JSON.parse(localStorage.getItem("nextlevel_feedback") || "[]");
    list.push({ text: txt, date: new Date().toISOString(), name: state.name });
    localStorage.setItem("nextlevel_feedback", JSON.stringify(list));
  }catch(e){}
  document.getElementById("feedbackText").value = "";
  toast("Danke für dein Feedback! 🙌");
}

/* -------- TOAST -------- */
function toast(msg){
  const wrap = document.getElementById("toast-wrap");
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(()=>el.remove(), 2100);
}

/* -------- SOUND & HAPTIK (Settings-gesteuert) -------- */
function hapticPulse(pattern){
  if(!state.hapticOn) return;
  try{ navigator.vibrate && navigator.vibrate(pattern); }catch(e){}
}
let audioCtx = null;
function playTone(ok){
  if(!state.soundOn) return;
  try{
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.type = "sine";
    osc.frequency.value = ok ? 880 : 220;
    gain.gain.setValueAtTime(0.001, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.22, audioCtx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + (ok ? 0.22 : 0.32));
    osc.start();
    osc.stop(audioCtx.currentTime + 0.35);
    if(ok){
      const osc2 = audioCtx.createOscillator();
      osc2.connect(gain);
      osc2.type = "sine";
      osc2.frequency.value = 1320;
      osc2.start(audioCtx.currentTime + 0.09);
      osc2.stop(audioCtx.currentTime + 0.3);
    }
  }catch(e){}
}

/* -------- INIT -------- */
window.addEventListener("load", ()=>{
  checkServer();
  analytics.sessionCount = (analytics.sessionCount || 0) + 1;
  saveAnalytics();
  const sessionStartedAt = Date.now();
  window.addEventListener("beforeunload", ()=>{
    analytics.totalSessionMs = (analytics.totalSessionMs || 0) + (Date.now() - sessionStartedAt);
    saveAnalytics();
  });

  // Splash 1.5s → Auth (neu/abgemeldet) oder Track-Picker/Home (angemeldet)
  setTimeout(()=>{
    const s = document.getElementById("splash");
    s.classList.add("fadeout");
    setTimeout(async ()=>{
      s.classList.remove("active","fadeout");
      currentScreen = "splash";

      if(authToken){
        await syncProgressFromServer(); // scheitert still, wenn Server (noch) nicht läuft
        saveState();
        go(state.track ? "home" : "trackPicker");
      } else {
        renderAuthMode();
        go("auth");
      }
    }, 500);
  }, 1500);

  if("serviceWorker" in navigator){
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register("sw.js").catch(()=>{});
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if(hadController) showUpdateBanner();
    });
  }
});

/* -------- SERVICE-WORKER-UPDATE-HINWEIS -------- */
function showUpdateBanner(){
  const el = document.getElementById("swUpdateBanner");
  if(el) el.classList.remove("hidden");
}

/* ============================================================
   PUZZLE (Kategorien-Rätsel)
   Tippe die Situations-Karte der richtigen Mission zu.
   Bei Fehltipp: nochmal versuchen. Nach allen 5 richtig sortiert: +100 XP.
   ============================================================ */
const PUZZLE_SHORT = {
  einwand:"EINWAND", tarif:"TARIF", zubehoer:"ZUBEHÖR",
  reklamation:"REKLAMATION", vertragsanpassung:"VERTRAG", technik:"TECHNIK",
  coaching:"COACHING", kennzahlen:"KENNZAHLEN", fuehrung:"FÜHRUNG"
};
const PUZZLE_CARDS = {
  sales: [
    { text:"Kunde sagt: „Das ist mir zu teuer.“", missionId:"einwand" },
    { text:"Kunde fragt nach dem passenden Datenvolumen fürs Streaming.", missionId:"tarif" },
    { text:"Mitarbeiter bietet eine Schutzhülle zum neuen Smartphone an.", missionId:"zubehoer" },
    { text:"Kunde zögert: „Ich überlege es mir noch.“", missionId:"einwand" },
    { text:"Mitarbeiter erklärt die Vorteile eines Bundles aus Vertrag und Gerät.", missionId:"tarif" },
  ],
  service: [
    { text:"Kunde beschwert sich: „Meine Rechnung stimmt nicht!“", missionId:"reklamation" },
    { text:"Kunde möchte seinen Vertrag vorzeitig kündigen.", missionId:"vertragsanpassung" },
    { text:"Kunde meldet: „Mein Handy hat kein Netz mehr.“", missionId:"technik" },
    { text:"Kunde ist verärgert über eine falsche Lieferung.", missionId:"reklamation" },
    { text:"Kunde möchte seinen Tarif auf einen neuen umstellen.", missionId:"vertragsanpassung" },
  ],
  leadership: [
    { text:"Ein Mitarbeiter bittet um Unterstützung bei einem schwierigen Kundengespräch.", missionId:"coaching" },
    { text:"Die wöchentliche Conversion-Rate ist eingebrochen.", missionId:"kennzahlen" },
    { text:"Zwei Teammitglieder haben einen Konflikt, der das Team belastet.", missionId:"fuehrung" },
    { text:"Ein neuer Mitarbeiter möchte seine Gesprächsführung verbessern.", missionId:"coaching" },
    { text:"Der Teamleiter muss die Quartalsziele mit dem Team besprechen.", missionId:"kennzahlen" },
  ],
};

let puzzleState = null;

function startPuzzle(){
  const track = state.track || "sales";
  puzzleState = {
    track,
    cards: shuffle([...PUZZLE_CARDS[track]]),
    buckets: MISSIONS.filter(m => m.track === track),
    index: 0,
    xpBefore: state.xp,
    locked: false,
  };
  renderPuzzleBuckets();
  renderPuzzleCard();
  go("puzzleGame");
}

function renderPuzzleBuckets(){
  document.getElementById("puzzleBuckets").innerHTML = puzzleState.buckets.map(m => `
    <div class="bucket" data-mission="${m.id}" onclick="assignPuzzle('${m.id}')">
      <div class="bk-icon">${ICN[m.iconType] || "⭐"}</div>
      <div class="bk-title">${PUZZLE_SHORT[m.id] || m.title.toUpperCase()}</div>
      <div class="bk-sub">${m.title}</div>
    </div>
  `).join("");
}

function renderPuzzleCard(){
  const { cards, index } = puzzleState;
  document.getElementById("pzNum").textContent = index + 1;
  document.getElementById("puzzleBar").style.width = (index / cards.length * 100) + "%";
  const cardEl = document.getElementById("puzzleCard");
  cardEl.classList.remove("leaving");
  cardEl.textContent = cards[index].text;
  puzzleState.locked = false;
  document.querySelectorAll("#puzzleBuckets .bucket").forEach(b => b.classList.remove("correct","wrong"));
  document.getElementById("puzzleFeedback").classList.remove("show");
}

function showPuzzleFeedback(ok){
  const fb = document.getElementById("puzzleFeedback");
  fb.className = "feedback show " + (ok ? "ok" : "bad");
  document.getElementById("puzzleFbTitle").textContent = ok ? "Richtig!" : "Nicht ganz";
  document.getElementById("puzzleFbText").textContent = ok
    ? "Weiter zur nächsten Kachel."
    : "Versuch's nochmal – ordne die Kachel einem anderen Bereich zu.";
  document.getElementById("puzzleFbIcon").innerHTML = ok
    ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
    : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
}

function assignPuzzle(missionId){
  if(!puzzleState || puzzleState.locked) return;
  const current = puzzleState.cards[puzzleState.index];
  const bucketEl = document.querySelector(`#puzzleBuckets .bucket[data-mission="${missionId}"]`);
  if(!bucketEl) return;

  if(missionId === current.missionId){
    puzzleState.locked = true;
    bucketEl.classList.add("correct");
    showPuzzleFeedback(true);
    hapticPulse(100);
    document.getElementById("puzzleCard").classList.add("leaving");
    setTimeout(()=>{
      puzzleState.index++;
      if(puzzleState.index >= puzzleState.cards.length){
        finishPuzzle();
      } else {
        renderPuzzleCard();
      }
    }, 900);
  } else {
    bucketEl.classList.add("wrong");
    showPuzzleFeedback(false);
    hapticPulse([50,50,50]);
    setTimeout(()=>{
      bucketEl.classList.remove("wrong");
      document.getElementById("puzzleFeedback").classList.remove("show");
    }, 1400);
  }
}

function finishPuzzle(){
  const base = 100 * weeklyMultiplier();
  const { xp: earned, tier } = rollReward(base);
  const before = puzzleState.xpBefore;
  const oldLevel = state.level;
  const oldTrack = state.track;
  state.xp += earned;
  const newLevel = Math.max(1, Math.ceil(state.xp / 500));
  const levelUp = newLevel > oldLevel;
  state.level = newLevel;
  state.puzzlesCompleted = (state.puzzlesCompleted || 0) + 1;
  logXpAndStreak(earned);
  saveState();
  syncXpToServer(earned, "puzzle-" + puzzleState.track);

  document.getElementById("pzXpEarned").textContent = earned;
  document.getElementById("pzXpBefore").textContent = before;
  document.getElementById("pzXpAfter").textContent = state.xp;
  const tagEl = document.getElementById("pzRewardTag");
  tagEl.innerHTML = tier === "jackpot" ? '<span class="jackpot-tag">🎰 JACKPOT · x2 XP</span>' : tier === "bonus" ? '<span class="bonus-tag">⭐ BONUS · x1,5 XP</span>' : "";
  go("puzzleResult");
  runConfettiPuzzle();
  if(levelUp){
    setTimeout(()=>showPromotion(oldTrack, newLevel), 700);
  }
  puzzleState = null;
}

function exitPuzzle(){ puzzleState = null; go("home"); }

function runConfettiPuzzle(){
  const canvas = document.getElementById("pzConfetti");
  if(!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const colors = ["#00E5FF","#FFFFFF","#00838F","#00E5FF","#FFFFFF"];
  const parts = [];
  for(let i=0;i<80;i++){
    parts.push({ x: Math.random()*W, y: -20 - Math.random()*100, vx: (Math.random()-0.5)*3, vy: 2 + Math.random()*3, w: 5 + Math.random()*6, h: 8 + Math.random()*8, c: colors[Math.floor(Math.random()*colors.length)], r: Math.random()*Math.PI, vr: (Math.random()-0.5)*0.2 });
  }
  const t0 = performance.now();
  function frame(t){
    const elapsed = t - t0;
    ctx.clearRect(0,0,W,H);
    parts.forEach(p=>{
      p.x += p.vx; p.y += p.vy; p.r += p.vr; p.vy += 0.03;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h); ctx.restore();
    });
    if(elapsed < 2200){ requestAnimationFrame(frame); } else { ctx.clearRect(0,0,W,H); }
  }
  requestAnimationFrame(frame);
}

/* ============================================================
   BATTLE MODE JAVASCRIPT
   ============================================================ */
let battleState = null;
let battleTimerInterval = null;

const OPPONENTS = [
  { name: "Sarah K.", team: "Filiale Hamburg", avatar: "S" },
  { name: "Julian P.", team: "Filiale München", avatar: "J" },
  { name: "Melanie R.", team: "Filiale Berlin", avatar: "M" },
  { name: "Tim H.", team: "Filiale Frankfurt", avatar: "T" }
];

function exitBattle(){
  clearInterval(battleTimerInterval);
  if(battleState) trackEvent("battleDropoff");
  battleState = null;
  go("battleLobby");
}

function startMatchmaking() {
  document.getElementById("btSearchingState").querySelector("button").classList.add("disabled");
  document.getElementById("btSearchingState").querySelector("button").disabled = true;
  document.getElementById("btSearchingState").querySelector("p").textContent = "Datenbank wird gescannt...";
  
  hapticPulse([100, 50, 100]);
  trackEvent("battleStart");
  trackEvent("trackUsage", state.track || "sales");

  setTimeout(() => {
    // Random Gegner auswählen
    const opp = OPPONENTS[Math.floor(Math.random() * OPPONENTS.length)];
    const trackName = TRACKS[state.track || "sales"].name;
    
    battleState = {
      opp: opp,
      userScore: 0,
      oppScore: 0,
      index: 0,
      questions: [],
      answered: false,
      timeLeft: 10,
      xpBefore: state.xp
    };

    // Gegner-Card befüllen
    const card = document.getElementById("btOppCard");
    card.classList.add("match");
    card.querySelector(".avatar").textContent = opp.avatar;
    card.querySelector(".avatar").style.background = "linear-gradient(135deg, #FF9500, #FF5E00)";
    document.getElementById("btOppName").textContent = opp.name;
    document.getElementById("btOppTrack").textContent = trackName;
    document.getElementById("btOppDetail").textContent = `${opp.name} aus ${opp.team} fordert dich im ${trackName}-Track heraus!`;
    document.getElementById("btBilanzText").textContent = getFilialeBilanzText(opp.team);
    document.getElementById("btDifficultyLabel").textContent = "Gegner-Level: " + difficultyLabel();

    document.getElementById("btSearchingState").classList.add("hide");
    document.getElementById("btFoundState").classList.remove("hide");

    hapticPulse(300);
  }, 1500);
}

function startBattle() {
  // Reset Lobby
  document.getElementById("btSearchingState").classList.remove("hide");
  document.getElementById("btSearchingState").querySelector("button").classList.remove("disabled");
  document.getElementById("btSearchingState").querySelector("button").disabled = false;
  document.getElementById("btSearchingState").querySelector("p").textContent = "Suche nach einem aktiven Kollegen...";
  document.getElementById("btFoundState").classList.add("hide");
  document.getElementById("btOppCard").classList.remove("match");
  document.getElementById("btOppCard").querySelector(".avatar").textContent = "?";
  document.getElementById("btOppCard").querySelector(".avatar").style.background = "var(--card-3)";
  document.getElementById("btOppName").textContent = "Gegner";
  document.getElementById("btOppTrack").textContent = "Wird gesucht...";

  // 3 zufällige Fragen aus dem aktuellen Track holen
  const trackMissions = MISSIONS.filter(m => m.track === (state.track || "sales"));
  let allQuestions = [];
  trackMissions.forEach(m => {
    m.questions.forEach(q => {
      allQuestions.push({ ...q, missionTitle: m.title });
    });
  });
  
  // Mischen und 3 nehmen
  allQuestions = shuffle(allQuestions).slice(0, 3);
  battleState.questions = allQuestions;

  // Screen wechseln
  document.getElementById("btGameOppName").textContent = "👤 " + battleState.opp.name;
  document.getElementById("btUserScore").textContent = "0 / 3";
  document.getElementById("btOppScore").textContent = "0 / 3";
  
  renderBattleQuestion();
  go("battleGame");
}

function renderBattleQuestion() {
  const { index, questions } = battleState;
  const q = questions[index];
  
  battleState.answered = false;
  battleState.timeLeft = 10;
  
  document.getElementById("btQLabel").textContent = `FRAGE ${index + 1} VON 3 · ${q.missionTitle.toUpperCase()}`;
  document.getElementById("btQText").textContent = q.q;
  
  // Timerbar auf 100% setzen
  document.getElementById("btTimerBar").style.width = "100%";
  
  const letters = ["A","B","C","D"];
  document.getElementById("btAnswers").innerHTML = q.a.map((txt, i)=>`
    <button class="answer" data-i="${i}" onclick="answerBattle(${i})">
      <span class="letter">${letters[i]}</span>
      <span>${txt}</span>
      <svg class="letter-check" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
    </button>
  `).join("");

  document.getElementById("btNextBtn").classList.remove("enabled");
  document.getElementById("btNextBtn").textContent = (index === 2) ? "RESULTAT ANZEIGEN" : "NÄCHSTE FRAGE";

  // Opponent simulierter Status
  const statusEl = document.getElementById("btOppStatus");
  statusEl.className = "opp-status";
  statusEl.innerHTML = `💬 ${battleState.opp.name} überlegt...`;

  // Start Timer
  startBattleTimer();

  // Simuliere gegnerische Antwort
  const delay = 3000 + Math.random() * 4000; // Gegner antwortet nach 3-7 Sekunden
  battleState.oppAnswerTime = delay;
  battleState.oppCorrect = Math.random() < (state.battleDifficulty || 0.65); // Trefferquote passt sich an bisherige Kämpfe an
}

function startBattleTimer() {
  clearInterval(battleTimerInterval);
  const totalDuration = 10000; // 10 Sekunden
  const start = performance.now();

  battleTimerInterval = setInterval(() => {
    const elapsed = performance.now() - start;
    const remaining = Math.max(0, totalDuration - elapsed);
    const pct = (remaining / totalDuration) * 100;
    
    document.getElementById("btTimerBar").style.width = pct + "%";

    // Simulierter Live-Gegner checken
    if (elapsed >= battleState.oppAnswerTime && !battleState.oppAnsweredThisRound) {
      battleState.oppAnsweredThisRound = true;
      const statusEl = document.getElementById("btOppStatus");
      statusEl.className = "opp-status done";
      statusEl.innerHTML = `✅ ${battleState.opp.name} hat geantwortet!`;
      hapticPulse(50);
    }

    if (remaining <= 0) {
      clearInterval(battleTimerInterval);
      if (!battleState.answered) {
        // Timeout!
        timeoutBattle();
      }
    }
  }, 100);
}

function answerBattle(i) {
  if (battleState.answered) return;
  battleState.answered = true;
  clearInterval(battleTimerInterval);

  const q = battleState.questions[battleState.index];
  const correct = i === q.correct;
  const nodes = document.querySelectorAll("#btAnswers .answer");
  nodes.forEach(n=>n.classList.add("disabled"));
  const picked = nodes[i];

  if (correct) {
    picked.classList.add("correct");
    battleState.userScore++;
    document.getElementById("btUserScore").textContent = `${battleState.userScore} / 3`;
    spawnSparkles(picked);
    hapticPulse(100);
    playTone(true);
  } else {
    picked.classList.add("wrong");
    nodes[q.correct].classList.add("reveal");
    hapticPulse([50,50,50]);
    playTone(false);
  }

  // Gegnerische Antwort auflösen falls noch nicht geschehen
  resolveOpponentAnswer();
}

function timeoutBattle() {
  battleState.answered = true;
  const q = battleState.questions[battleState.index];
  const nodes = document.querySelectorAll("#btAnswers .answer");
  nodes.forEach(n=>n.classList.add("disabled"));
  nodes[q.correct].classList.add("reveal");
  toast("⏰ Zeit abgelaufen!");
  hapticPulse([50,50,50]);
  resolveOpponentAnswer();
}

function resolveOpponentAnswer() {
  if (battleState.oppCorrect && !battleState.oppAnsweredThisRoundSolved) {
    battleState.oppScore++;
    document.getElementById("btOppScore").textContent = `${battleState.oppScore} / 3`;
  }
  battleState.oppAnsweredThisRoundSolved = true;
  battleState.oppAnsweredThisRound = false;

  const statusEl = document.getElementById("btOppStatus");
  statusEl.className = "opp-status done";
  statusEl.innerHTML = battleState.oppCorrect 
    ? `🟢 ${battleState.opp.name} hatte die Frage RICHTIG!`
    : `🔴 ${battleState.opp.name} hatte die Frage FALSCH!`;

  document.getElementById("btNextBtn").classList.add("enabled");
}

function nextBattleQuestion() {
  if (!battleState.answered) return;
  battleState.oppAnsweredThisRoundSolved = false;

  if (battleState.index < 2) {
    battleState.index++;
    renderBattleQuestion();
  } else {
    finishBattle();
  }
}

function finishBattle() {
  clearInterval(battleTimerInterval);
  const { userScore, oppScore, xpBefore } = battleState;
  
  let earnedXp = 20; // Default Niederlage
  let title = "NIEDERLAGE!";
  let sub = `Kopf hoch! ${battleState.opp.name} war diesmal schneller.`;
  let trophy = "🛡️";
  let bilanzResult = "l";

  if (userScore > oppScore) {
    earnedXp = 150;
    title = "SIEG! 🏆";
    sub = `Hervorragend! Du hast ${battleState.opp.name} geschlagen.`;
    trophy = "🏆";
    bilanzResult = "w";
  } else if (userScore === oppScore) {
    earnedXp = 50;
    title = "UNENTSCHIEDEN!";
    sub = `Ein Kopf-an-Kopf-Rennen mit ${battleState.opp.name}.`;
    trophy = "🤝";
    bilanzResult = "t";
  }

  recordFilialeBilanz(battleState.opp.team, bilanzResult);
  adjustBattleDifficulty(bilanzResult);

  earnedXp = earnedXp * weeklyMultiplier();
  const oldLevel = state.level;
  const oldTrack = state.track;
  state.xp += earnedXp;
  const newLevel = Math.max(1, Math.ceil(state.xp / 500));
  const levelUp = newLevel > oldLevel;
  state.level = newLevel;
  if(userScore > oppScore) state.battlesWon = (state.battlesWon || 0) + 1;
  if(earnedXp > 0) logXpAndStreak(earnedXp);
  saveState();
  if(earnedXp > 0) syncXpToServer(earnedXp, "battle-" + Date.now());

  // Result UI befüllen
  document.getElementById("btTrophyIcon").textContent = trophy;
  document.getElementById("btResultTitle").textContent = title;
  document.getElementById("btResultSub").textContent = sub;
  document.getElementById("btResultXp").textContent = `+${earnedXp} XP`;
  document.getElementById("btXpBefore").textContent = xpBefore;
  document.getElementById("btXpAfter").textContent = state.xp;

  go("battleResult");
  
  if (userScore >= oppScore) {
    runConfettiBattle();
  }
  
  if (levelUp) {
    setTimeout(() => showPromotion(oldTrack, newLevel), 700);
  }
}

function runConfettiBattle() {
  const canvas = document.getElementById("btConfetti");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const colors = ["#E60000","#FFFFFF","#B3000C","#E60000","#FFFFFF"];
  const parts = [];
  for(let i=0;i<80;i++){
    parts.push({ x: Math.random()*W, y: -20 - Math.random()*100, vx: (Math.random()-0.5)*3, vy: 2 + Math.random()*3, w: 5 + Math.random()*6, h: 8 + Math.random()*8, c: colors[Math.floor(Math.random()*colors.length)], r: Math.random()*Math.PI, vr: (Math.random()-0.5)*0.2 });
  }
  const t0 = performance.now();
  function frame(t){
    const elapsed = t - t0;
    ctx.clearRect(0,0,W,H);
    parts.forEach(p=>{
      p.x += p.vx; p.y += p.vy; p.r += p.vr; p.vy += 0.03;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h); ctx.restore();
    });
    if(elapsed < 2200){ requestAnimationFrame(frame); } else { ctx.clearRect(0,0,W,H); }
  }
  requestAnimationFrame(frame);
}

