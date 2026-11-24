import { supabase, isSupabaseConfigured } from './supabase.js';
import './style.css';

const grades = {
  O: { min: 91, max: 100 },
  'A+': { min: 81, max: 90 },
  A: { min: 71, max: 80 },
  'B+': { min: 61, max: 70 },
  B: { min: 56, max: 60 },
  C: { min: 50, max: 55 }
};
const app = document.querySelector('#app');
let user = null;
let profile = null;
let semesters = [];
let subjects = [];
let activeSemester = null;
let editingSubject = null;

const esc = (s='') => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => Number(n).toFixed(2).replace(/\.00$/, '');
const resultFor = (internal, grade) => {
  const needed = Math.max(0, grades[grade].min - Number(internal));
  const exam = Math.ceil((needed * 75 / 40) - 1e-10);
  return { exam, possible: exam <= 75, converted: exam <= 75 ? exam * 40 / 75 : null };
};
function notify(message, type='error') {
  const el = document.querySelector('#toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast show ${type}`;
  setTimeout(() => el.classList.remove('show'), 3600);
}
function icon(name) {
  const icons = {
    cap:'<path d="m2 10 10-5 10 5-10 5-10-5Z"/><path d="M6 12v5c3.5 2.5 8.5 2.5 12 0v-5"/>',
    grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    book:'<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21V5.5Z"/><path d="M4 17a2.5 2.5 0 0 1 2.5-2.5H20"/>',
    logout:'<path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7"/>',
    trash:'<path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6"/>',
    edit:'<path d="m14 5 5 5M4 20l4.5-1 11-11a2.1 2.1 0 0 0-3-3l-11 11L4 20Z"/>',
    close:'<path d="m6 6 12 12M18 6 6 18"/>'
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||''}</svg>`;
}
function authView(mode='login') {
  const signup = mode === 'signup';
  app.innerHTML = `
    <div class="auth-shell">
      <div class="auth-brand"><span class="brand-icon">${icon('cap')}</span><span>GradePilot</span></div>
      <section class="auth-card">
        <div class="auth-kicker">YOUR ACADEMIC WORKSPACE</div>
        <h1>${signup?'Create your account':'Welcome back'}</h1>
        <p class="muted">${signup?'Set up your personal space to track subjects and grade goals.':'Sign in to continue tracking your semester goals.'}</p>
        <form id="auth-form">
          ${signup?`<label>Username<input name="username" minlength="3" maxlength="24" required placeholder="e.g. deepak07" autocomplete="username"></label>`:''}
          <label>Email address<input name="email" type="email" required placeholder="you@example.com" autocomplete="email"></label>
          <label>Password<input name="password" type="password" minlength="6" required placeholder="At least 6 characters" autocomplete="${signup?'new-password':'current-password'}"></label>
          <button class="primary full" type="submit">${signup?'Create account':'Sign in'} <span>→</span></button>
        </form>
        <div class="auth-switch">${signup?'Already have an account?':'New to GradePilot?'} <button id="switch-auth">${signup?'Sign in':'Create an account'}</button></div>
        <div class="security-note">Your account is protected by Supabase Authentication. Passwords are never stored in the GradePilot subjects database.</div>
      </section>
      <div class="auth-foot">GRADE SMARTER. PLAN BETTER.</div>
    </div><div id="toast" class="toast"></div>`;
  document.querySelector('#switch-auth').onclick = () => authView(signup?'login':'signup');
  document.querySelector('#auth-form').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = fd.get('email').trim();
    const password = fd.get('password');
    const btn = e.currentTarget.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Please wait…';
    try {
      if (signup) {
        const username = fd.get('username').trim();
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { username } } });
        if (error) throw error;
        if (data.session) {
          await createProfile(data.user.id, username);
          await loadApp();
        } else {
          notify('Account created. Check your email to confirm, then sign in.', 'success');
          authView('login');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await loadApp();
      }
    } catch(err) { notify(err.message); btn.disabled=false; btn.textContent=signup?'Create account':'Sign in'; }
  };
}
async function createProfile(id, username) {
  const { error } = await supabase.from('profiles').upsert({ id, username }, { onConflict: 'id' });
  if (error) throw error;
}
async function loadApp() {
  const { data: { user: current }, error } = await supabase.auth.getUser();
  if (error || !current) return authView();
  user = current;
  const { data: p, error: pe } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (pe) throw pe;
  profile = p;
  if (!profile) {
    const username = user.user_metadata?.username || user.email.split('@')[0];
    await createProfile(user.id, username);
    profile = { id:user.id, username };
  }
  await refreshData();
  renderDashboard();
}
async function refreshData() {
  const [s, sub] = await Promise.all([
    supabase.from('semesters').select('*').order('sort_order'),
    supabase.from('subjects').select('*').order('created_at', { ascending:false })
  ]);
  if (s.error) throw s.error;
  if (sub.error) throw sub.error;
  semesters = s.data || [];
  subjects = sub.data || [];
  if (!activeSemester || !semesters.some(x=>x.id===activeSemester)) activeSemester = semesters[0]?.id || null;
}
function renderDashboard() {
  const currentSubjects = subjects.filter(s=>s.semester_id===activeSemester);
  const avg = currentSubjects.length ? currentSubjects.reduce((a,s)=>a+Number(s.internal_marks),0)/currentSubjects.length : 0;
  const aTargets = currentSubjects.filter(s=>s.target_grade==='A+'||s.target_grade==='O').length;
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="side-brand"><span class="brand-icon">${icon('cap')}</span><span>GradePilot</span></div>
        <div class="side-label">WORKSPACE</div>
        <div class="side-nav active">${icon('grid')}<span>Overview</span></div>
        <div class="side-label semester-label">SEMESTERS</div>
        <div id="side-semesters">${semesters.map(s=>`<button class="side-sem ${s.id===activeSemester?'selected':''}" data-sem="${s.id}">${icon('book')}<span>${esc(s.name)}</span></button>`).join('')}</div>
        <button class="side-add" id="add-sem-side">${icon('plus')} Add semester</button>
        <div class="side-bottom">
          <div class="user-avatar">${esc((profile.username||'S').slice(0,1).toUpperCase())}</div>
          <div class="user-meta"><strong>${esc(profile.username)}</strong><span>${esc(user.email)}</span></div>
          <button class="icon-btn logout" id="logout" title="Sign out">${icon('logout')}</button>
        </div>
      </aside>
      <main class="main-area">
        <header class="topbar">
          <div><div class="breadcrumb">WORKSPACE <span>/</span> OVERVIEW</div><h1>Good ${new Date().getHours()<12?'morning':new Date().getHours()<18?'afternoon':'evening'}, ${esc(profile.username)}.</h1><p>Keep your academic goals in view. One subject at a time.</p></div>
          <button class="primary add-top" id="add-subject">${icon('plus')} Add subject</button>
        </header>
        <section class="metric-grid">
          <div class="metric"><div class="metric-label">SUBJECTS IN SEMESTER</div><div class="metric-value">${currentSubjects.length}</div><div class="metric-foot">Saved in this semester</div></div>
          <div class="metric"><div class="metric-label">AVERAGE INTERNAL</div><div class="metric-value">${currentSubjects.length?fmt(avg):'—'}<small>${currentSubjects.length?'/ 60':''}</small></div><div class="metric-foot">Across current subjects</div></div>
          <div class="metric"><div class="metric-label">O / A+ TARGETS</div><div class="metric-value">${aTargets}</div><div class="metric-foot">Subjects aiming high</div></div>
        </section>
        <section class="content-card">
          <div class="content-head">
            <div><div class="section-eyebrow">SUBJECT MANAGEMENT</div><h2>${activeSemester?esc(semesters.find(s=>s.id===activeSemester)?.name):'Your semesters'}</h2><p>Track internal marks and calculate the exam score needed for your target grade.</p></div>
            <button class="secondary" id="add-sem">${icon('plus')} New semester</button>
          </div>
          ${semesters.length?`<div class="semester-tabs">${semesters.map(s=>`<button class="semester-tab ${s.id===activeSemester?'active':''}" data-sem="${s.id}">${esc(s.name)}</button>`).join('')}</div>`:''}
          ${!activeSemester?`<div class="empty-state"><div class="empty-symbol">${icon('book')}</div><h3>Create your first semester</h3><p>Add a semester, then add your subjects and target grades.</p><button class="primary" id="empty-add-sem">${icon('plus')} Create semester</button></div>`:
          currentSubjects.length?`<div class="table-wrap"><table><thead><tr><th>SUBJECT</th><th>INTERNAL</th><th>TARGET</th><th>EXAM NEEDED</th><th></th></tr></thead><tbody>
          ${currentSubjects.map(s=>{const r=resultFor(s.internal_marks,s.target_grade);return `<tr><td><div class="subject-name">${esc(s.name)}</div><div class="subject-sub">Added ${new Date(s.created_at).toLocaleDateString()}</div></td><td><strong>${fmt(s.internal_marks)}</strong><span class="table-muted"> / 60</span></td><td><span class="grade-chip">${esc(s.target_grade)}</span></td><td>${r.possible?`<strong class="exam-score">${r.exam}</strong><span class="table-muted"> / 75</span>`:`<span class="unavailable">Not possible</span>`}</td><td><div class="row-actions"><button class="icon-btn edit-sub" data-id="${s.id}" title="Edit">${icon('edit')}</button><button class="icon-btn delete-sub" data-id="${s.id}" title="Delete">${icon('trash')}</button></div></td></tr>`}).join('')}
          </tbody></table></div>`:`<div class="empty-state"><div class="empty-symbol">${icon('book')}</div><h3>No subjects added yet</h3><p>Add your first subject to start tracking your internal marks and grade goals.</p><button class="primary" id="empty-add-sub">${icon('plus')} Add first subject</button></div>`}
        </section>
        <footer class="dashboard-foot">Your data is securely stored in your personal GradePilot workspace.</footer>
      </main>
    </div>
    <div id="modal-root"></div><div id="toast" class="toast"></div>`;
  document.querySelectorAll('[data-sem]').forEach(el=>el.onclick=()=>{activeSemester=el.dataset.sem;renderDashboard();});
  ['add-sem','add-sem-side','empty-add-sem'].forEach(id=>document.getElementById(id)?.addEventListener('click',()=>semesterModal()));
  ['add-subject','empty-add-sub'].forEach(id=>document.getElementById(id)?.addEventListener('click',()=>subjectModal()));
  document.querySelectorAll('.edit-sub').forEach(b=>b.onclick=()=>subjectModal(subjects.find(s=>s.id===b.dataset.id)));
  document.querySelectorAll('.delete-sub').forEach(b=>b.onclick=()=>deleteSubject(b.dataset.id));
  document.querySelector('#logout').onclick=async()=>{await supabase.auth.signOut();user=null;profile=null;authView();};
}
function openModal(content) {
  const root=document.querySelector('#modal-root');
  root.innerHTML=`<div class="modal-backdrop"><section class="modal">${content}</section></div>`;
  root.querySelector('.modal-backdrop').addEventListener('click',e=>{if(e.target.classList.contains('modal-backdrop'))root.innerHTML='';});
  root.querySelector('.modal-close').onclick=()=>root.innerHTML='';
}
function semesterModal() {
  openModal(`<div class="modal-head"><div><div class="section-eyebrow">ORGANIZE YOUR STUDIES</div><h2>Add a semester</h2><p>Create a semester to group its subjects.</p></div><button class="icon-btn modal-close">${icon('close')}</button></div>
  <form id="semester-form"><label>Semester name<input name="name" required maxlength="50" placeholder="e.g. Semester 3"></label><button class="primary full">Save semester</button></form>`);
  document.querySelector('#semester-form').onsubmit=async e=>{e.preventDefault();const name=new FormData(e.currentTarget).get('name').trim();try{const {data,error}=await supabase.from('semesters').insert({user_id:user.id,name,sort_order:semesters.length+1}).select().single();if(error)throw error;activeSemester=data.id;await refreshData();renderDashboard();notify('Semester created.','success');}catch(err){notify(err.message);}};
}
function subjectModal(subject=null) {
  if(!activeSemester){notify('Create a semester first.');return;}
  editingSubject=subject?.id||null;
  openModal(`<div class="modal-head"><div><div class="section-eyebrow">${subject?'UPDATE SUBJECT':'SUBJECT DETAILS'}</div><h2>${subject?'Edit subject':'Add a subject'}</h2><p>Enter the internal score and the grade you want to achieve.</p></div><button class="icon-btn modal-close">${icon('close')}</button></div>
  <form id="subject-form">
    <label>Subject name<input name="name" required maxlength="100" placeholder="e.g. Data Structures" value="${esc(subject?.name||'')}"></label>
    <label>Internal marks <span class="label-hint">Out of 60</span><input name="internal_marks" type="number" min="0" max="60" step="0.01" required placeholder="e.g. 47" value="${subject?esc(subject.internal_marks):''}"></label>
    <label>Target grade<select name="target_grade">${Object.keys(grades).map(g=>`<option value="${g}" ${subject?.target_grade===g?'selected':''}>${g} · ${grades[g].min}–${grades[g].max}</option>`).join('')}</select></label>
    <label>Semester<select name="semester_id">${semesters.map(s=>`<option value="${s.id}" ${s.id===(subject?.semester_id||activeSemester)?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label>
    <div class="modal-actions"><button type="button" class="secondary modal-close">Cancel</button><button class="primary">${subject?'Save changes':'Save subject'}</button></div>
  </form>`);
  document.querySelector('#subject-form').onsubmit=async e=>{
    e.preventDefault();const fd=new FormData(e.currentTarget);
    const payload={user_id:user.id,name:fd.get('name').trim(),internal_marks:Number(fd.get('internal_marks')),target_grade:fd.get('target_grade'),semester_id:fd.get('semester_id')};
    if(!payload.name||payload.internal_marks<0||payload.internal_marks>60){notify('Check the subject name and internal marks.');return;}
    try{
      const query=editingSubject?supabase.from('subjects').update(payload).eq('id',editingSubject):supabase.from('subjects').insert(payload);
      const {error}=await query;if(error)throw error;
      activeSemester=payload.semester_id;await refreshData();renderDashboard();notify(subject?'Subject updated.':'Subject saved.','success');
    }catch(err){notify(err.message);}
  };
}
async function deleteSubject(id) {
  const subject=subjects.find(s=>s.id===id);
  if(!confirm(`Delete "${subject?.name||'this subject'}"? This cannot be undone.`))return;
  const {error}=await supabase.from('subjects').delete().eq('id',id);
  if(error)return notify(error.message);
  await refreshData();renderDashboard();notify('Subject deleted.','success');
}
async function boot() {
  if(!isSupabaseConfigured) {
    app.innerHTML=`<div class="setup-page"><div class="setup-card"><div class="auth-brand"><span class="brand-icon">${icon('cap')}</span><span>GradePilot</span></div><div class="setup-mark">!</div><h1>Connect your cloud workspace</h1><p>GradePilot is ready, but your Supabase project credentials have not been added yet.</p><ol><li>Create a Supabase project.</li><li>Copy <strong>.env.example</strong> to <strong>.env</strong>.</li><li>Add your Supabase Project URL and publishable/anon key.</li><li>Run <strong>supabase/schema.sql</strong> in the Supabase SQL Editor.</li><li>Restart the app using <strong>npm run dev</strong>.</li></ol><div class="setup-warning">Use only the public anon/publishable key in this frontend. Never expose your Supabase service-role key.</div></div></div>`;
    return;
  }
  const {data:{session}}=await supabase.auth.getSession();
  if(session) {try{await loadApp();}catch(e){authView();notify(e.message);}} else authView();
  supabase.auth.onAuthStateChange(async(_event,session)=>{if(session&&!user){try{await loadApp();}catch(e){notify(e.message);}}else if(!session&&user){user=null;authView();}});
}
boot();