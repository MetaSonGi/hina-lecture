/* 메타송이 클래스 — 강사/학생 실시간 강의 플랫폼 (Firebase + 데모 모드) */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const CFG = window.HINA_CONFIG || {};
  const DEMO = !CFG.firebase;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let db = null, auth = null;
  let user = null; // {uid,email,name,photo,role,classId}

  if (!DEMO) {
    firebase.initializeApp(CFG.firebase);
    auth = firebase.auth(); db = firebase.firestore();
  } else {
    $('demoBanner').style.display = 'block';
    $('demoRow').style.display = 'flex';
  }

  /* ================= 데모 DB (localStorage) ================= */
  const DKEY = 'hina_demo_v1';
  function demoDb() {
    let d;
    try { d = JSON.parse(localStorage.getItem(DKEY)); } catch (e) { d = null; }
    if (!d) {
      d = {
        users: [
          { uid: 't1', email: 'teacher@demo', name: '김강사', role: 'teacher' },
          { uid: 's0', email: 'wait@demo', name: '박대기', role: 'pending' },
          { uid: 's1', email: 'stu@demo', name: '이학생', role: 'student', classId: 'c1' },
        ],
        classes: [{ id: 'c1', name: '3월 기초반' }],
        materials: [{ id: 'm1', classId: 'c1', week: 1, title: '1주차 OT 자료', url: '', name: 'ot.pdf' }],
        links: [{ id: 'l1', classId: 'c1', title: '수업 유튜브 채널', url: 'https://youtube.com' }],
        assignments: [{ id: 'a1', classId: 'c1', title: '1주차 과제', desc: '자기소개 페이지 만들기', due: '2026-10-18', allowGit: true }],
        submissions: [],
        sessions: [], attendance: [], views: {},
        quizzes: [], quizResults: [], certificates: [],
        lmsConfig: { progressThreshold: 80, attendThreshold: 80 },
      };
      localStorage.setItem(DKEY, JSON.stringify(d));
    }
    // 구 데모 DB 마이그레이션 (LMS 키 보정)
    if (!Array.isArray(d.sessions)) d.sessions = [];
    if (!Array.isArray(d.attendance)) d.attendance = [];
    if (!d.views || typeof d.views !== 'object') d.views = {};
    if (!Array.isArray(d.quizzes)) d.quizzes = [];
    if (!Array.isArray(d.quizResults)) d.quizResults = [];
    if (!Array.isArray(d.certificates)) d.certificates = [];
    if (!d.lmsConfig) d.lmsConfig = { progressThreshold: 80, attendThreshold: 80 };
    if (typeof d.aiKnowledge !== 'string') d.aiKnowledge = '';
    return d;
  }
  function demoSave(d) { localStorage.setItem(DKEY, JSON.stringify(d)); }
  const nid = (p) => p + Math.random().toString(36).slice(2, 9);

  /* ================= 화면 전환 ================= */
  function show(id) {
    ['view-login', 'view-pending', 'view-teacher', 'view-student'].forEach((v) =>
      $(v).style.display = v === id ? 'block' : 'none');
    window.scrollTo(0, 0);
  }

  /* ================= 인증 ================= */
  $('googleLogin').addEventListener('click', async () => {
    if (DEMO) { alert('데모 모드입니다. 아래 데모 버튼으로 입장하세요.'); return; }
    try {
      const prov = new firebase.auth.GoogleAuthProvider();
      await auth.signInWithPopup(prov);
    } catch (e) { alert('로그인 실패: ' + e.message); }
  });

  $('demoTeacher').addEventListener('click', () => loginDemo('t1'));
  $('demoStudent').addEventListener('click', () => loginDemo('s1'));
  function loginDemo(uid) {
    const d = demoDb();
    user = d.users.find((u) => u.uid === uid);
    route();
  }

  ['logout1', 'logout2', 'logout3'].forEach((id) => $(id).addEventListener('click', async () => {
    if (!DEMO) await auth.signOut();
    user = null; show('view-login');
  }));

  if (!DEMO) {
    auth.onAuthStateChanged(async (fu) => {
      if (!fu) { user = null; show('view-login'); return; }
      const ref = db.collection('users').doc(fu.uid);
      const snap = await ref.get();
      const role = await resolveRole(fu);
      if (!snap.exists) {
        user = { uid: fu.uid, email: fu.email, name: fu.displayName, photo: fu.photoURL, role, classId: null };
        await ref.set({ ...user, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      } else {
        user = { uid: fu.uid, ...snap.data() };
        if (role === 'teacher' && user.role !== 'teacher') {
          user.role = 'teacher';
          await ref.update({ role: 'teacher' });
        }
      }
      route();
    });
  }

  // 강사 판정: teachers/{uid} 문서 존재 여부.
  // 최초 1회는 config/admins 문서의 emails 목록과 대조해 teachers 문서를 만든다.
  // (이메일 allowlist는 공개 저장소가 아닌 Firestore에만 보관)
  async function resolveRole(fu) {
    try {
      const t = await db.collection('teachers').doc(fu.uid).get();
      if (t.exists) return 'teacher';
      const a = await db.collection('config').doc('admins').get();
      const emails = a.exists ? (a.data().emails || []) : [];
      if (emails.includes(fu.email)) {
        await db.collection('teachers').doc(fu.uid).set({
          email: fu.email, createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        return 'teacher';
      }
    } catch (e) { console.warn('role resolve failed', e); }
    return 'pending';
  }

  $('pendingRefresh').addEventListener('click', async () => {
    if (DEMO) { route(); return; }
    const snap = await db.collection('users').doc(user.uid).get();
    user = { uid: user.uid, ...snap.data() };
    route();
  });

  function route() {
    if (!user) { show('view-login'); return; }
    if (user.role === 'teacher') { show('view-teacher'); $('tName').textContent = user.name; initTeacher(); }
    else if (user.role === 'student') { show('view-student'); $('sName').textContent = user.name; initStudent(); }
    else { show('view-pending'); }
  }

  /* 탭 전환 (공용) */
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
    const scope = t.dataset.t[0]; // t- / s-
    document.querySelectorAll(`.tab[data-t^="${scope}-"]`).forEach((x) => x.classList.toggle('active', x === t));
    document.querySelectorAll('.tpanel').forEach((p) => p.classList.toggle('active', p.id === t.dataset.t));
  }));

  function classOptions(sel, classes, selectedId) {
    sel.innerHTML = classes.map((c) => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')
      || '<option value="">(반 없음)</option>';
  }
  async function getClasses() {
    if (DEMO) return demoDb().classes;
    const s = await db.collection('classes').orderBy('createdAt').get();
    return s.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  /* ================= 강사 ================= */
  let tClasses = [];
  let tStudents = [];
  let tSubsMap = {}, tAssignsMap = {}; // AI 과제 피드백용 캐시
  async function initTeacher() {
    tClasses = await getClasses();
    ['classSelect', 'matClass', 'linkClass', 'asClass', 'boardClass', 'attClass', 'progClass', 'quizClass'].forEach((id) => classOptions($(id), tClasses, tClasses[0]?.id));
    await Promise.all([loadPending(), loadRoster(), loadMaterials(), loadLinks(), loadAssignments(), loadDriveFolder()]);
    initTeacherLms();
  }

  $('createClass').addEventListener('click', async () => {
    const name = $('newClassName').value.trim();
    if (!name) { alert('반 이름을 입력하세요.'); return; }
    if (DEMO) { const d = demoDb(); const c = { id: nid('c'), name }; d.classes.push(c); demoSave(d); }
    else await db.collection('classes').add({ name, teacherId: user.uid, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    $('newClassName').value = '';
    initTeacher();
  });

  async function loadPending() {
    let list;
    if (DEMO) list = demoDb().users.filter((u) => u.role === 'pending');
    else { const s = await db.collection('users').where('role', '==', 'pending').get(); list = s.docs.map((d) => ({ uid: d.id, ...d.data() })); }
    $('pendingList').innerHTML = list.length ? list.map((u) => `
      <li><span>${esc(u.name)} <span class="meta">${esc(u.email)}</span></span>
      <button class="btn small primary" data-approve="${u.uid}">승인 → ${esc($('classSelect').selectedOptions[0]?.text || '반')}</button></li>`).join('')
      : '<li><span class="meta">대기 중인 학생이 없습니다</span></li>';
    $('pendingList').querySelectorAll('[data-approve]').forEach((b) => b.addEventListener('click', () => approve(b.dataset.approve)));
  }

  async function approve(uid) {
    const classId = $('classSelect').value;
    if (!classId) { alert('먼저 반을 만드세요.'); return; }
    if (DEMO) { const d = demoDb(); const u = d.users.find((x) => x.uid === uid); u.role = 'student'; u.classId = classId; demoSave(d); }
    else await db.collection('users').doc(uid).update({ role: 'student', classId });
    loadPending(); loadRoster();
  }

  async function loadRoster() {
    let students;
    if (DEMO) students = demoDb().users.filter((u) => u.role === 'student');
    else { const s = await db.collection('users').where('role', '==', 'student').get(); students = s.docs.map((d) => ({ uid: d.id, ...d.data() })); }
    tStudents = students;
    const unassigned = students.filter((s) => !s.classId);
    $('classRoster').innerHTML = tClasses.map((c) => {
      const members = students.filter((s) => s.classId === c.id);
      return `<div class="week-group"><div class="week-title">${esc(c.name)} (${members.length}명)
        <button class="btn small ghost" data-renameclass="${c.id}" data-name="${esc(c.name)}" style="margin-left:8px">이름 변경</button>
        <button class="btn small ghost" data-delclass="${c.id}" data-name="${esc(c.name)}" style="margin-left:4px">삭제</button></div>
        ${members.map((m) => `<div class="mat-item"><span>${esc(m.name)} <span class="meta">${esc(m.email)}</span></span></div>`).join('') || '<p class="hint">학생 없음</p>'}</div>`;
    }).join('') + (unassigned.length ? `<div class="week-group"><div class="week-title">미배정 (${unassigned.length}명)</div>
      ${unassigned.map((m) => `<div class="mat-item"><span>${esc(m.name)} <span class="meta">${esc(m.email)}</span></span></div>`).join('')}</div>` : '');
    $('classRoster').querySelectorAll('[data-renameclass]').forEach((b) =>
      b.addEventListener('click', () => renameClass(b.dataset.renameclass, b.dataset.name)));
    $('classRoster').querySelectorAll('[data-delclass]').forEach((b) =>
      b.addEventListener('click', () => delClass(b.dataset.delclass, b.dataset.name)));
  }

  // 반 이름 변경
  async function renameClass(id, oldName) {
    const name = prompt('반 새 이름', oldName);
    if (name === null) return;
    const newName = name.trim();
    if (!newName) { alert('반 이름을 입력하세요.'); return; }
    if (newName === oldName) return;
    if (DEMO) { const d = demoDb(); const c = d.classes.find((x) => x.id === id); if (c) c.name = newName; demoSave(d); }
    else await db.collection('classes').doc(id).update({ name: newName });
    initTeacher();
  }

  // 반 삭제: 관련 자료·링크·과제·제출·보드 도형까지 함께 삭제, 소속 학생은 미배정
  async function delClass(id, name) {
    const members = tStudents.filter((s) => s.classId === id);
    if (!confirm(`'${name}' 반을 삭제할까요?\n자료·과제·화이트보드도 함께 지워집니다.${members.length ? `\n학생 ${members.length}명은 미배정 상태가 됩니다.` : ''}`)) return;
    if (DEMO) {
      const d = demoDb();
      d.classes = d.classes.filter((c) => c.id !== id);
      const delMids = new Set(d.materials.filter((m) => m.classId === id).map((m) => m.id));
      d.materials = d.materials.filter((m) => m.classId !== id);
      d.links = d.links.filter((l) => l.classId !== id);
      const aids = d.assignments.filter((a) => a.classId === id).map((a) => a.id);
      d.assignments = d.assignments.filter((a) => a.classId !== id);
      d.submissions = d.submissions.filter((s) => !aids.includes(s.assignmentId));
      d.sessions = d.sessions.filter((s) => s.classId !== id);
      d.attendance = d.attendance.filter((a) => a.classId !== id);
      d.quizzes = d.quizzes.filter((q) => q.classId !== id);
      d.quizResults = d.quizResults.filter((r) => r.classId !== id);
      d.certificates = d.certificates.filter((c) => c.classId !== id);
      Object.keys(d.views || {}).forEach((uid) => { delMids.forEach((mid) => { delete d.views[uid][mid]; }); });
      d.users.forEach((u) => { if (u.classId === id) u.classId = null; });
      demoSave(d);
    } else {
      const [mats, links, assigns, shapes, sess, attRecs, quizRecs, qresRecs] = await Promise.all([
        db.collection('materials').where('classId', '==', id).get(),
        db.collection('links').where('classId', '==', id).get(),
        db.collection('assignments').where('classId', '==', id).get(),
        db.collection('boards').doc(id).collection('shapes').get(),
        db.collection('classes').doc(id).collection('sessions').get(),
        db.collection('classes').doc(id).collection('attendance').get(),
        db.collection('classes').doc(id).collection('quizzes').get(),
        db.collection('classes').doc(id).collection('quizResults').get(),
      ]);
      const batch = db.batch();
      mats.forEach((x) => batch.delete(x.ref));
      links.forEach((x) => batch.delete(x.ref));
      const aids = [];
      assigns.forEach((x) => { aids.push(x.id); batch.delete(x.ref); });
      for (const aid of aids) {
        const subs = await db.collection('submissions').where('assignmentId', '==', aid).get();
        subs.forEach((x) => batch.delete(x.ref));
      }
      members.forEach((s) => batch.update(db.collection('users').doc(s.uid), { classId: null }));
      shapes.forEach((x) => batch.delete(x.ref));
      sess.forEach((x) => batch.delete(x.ref));
      attRecs.forEach((x) => batch.delete(x.ref));
      quizRecs.forEach((x) => batch.delete(x.ref));
      qresRecs.forEach((x) => batch.delete(x.ref));
      const certs = await db.collection('certificates').where('classId', '==', id).get();
      certs.forEach((x) => batch.delete(x.ref));
      batch.delete(db.collection('classes').doc(id));
      await batch.commit();
    }
    initTeacher();
  }

  // --- 주차별 자료 (드라이브 공유 링크 방식 — Storage 무료 플랜 미지원 대체) ---
  async function loadMaterials() {
    let mats;
    if (DEMO) mats = demoDb().materials;
    else { const s = await db.collection('materials').orderBy('week').get(); mats = s.docs.map((d) => ({ id: d.id, ...d.data() })); }
    const cls = $('matClass').value || tClasses[0]?.id;
    const mine = mats.filter((m) => m.classId === cls).sort((a, b) => a.week - b.week);
    const weeks = [...new Set(mine.map((m) => m.week))].sort((a, b) => a - b);
    $('matList').innerHTML = weeks.map((w) => `
      <div class="week-group"><div class="week-title">${w}주차</div>
      ${mine.filter((m) => m.week === w).map((m) => `
        <div class="mat-item"><span>📄 ${esc(m.title)}</span>
        <span><button class="btn small" data-openlink="${esc(m.url)}">보기</button>
        <button class="btn small ghost" data-delmat="${m.id}">삭제</button></span></div>`).join('')}</div>`).join('')
      || '<p class="hint">올린 자료가 없습니다</p>';
    bindOpenLink($('matList'));
    $('matList').querySelectorAll('[data-delmat]').forEach((b) => b.addEventListener('click', () => delMaterial(b.dataset.delmat)));
  }
  $('matClass').addEventListener('change', loadMaterials);

  // 링크는 새 탭으로 열기 (드라이브 공유 링크는 iframe 임베드가 막힐 수 있음)
  function bindOpenLink(root) {
    root.querySelectorAll('[data-openlink]').forEach((b) => b.addEventListener('click', () => {
      window.open(b.dataset.openlink, '_blank', 'noopener');
    }));
  }

  async function delMaterial(id) {
    if (!confirm('삭제할까요?')) return;
    if (DEMO) { const d = demoDb(); d.materials = d.materials.filter((m) => m.id !== id); demoSave(d); }
    else await db.collection('materials').doc(id).delete();
    loadMaterials();
  }

  $('matUpload').addEventListener('click', async () => {
    const classId = $('matClass').value, week = +$('matWeek').value;
    const title = $('matTitle').value.trim(), url = $('matUrl').value.trim();
    if (!classId) { alert('반을 먼저 만드세요.'); return; }
    if (!title || !url) { alert('자료 제목과 드라이브 공유 링크를 입력하세요.'); return; }
    $('matUpload').disabled = true; $('matUpload').textContent = '추가 중…';
    try {
      const doc = { classId, week, title, url, createdAt: Date.now() };
      if (DEMO) { const d = demoDb(); doc.id = nid('m'); d.materials.push(doc); demoSave(d); }
      else await db.collection('materials').add({ ...doc, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      $('matTitle').value = ''; $('matUrl').value = '';
      loadMaterials();
    } catch (e) { alert('추가 실패: ' + e.message); }
    finally { $('matUpload').disabled = false; $('matUpload').textContent = '➕ 자료 추가'; }
  });

  // --- 드라이브 폴더 링크 (강사가 1회 등록, Firestore에만 저장 — 저장소에 노출 안 됨) ---
  async function loadDriveFolder() {
    let url = '';
    if (DEMO) url = localStorage.getItem('hina_drive_folder') || '';
    else {
      try {
        const s = await db.collection('config').doc('drive').get();
        if (s.exists) url = s.data().folderUrl || '';
      } catch (e) { console.warn('drive config load failed', e); }
    }
    if (url) {
      $('driveFolderInput').value = url;
      $('driveFolderOpen').style.display = ''; $('driveFolderOpen').href = url;
    }
  }
  $('driveFolderSave').addEventListener('click', async () => {
    const url = $('driveFolderInput').value.trim();
    if (!url) { alert('폴더 공유 링크를 입력하세요.'); return; }
    try {
      if (DEMO) localStorage.setItem('hina_drive_folder', url);
      else await db.collection('config').doc('drive').set({ folderUrl: url }, { merge: true });
      $('driveFolderOpen').style.display = ''; $('driveFolderOpen').href = url;
      alert('저장됐습니다.');
    } catch (e) { alert('저장 실패: ' + e.message); }
  });

  // --- 자료실 링크 ---
  async function loadLinks() {
    let links;
    if (DEMO) links = demoDb().links;
    else { const s = await db.collection('links').get(); links = s.docs.map((d) => ({ id: d.id, ...d.data() })); }
    const cls = $('linkClass').value || tClasses[0]?.id;
    $('linkList').innerHTML = links.filter((l) => l.classId === cls).map((l) => `
      <li><span>🔗 <a href="${esc(l.url)}" target="_blank" rel="noopener" style="color:#58a6ff">${esc(l.title)}</a>
      <span class="meta">${esc(l.url)}</span></span>
      <button class="btn small ghost" data-dellink="${l.id}">삭제</button></li>`).join('')
      || '<li><span class="meta">등록된 링크가 없습니다</span></li>';
    $('linkList').querySelectorAll('[data-dellink]').forEach((b) => b.addEventListener('click', async () => {
      if (DEMO) { const d = demoDb(); d.links = d.links.filter((x) => x.id !== b.dataset.dellink); demoSave(d); }
      else await db.collection('links').doc(b.dataset.dellink).delete();
      loadLinks();
    }));
  }
  $('linkClass').addEventListener('change', loadLinks);
  $('linkAdd').addEventListener('click', async () => {
    const classId = $('linkClass').value, title = $('linkTitle').value.trim(), url = $('linkUrl').value.trim();
    if (!classId || !title || !url) { alert('반·제목·URL을 모두 입력하세요.'); return; }
    if (DEMO) { const d = demoDb(); d.links.push({ id: nid('l'), classId, title, url }); demoSave(d); }
    else await db.collection('links').add({ classId, title, url, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    $('linkTitle').value = ''; $('linkUrl').value = '';
    loadLinks();
  });

  // --- 과제 ---
  async function loadAssignments() {
    let assigns, subs, students;
    if (DEMO) {
      const d = demoDb(); assigns = d.assignments; subs = d.submissions;
      students = d.users.filter((u) => u.role === 'student');
    } else {
      const [a, s, u] = await Promise.all([
        db.collection('assignments').get(), db.collection('submissions').get(),
        db.collection('users').where('role', '==', 'student').get(),
      ]);
      assigns = a.docs.map((x) => ({ id: x.id, ...x.data() }));
      subs = s.docs.map((x) => ({ id: x.id, ...x.data() }));
      students = u.docs.map((x) => ({ uid: x.id, ...x.data() }));
    }
    const cls = $('asClass').value || tClasses[0]?.id;
    const clsStudents = students.filter((x) => x.classId === cls);
    tSubsMap = {}; subs.forEach((s) => { tSubsMap[s.id] = s; });
    tAssignsMap = {}; assigns.forEach((a) => { tAssignsMap[a.id] = a; });
    $('assignList').innerHTML = assigns.filter((a) => a.classId === cls).map((a) => {
      const aSubs = subs.filter((x) => x.assignmentId === a.id);
      return `<div class="assign-card"><h3>📝 ${esc(a.title)}</h3>
        <div class="meta">${esc(a.desc || '')} · 마감: ${esc(a.due || '없음')} · Git 제출 ${a.allowGit ? '허용' : '불가'}</div>
        ${clsStudents.map((st) => {
          const sub = aSubs.find((x) => x.studentId === st.uid);
          return `<div class="sub-row"><span>${esc(st.name)}</span>
            ${sub ? `<span>${sub.type === 'git' ? `🔗 <a href="${esc(sub.url)}" target="_blank" rel="noopener">${esc(sub.url)}</a>` : `📎 <a href="${esc(sub.url)}" target="_blank" rel="noopener">${esc(sub.name || sub.url)}</a>`}
            <span class="pill done">제출됨</span>
            <button class="btn small" data-aifb="${sub.id}" title="AI가 피드백 초안을 만듭니다">🤖 AI 피드백${sub.aiFeedback ? ' ✓' : ''}</button></span>`
            : `<span class="no">미제출 <span class="pill wait">대기</span></span>`}</div>`;
        }).join('') || '<p class="hint">이 반에 학생이 없습니다</p>'}</div>`;
    }).join('') || '<p class="hint">만든 과제가 없습니다</p>';
    $('assignList').querySelectorAll('[data-aifb]').forEach((b) => b.addEventListener('click', () => openAiFeedback(b.dataset.aifb)));
  }
  $('asClass').addEventListener('change', loadAssignments);
  $('asCreate').addEventListener('click', async () => {
    const classId = $('asClass').value, title = $('asTitle').value.trim();
    if (!classId || !title) { alert('반과 과제 제목을 입력하세요.'); return; }
    const doc = { classId, title, desc: $('asDesc').value.trim(), due: $('asDue').value, allowGit: $('asGit').checked };
    if (DEMO) { const d = demoDb(); doc.id = nid('a'); d.assignments.push(doc); demoSave(d); }
    else await db.collection('assignments').add({ ...doc, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    $('asTitle').value = ''; $('asDesc').value = ''; $('asDue').value = '';
    loadAssignments();
  });

  $('openBoardT').addEventListener('click', () => {
    const room = $('boardClass').value || tClasses[0]?.id || 'demo';
    location.href = `whiteboard.html?room=${encodeURIComponent(room)}&mode=edit${DEMO ? '&demo=1' : ''}`;
  });

  /* ================= 학생 ================= */
  async function initStudent() {
    const cls = tClasses.length ? tClasses : await getClasses();
    const myClass = cls.find((c) => c.id === user.classId);
    $('sMatTitle').textContent = `📚 강의 자료 — ${myClass ? esc(myClass.name) : ''}`;

    let mats, links, assigns, subs;
    if (DEMO) { const d = demoDb(); mats = d.materials; links = d.links; assigns = d.assignments; subs = d.submissions; }
    else {
      const [m, l, a, s] = await Promise.all([
        db.collection('materials').where('classId', '==', user.classId).get(),
        db.collection('links').where('classId', '==', user.classId).get(),
        db.collection('assignments').where('classId', '==', user.classId).get(),
        db.collection('submissions').where('studentId', '==', user.uid).get(),
      ]);
      mats = m.docs.map((x) => ({ id: x.id, ...x.data() }));
      links = l.docs.map((x) => ({ id: x.id, ...x.data() }));
      assigns = a.docs.map((x) => ({ id: x.id, ...x.data() }));
      subs = s.docs.map((x) => ({ id: x.id, ...x.data() }));
    }

    const weeks = [...new Set(mats.map((m) => m.week))].sort((a, b) => a - b);
    sMats = mats; sAssigns = assigns; sSubs = subs; // LMS(진도율·체크리스트)용 캐시
    $('sMatList').innerHTML = weeks.map((w) => `
      <div class="week-group"><div class="week-title">${w}주차</div>
      ${mats.filter((m) => m.week === w).map((m) => `
        <div class="mat-item"><span>📄 ${esc(m.title)}</span>
        <button class="btn small" data-openlink="${esc(m.url)}" data-matid="${m.id}">보기</button></div>`).join('')}</div>`).join('')
      || '<p class="hint">아직 올라온 자료가 없습니다</p>';
    bindOpenLink($('sMatList'));
    // 자료 열람 기록 (진도율 추적용)
    $('sMatList').querySelectorAll('[data-matid]').forEach((b) => b.addEventListener('click', () => recordView(b.dataset.matid)));

    $('sLinkList').innerHTML = links.map((l) => `
      <li><span>🔗 <a href="${esc(l.url)}" target="_blank" rel="noopener" style="color:#58a6ff">${esc(l.title)}</a></span></li>`).join('')
      || '<li><span class="meta">등록된 링크가 없습니다</span></li>';

    $('sAssignList').innerHTML = assigns.map((a) => {
      const sub = subs.find((x) => x.assignmentId === a.id);
      return `<div class="assign-card"><h3>📝 ${esc(a.title)}</h3>
        <div class="meta">${esc(a.desc || '')} · 마감: ${esc(a.due || '없음')}</div>
        ${sub ? `<div><span class="pill done">제출 완료</span>
          ${sub.type === 'git' ? ` <a href="${esc(sub.url)}" target="_blank" rel="noopener" style="color:#58a6ff">${esc(sub.url)}</a>` : ` <a href="${esc(sub.url)}" target="_blank" rel="noopener" style="color:#58a6ff">${esc(sub.name || sub.url)}</a>`}</div>
          ${sub.aiFeedback ? `<div class="ai-fb"><b>🤖 AI 피드백</b><p>${esc(sub.aiFeedback)}</p></div>` : ''}`
        : `<div class="row">
            <input type="url" id="link_${a.id}" placeholder="파일/드라이브 공유 링크" style="flex:1" />
            ${a.allowGit ? `<input type="url" id="git_${a.id}" placeholder="Git 저장소 URL (선택)" style="flex:1" />` : ''}
            <button class="btn small primary" data-submit="${a.id}">제출하기</button>
          </div>`}</div>`;
    }).join('') || '<p class="hint">등록된 과제가 없습니다</p>';

    $('sAssignList').querySelectorAll('[data-submit]').forEach((b) => b.addEventListener('click', () => submitAssignment(b.dataset.submit)));

    $('openBoardS').addEventListener('click', () => {
      location.href = `whiteboard.html?room=${encodeURIComponent(user.classId || 'demo')}&mode=edit${DEMO ? '&demo=1' : ''}`;
    });

    initStudentLms();
  }

  async function submitAssignment(assignId) {
    const linkUrl = $(`link_${assignId}`)?.value.trim();
    const gitUrl = $(`git_${assignId}`)?.value.trim();
    if (!linkUrl && !gitUrl) { alert('파일/드라이브 링크 또는 Git URL을 입력하세요.'); return; }
    try {
      const doc = gitUrl
        ? { assignmentId: assignId, studentId: user.uid, studentName: user.name, type: 'git', url: gitUrl, createdAt: Date.now() }
        : { assignmentId: assignId, studentId: user.uid, studentName: user.name, type: 'link', url: linkUrl, createdAt: Date.now() };
      if (DEMO) { const d = demoDb(); doc.id = nid('s'); d.submissions.push(doc); demoSave(d); }
      else await db.collection('submissions').add({ ...doc, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      alert('제출 완료!');
      initStudent();
    } catch (e) { alert('제출 실패: ' + e.message); }
  }
  /* ================= LMS: 출석·진도·퀴즈·수료증 ================= */
  let sMats = [], sAssigns = [], sSubs = []; // 학생용 캐시 (진도율·체크리스트)
  let quizQuestions = []; // 퀴즈 출제 임시 문항

  const todayStr = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 100);
  function fmtDateTime(t) {
    if (!t) return '';
    const d = t.toDate ? t.toDate() : new Date(t);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  /* ---------- 공용 조회 ---------- */
  async function getSessions(classId) {
    if (DEMO) return demoDb().sessions.filter((s) => s.classId === classId).sort((a, b) => (a.date < b.date ? -1 : 1));
    const s = await db.collection('classes').doc(classId).collection('sessions').orderBy('date').get();
    return s.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  async function getAttendance(classId) {
    if (DEMO) return demoDb().attendance.filter((a) => a.classId === classId);
    const s = await db.collection('classes').doc(classId).collection('attendance').get();
    return s.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  async function getQuizzes(classId, includeUnpublished) {
    if (DEMO) {
      const q = demoDb().quizzes.filter((x) => x.classId === classId);
      return (includeUnpublished ? q : q.filter((x) => x.published)).sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
    }
    let q = db.collection('classes').doc(classId).collection('quizzes');
    if (!includeUnpublished) q = q.where('published', '==', true);
    const s = await q.get();
    return s.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  async function getQuizResults(classId, uid) {
    if (DEMO) {
      let r = demoDb().quizResults.filter((x) => x.classId === classId);
      if (uid) r = r.filter((x) => x.uid === uid);
      return r;
    }
    let q = db.collection('classes').doc(classId).collection('quizResults');
    if (uid) q = q.where('uid', '==', uid);
    const s = await q.get();
    return s.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  async function getLmsConfig() {
    const def = { progressThreshold: 80, attendThreshold: 80 };
    if (DEMO) return { ...def, ...demoDb().lmsConfig };
    try {
      const s = await db.collection('config').doc('lms').get();
      return s.exists ? { ...def, ...s.data() } : def;
    } catch (e) { console.warn('lms config load failed', e); return def; }
  }
  async function getClassStudents() {
    if (DEMO) return demoDb().users.filter((u) => u.role === 'student');
    if (tStudents.length) return tStudents;
    const s = await db.collection('users').where('role', '==', 'student').get();
    return s.docs.map((d) => ({ uid: d.id, ...d.data() }));
  }

  /* ---------- 학생별 통계 (진도율·출석률·퀴즈) ---------- */
  async function computeStudentStats(classId, uid) {
    let mats, assigns, subs, views, sessions, att, quizzes, results;
    if (DEMO) {
      const d = demoDb();
      mats = d.materials.filter((m) => m.classId === classId);
      assigns = d.assignments.filter((a) => a.classId === classId);
      const aids = new Set(assigns.map((a) => a.id));
      subs = d.submissions.filter((s) => s.studentId === uid && aids.has(s.assignmentId));
      views = d.views[uid] || {};
      sessions = d.sessions.filter((s) => s.classId === classId && s.date <= todayStr());
      att = d.attendance.filter((a) => a.classId === classId && a.uid === uid);
      quizzes = d.quizzes.filter((q) => q.classId === classId && q.published);
      const qids = new Set(quizzes.map((q) => q.id));
      results = d.quizResults.filter((r) => r.uid === uid && qids.has(r.quizId));
    } else {
      const [m, a, sb, v, ss, at, q, r] = await Promise.all([
        db.collection('materials').where('classId', '==', classId).get(),
        db.collection('assignments').where('classId', '==', classId).get(),
        db.collection('submissions').where('studentId', '==', uid).get(),
        db.collection('progress').doc(uid).collection('views').get(),
        db.collection('classes').doc(classId).collection('sessions').where('date', '<=', todayStr()).get(),
        db.collection('classes').doc(classId).collection('attendance').where('uid', '==', uid).get(),
        db.collection('classes').doc(classId).collection('quizzes').where('published', '==', true).get(),
        db.collection('classes').doc(classId).collection('quizResults').where('uid', '==', uid).get(),
      ]);
      mats = m.docs.map((d) => ({ id: d.id, ...d.data() }));
      assigns = a.docs.map((d) => ({ id: d.id, ...d.data() }));
      const aids = new Set(assigns.map((x) => x.id));
      subs = sb.docs.map((d) => d.data()).filter((s) => aids.has(s.assignmentId));
      views = {}; v.forEach((d) => { views[d.id] = d.data(); });
      sessions = ss.docs.map((d) => ({ id: d.id, ...d.data() }));
      att = at.docs.map((d) => d.data());
      quizzes = q.docs.map((d) => ({ id: d.id, ...d.data() }));
      const qids = new Set(quizzes.map((x) => x.id));
      results = r.docs.map((d) => d.data()).filter((x) => qids.has(x.quizId));
    }
    const viewedIds = mats.filter((m) => views[m.id]).map((m) => m.id);
    const submittedIds = assigns.filter((a) => subs.some((s) => s.assignmentId === a.id)).map((a) => a.id);
    const progressRate = pct(viewedIds.length + submittedIds.length, mats.length + assigns.length);
    const attBySession = {};
    att.forEach((x) => { attBySession[x.sessionId] = x.status; });
    let attScore = 0, present = 0, late = 0, absent = 0;
    sessions.forEach((s) => {
      const st = attBySession[s.id];
      if (st === 'present') { attScore += 1; present++; }
      else if (st === 'late') { attScore += 0.5; late++; }
      else absent++;
    });
    const attendRate = pct(attScore, sessions.length);
    const quizAvg = results.length
      ? Math.round(results.reduce((s, x) => s + (x.score / x.total) * 100, 0) / results.length)
      : null;
    return {
      progressRate, attendRate, viewedIds, submittedIds,
      totalMats: mats.length, totalAssigns: assigns.length,
      present, late, absent, totalSessions: sessions.length,
      quizAvg, quizTaken: results.length, quizTotal: quizzes.length,
    };
  }

  /* ---------- 강사: 출석 ---------- */
  function initTeacherLms() {
    $('sessDate').value = todayStr();
    quizQuestions = []; renderQuizQList();
    $('aiKeyT').value = aiKey();
    loadAiKnowledge();
    loadSessions(); loadProgTable(); loadQuizListT(); loadLmsConfigForm();
  }
  $('attClass').addEventListener('change', loadSessions);
  $('progClass').addEventListener('change', loadProgTable);
  $('progRefresh').addEventListener('click', loadProgTable);
  $('quizClass').addEventListener('change', loadQuizListT);

  $('sessionCreate').addEventListener('click', async () => {
    const classId = $('attClass').value || tClasses[0]?.id;
    const title = $('sessTitle').value.trim(), date = $('sessDate').value;
    if (!classId) { alert('반을 먼저 만드세요.'); return; }
    if (!title || !date) { alert('회차 제목과 날짜를 입력하세요.'); return; }
    const doc = { classId, title, date, createdBy: user.uid };
    if (DEMO) { const d = demoDb(); doc.id = nid('ss'); doc.createdAt = Date.now(); d.sessions.push(doc); demoSave(d); }
    else await db.collection('classes').doc(classId).collection('sessions').add({ ...doc, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    $('sessTitle').value = '';
    loadSessions();
  });

  async function loadSessions() {
    const classId = $('attClass').value || tClasses[0]?.id;
    if (!classId) { $('sessionList').innerHTML = '<p class="hint">반을 먼저 만드세요</p>'; return; }
    $('sessionList').innerHTML = '<p class="hint">불러오는 중…</p>';
    const [sessions, att, students] = await Promise.all([getSessions(classId), getAttendance(classId), getClassStudents()]);
    const clsStudents = students.filter((s) => s.classId === classId);
    const attMap = {};
    att.forEach((a) => { attMap[a.sessionId + '_' + a.uid] = a; });
    $('sessionList').innerHTML = sessions.map((ss) => {
      const rows = clsStudents.map((st) => {
        const rec = attMap[ss.id + '_' + st.uid];
        const cur = rec ? rec.status : '';
        const mark = rec
          ? `<span class="meta">${rec.by === 'self' ? '셀프' : '강사'} · ${esc(fmtDateTime(rec.checkedAt))}</span>`
          : '<span class="meta">미체크</span>';
        return `<tr><td style="text-align:left">${esc(st.name)}</td><td>${mark}</td>
          <td><div class="att-btns">
            <button class="btn small ${cur === 'present' ? 'primary' : ''}" data-att="${ss.id}|${st.uid}|present">출석</button>
            <button class="btn small ${cur === 'late' ? 'primary' : ''}" data-att="${ss.id}|${st.uid}|late">지각</button>
            <button class="btn small ${cur === 'absent' ? 'primary' : ''}" data-att="${ss.id}|${st.uid}|absent">결석</button>
          </div></td></tr>`;
      }).join('') || '<tr><td colspan="3"><span class="meta">이 반에 학생이 없습니다</span></td></tr>';
      return `<div class="assign-card"><h3>🗓️ ${esc(ss.title)} <span class="meta">${esc(ss.date)}</span>
        <button class="btn small ghost" data-delsess="${ss.id}" style="margin-left:8px">삭제</button></h3>
        <div class="table-wrap"><table class="lms-table"><tr><th>학생</th><th>체크 정보</th><th>출석 처리</th></tr>${rows}</table></div></div>`;
    }).join('') || '<p class="hint">만든 회차가 없습니다</p>';
    $('sessionList').querySelectorAll('[data-att]').forEach((b) => b.addEventListener('click', () => {
      const [sid, uid, status] = b.dataset.att.split('|');
      const st = clsStudents.find((x) => x.uid === uid);
      markAttendance(classId, sid, uid, st ? st.name : '', status);
    }));
    $('sessionList').querySelectorAll('[data-delsess]').forEach((b) => b.addEventListener('click', () => delSession(classId, b.dataset.delsess)));
  }

  async function markAttendance(classId, sessionId, uid, name, status) {
    if (DEMO) {
      const d = demoDb();
      const i = d.attendance.findIndex((a) => a.sessionId === sessionId && a.uid === uid);
      if (i >= 0) d.attendance[i] = { ...d.attendance[i], status, checkedAt: Date.now(), by: 'teacher' };
      else d.attendance.push({ id: sessionId + '_' + uid, classId, sessionId, uid, name, status, checkedAt: Date.now(), by: 'teacher' });
      demoSave(d);
    } else {
      await db.collection('classes').doc(classId).collection('attendance').doc(sessionId + '_' + uid)
        .set({ classId, sessionId, uid, name, status, by: 'teacher', checkedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }
    loadSessions();
  }

  async function delSession(classId, sessionId) {
    if (!confirm('이 회차와 출석 기록을 삭제할까요?')) return;
    if (DEMO) {
      const d = demoDb();
      d.sessions = d.sessions.filter((s) => s.id !== sessionId);
      d.attendance = d.attendance.filter((a) => a.sessionId !== sessionId);
      demoSave(d);
    } else {
      const batch = db.batch();
      batch.delete(db.collection('classes').doc(classId).collection('sessions').doc(sessionId));
      const at = await db.collection('classes').doc(classId).collection('attendance').where('sessionId', '==', sessionId).get();
      at.forEach((x) => batch.delete(x.ref));
      await batch.commit();
    }
    loadSessions();
  }

  /* ---------- 강사: 반 학습 현황 ---------- */
  async function loadProgTable() {
    const classId = $('progClass').value || tClasses[0]?.id;
    if (!classId) { $('progTable').innerHTML = '<p class="hint">반을 먼저 만드세요</p>'; return; }
    $('progTable').innerHTML = '<p class="hint">계산 중…</p>';
    const students = (await getClassStudents()).filter((s) => s.classId === classId);
    const rows = [];
    for (const st of students) {
      rows.push({ st, stats: await computeStudentStats(classId, st.uid) });
    }
    rows.sort((a, b) => b.stats.progressRate - a.stats.progressRate);
    $('progTable').innerHTML = `<div class="table-wrap"><table class="lms-table">
      <tr><th>학생</th><th>진도율</th><th>출석률</th><th>퀴즈 평균</th><th>자료 열람</th><th>과제 제출</th></tr>
      ${rows.map(({ st, stats }) => `<tr><td style="text-align:left">${esc(st.name)}</td>
        <td><div class="bar mini"><i style="width:${stats.progressRate}%"></i></div>${stats.progressRate}%</td>
        <td>${stats.attendRate}% <span class="meta">(${stats.present}출 ${stats.late}지 ${stats.absent}결)</span></td>
        <td>${stats.quizAvg === null ? '<span class="meta">-</span>' : stats.quizAvg + '%'}</td>
        <td>${stats.viewedIds.length}/${stats.totalMats}</td>
        <td>${stats.submittedIds.length}/${stats.totalAssigns}</td></tr>`).join('')
      || '<tr><td colspan="6"><span class="meta">이 반에 학생이 없습니다</span></td></tr>'}</table></div>`;
  }

  /* ---------- 강사: 퀴즈 출제 ---------- */
  function renderQuizQList() {
    $('quizQList').innerHTML = quizQuestions.map((qq, i) => `
      <div class="quiz-q" data-qi="${i}">
        <div class="row"><b>문항 ${i + 1}</b><span style="flex:1"></span>
          <button class="btn small ghost" data-delq="${i}">삭제</button></div>
        <input type="text" data-f="q" placeholder="질문을 입력하세요" value="${esc(qq.q)}" style="width:100%" />
        ${qq.choices.map((c, j) => `
          <div class="choice-row">
            <input type="radio" name="qans${i}" data-f="ans" value="${j}" ${qq.answer === j ? 'checked' : ''} title="정답 표시" />
            <input type="text" data-f="c${j}" placeholder="보기 ${j + 1}" value="${esc(c)}" style="flex:1" />
          </div>`).join('')}
        <p class="hint">○ 라디오 버튼으로 정답을 표시하세요</p>
      </div>`).join('') || '<p class="hint">문항 추가 버튼으로 문제를 만드세요</p>';
  }
  $('quizAddQ').addEventListener('click', () => {
    quizQuestions.push({ q: '', choices: ['', '', '', ''], answer: 0 });
    renderQuizQList();
  });
  $('quizQList').addEventListener('input', (e) => {
    const box = e.target.closest('.quiz-q'); if (!box) return;
    const i = +box.dataset.qi, f = e.target.dataset.f;
    if (f === 'q') quizQuestions[i].q = e.target.value;
    else if (f && f[0] === 'c') quizQuestions[i].choices[+f.slice(1)] = e.target.value;
  });
  $('quizQList').addEventListener('change', (e) => {
    const box = e.target.closest('.quiz-q'); if (!box) return;
    if (e.target.dataset.f === 'ans') quizQuestions[+box.dataset.qi].answer = +e.target.value;
  });
  $('quizQList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-delq]'); if (!b) return;
    quizQuestions.splice(+b.dataset.delq, 1); renderQuizQList();
  });

  $('quizCreate').addEventListener('click', async () => {
    const classId = $('quizClass').value || tClasses[0]?.id;
    const title = $('quizTitle').value.trim();
    if (!classId) { alert('반을 먼저 만드세요.'); return; }
    if (!title) { alert('퀴즈 제목을 입력하세요.'); return; }
    if (!quizQuestions.length) { alert('문항을 1개 이상 추가하세요.'); return; }
    for (let i = 0; i < quizQuestions.length; i++) {
      const qq = quizQuestions[i];
      if (!qq.q.trim() || qq.choices.some((c) => !c.trim())) { alert(`문항 ${i + 1}의 질문과 보기 4개를 모두 입력하세요.`); return; }
    }
    const doc = {
      classId, title, dueDate: $('quizDue').value || '',
      published: $('quizPublished').checked,
      questions: quizQuestions.map((qq) => ({ q: qq.q.trim(), choices: qq.choices.map((c) => c.trim()), answer: qq.answer })),
      createdBy: user.uid,
    };
    if (DEMO) { const d = demoDb(); doc.id = nid('q'); doc.createdAt = Date.now(); d.quizzes.push(doc); demoSave(d); }
    else await db.collection('classes').doc(classId).collection('quizzes').add({ ...doc, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    $('quizTitle').value = ''; $('quizDue').value = ''; $('quizPublished').checked = true;
    quizQuestions = []; renderQuizQList();
    loadQuizListT();
  });

  async function loadQuizListT() {
    const classId = $('quizClass').value || tClasses[0]?.id;
    if (!classId) { $('quizListT').innerHTML = '<p class="hint">반을 먼저 만드세요</p>'; return; }
    $('quizListT').innerHTML = '<p class="hint">불러오는 중…</p>';
    const [quizzes, results, students] = await Promise.all([
      getQuizzes(classId, true), getQuizResults(classId), getClassStudents(),
    ]);
    const clsStudents = students.filter((s) => s.classId === classId);
    $('quizListT').innerHTML = '<h2>출제된 퀴즈</h2>' + (quizzes.map((qz) => {
      const rs = results.filter((r) => r.quizId === qz.id);
      const avg = rs.length ? Math.round(rs.reduce((s, r) => s + (r.score / r.total) * 100, 0) / rs.length) : null;
      const rows = clsStudents.map((st) => {
        const r = rs.find((x) => x.uid === st.uid);
        return `<div class="sub-row"><span>${esc(st.name)}</span>${r
          ? `<span>${r.score}/${r.total}점 <span class="pill done">${Math.round((r.score / r.total) * 100)}점</span></span>`
          : '<span class="no">미응시</span>'}</div>`;
      }).join('');
      return `<div class="assign-card"><h3>📝 ${esc(qz.title)}</h3>
        <div class="meta">문항 ${qz.questions.length}개 · 마감: ${esc(qz.dueDate || '없음')} · ${qz.published ? '공개 중' : '비공개'} · 응시 ${rs.length}/${clsStudents.length}명${avg !== null ? ` · 평균 ${avg}점` : ''}</div>
        <div class="row" style="margin-top:8px">
          <button class="btn small" data-pubquiz="${qz.id}" data-pub="${qz.published ? 0 : 1}">${qz.published ? '비공개로 전환' : '공개하기'}</button>
          <button class="btn small ghost" data-delquiz="${qz.id}">삭제</button>
        </div>${rows}</div>`;
    }).join('') || '<p class="hint">출제한 퀴즈가 없습니다</p>');
    $('quizListT').querySelectorAll('[data-delquiz]').forEach((b) => b.addEventListener('click', () => delQuiz(classId, b.dataset.delquiz)));
    $('quizListT').querySelectorAll('[data-pubquiz]').forEach((b) => b.addEventListener('click', () => toggleQuizPub(classId, b.dataset.pubquiz, b.dataset.pub === '1')));
  }

  async function delQuiz(classId, quizId) {
    if (!confirm('퀴즈와 응시 결과를 삭제할까요?')) return;
    if (DEMO) {
      const d = demoDb();
      d.quizzes = d.quizzes.filter((q) => q.id !== quizId);
      d.quizResults = d.quizResults.filter((r) => r.quizId !== quizId);
      demoSave(d);
    } else {
      const batch = db.batch();
      batch.delete(db.collection('classes').doc(classId).collection('quizzes').doc(quizId));
      const rs = await db.collection('classes').doc(classId).collection('quizResults').where('quizId', '==', quizId).get();
      rs.forEach((x) => batch.delete(x.ref));
      await batch.commit();
    }
    loadQuizListT();
  }
  async function toggleQuizPub(classId, quizId, pub) {
    if (DEMO) { const d = demoDb(); const q = d.quizzes.find((x) => x.id === quizId); if (q) q.published = pub; demoSave(d); }
    else await db.collection('classes').doc(classId).collection('quizzes').doc(quizId).update({ published: pub });
    loadQuizListT();
  }

  /* ---------- 강사: 수료 기준 ---------- */
  async function loadLmsConfigForm() {
    const cfg = await getLmsConfig();
    $('cfgProg').value = cfg.progressThreshold;
    $('cfgAttend').value = cfg.attendThreshold;
  }
  $('cfgSave').addEventListener('click', async () => {
    const cfg = {
      progressThreshold: Math.min(100, Math.max(0, +$('cfgProg').value || 0)),
      attendThreshold: Math.min(100, Math.max(0, +$('cfgAttend').value || 0)),
    };
    if (DEMO) { const d = demoDb(); d.lmsConfig = cfg; demoSave(d); }
    else await db.collection('config').doc('lms').set(cfg, { merge: true });
    alert('수료 기준을 저장했습니다.');
  });

  /* ---------- 학생: 자료 열람 기록 ---------- */
  async function recordView(matId) {
    try {
      if (DEMO) {
        const d = demoDb();
        d.views[user.uid] = d.views[user.uid] || {};
        if (!d.views[user.uid][matId]) {
          d.views[user.uid][matId] = { viewedAt: Date.now(), classId: user.classId };
          demoSave(d);
        }
      } else {
        await db.collection('progress').doc(user.uid).collection('views').doc(matId)
          .set({ viewedAt: firebase.firestore.FieldValue.serverTimestamp(), classId: user.classId }, { merge: true });
      }
    } catch (e) { console.warn('view record failed', e); }
  }

  /* ---------- 학생: 내 학습 ---------- */
  async function initStudentLms() {
    $('aiKeyS').value = aiKey();
    if (!user.classId) {
      $('myStats').innerHTML = '<p class="hint">배정된 반이 없습니다</p>';
      $('myChecklist').innerHTML = ''; $('checkinList').innerHTML = '';
      $('quizListS').innerHTML = ''; $('certBox').innerHTML = '';
      return;
    }
    refreshMyStats();
    loadCheckin();
    loadQuizListS();
  }

  async function refreshMyStats() {
    const cfg = await getLmsConfig();
    const stats = await computeStudentStats(user.classId, user.uid);
    renderMyStats(stats);
    renderChecklist(stats);
    loadCert(cfg, stats);
  }

  function renderMyStats(stats) {
    $('myStats').innerHTML = `
      <div class="stat-card"><div class="stat-num">${stats.progressRate}%</div><div class="stat-label">진도율</div>
        <div class="bar"><i style="width:${stats.progressRate}%"></i></div>
        <div class="meta">자료 ${stats.viewedIds.length}/${stats.totalMats} · 과제 ${stats.submittedIds.length}/${stats.totalAssigns}</div></div>
      <div class="stat-card"><div class="stat-num">${stats.attendRate}%</div><div class="stat-label">출석률</div>
        <div class="bar"><i style="width:${stats.attendRate}%"></i></div>
        <div class="meta">출석 ${stats.present} · 지각 ${stats.late} · 결석 ${stats.absent} (회차 ${stats.totalSessions})</div></div>
      <div class="stat-card"><div class="stat-num">${stats.quizAvg === null ? '-' : stats.quizAvg + '%'}</div><div class="stat-label">퀴즈 평균</div>
        <div class="meta">${stats.quizTaken}/${stats.quizTotal} 응시</div></div>`;
  }

  function renderChecklist(stats) {
    const weeks = [...new Set(sMats.map((m) => m.week))].sort((a, b) => a - b);
    let html = '<h2 style="margin-top:20px">🗂️ 주차별 체크리스트</h2>';
    html += weeks.map((w) => `<div class="week-group"><div class="week-title">${w}주차</div>` +
      sMats.filter((m) => m.week === w).map((m) =>
        `<div class="mat-item"><span>${stats.viewedIds.includes(m.id) ? '✅' : '⬜'} 📄 ${esc(m.title)}</span></div>`).join('') + '</div>').join('')
      || '<p class="hint">등록된 자료가 없습니다</p>';
    html += '<h2 style="margin-top:20px">📝 과제 제출 현황</h2>' +
      (sAssigns.map((a) => {
        const done = stats.submittedIds.includes(a.id);
        return `<div class="mat-item"><span>${done ? '✅' : '⬜'} ${esc(a.title)}</span>${done ? '<span class="pill done">제출됨</span>' : `<span class="meta">마감: ${esc(a.due || '없음')}</span>`}</div>`;
      }).join('') || '<p class="hint">등록된 과제가 없습니다</p>');
    $('myChecklist').innerHTML = html;
  }

  async function getMyAttendance(classId) {
    if (DEMO) return demoDb().attendance.filter((a) => a.classId === classId && a.uid === user.uid);
    const s = await db.collection('classes').doc(classId).collection('attendance').where('uid', '==', user.uid).get();
    return s.docs.map((d) => d.data());
  }

  async function loadCheckin() {
    const classId = user.classId;
    const sessions = (await getSessions(classId)).filter((s) => s.date === todayStr());
    const mine = await getMyAttendance(classId);
    const map = {}; mine.forEach((a) => { map[a.sessionId] = a; });
    $('checkinList').innerHTML = sessions.map((ss) => {
      const rec = map[ss.id];
      const label = rec ? (rec.status === 'present' ? '출석' : rec.status === 'late' ? '지각' : '결석') : '';
      return `<div class="mat-item"><span>🗓️ ${esc(ss.title)} <span class="meta">${esc(ss.date)}</span></span>
        ${rec ? `<span class="pill done">${label} 완료</span>`
          : `<button class="btn small primary" data-checkin="${ss.id}">출석하기</button>`}</div>`;
    }).join('') || '<p class="hint">오늘 출석할 회차가 없습니다</p>';
    $('checkinList').querySelectorAll('[data-checkin]').forEach((b) => b.addEventListener('click', () => selfCheckin(classId, b.dataset.checkin)));
  }

  async function selfCheckin(classId, sessionId) {
    const mine = await getMyAttendance(classId);
    if (mine.some((a) => a.sessionId === sessionId)) { alert('이미 출석했습니다.'); loadCheckin(); return; }
    const doc = { classId, sessionId, uid: user.uid, name: user.name, status: 'present', by: 'self' };
    if (DEMO) {
      const d = demoDb();
      d.attendance.push({ id: sessionId + '_' + user.uid, ...doc, checkedAt: Date.now() });
      demoSave(d);
    } else {
      await db.collection('classes').doc(classId).collection('attendance').doc(sessionId + '_' + user.uid)
        .set({ ...doc, checkedAt: firebase.firestore.FieldValue.serverTimestamp() });
    }
    alert('출석 체크 완료!');
    loadCheckin();
  }

  /* ---------- 학생: 퀴즈 응시 ---------- */
  async function loadQuizListS() {
    const classId = user.classId;
    const [quizzes, results] = await Promise.all([getQuizzes(classId, false), getQuizResults(classId, user.uid)]);
    $('quizListS').innerHTML = quizzes.map((qz) => {
      const r = results.find((x) => x.quizId === qz.id);
      const closed = qz.dueDate && qz.dueDate < todayStr();
      return `<div class="assign-card"><h3>📝 ${esc(qz.title)}</h3>
        <div class="meta">문항 ${qz.questions.length}개 · 마감: ${esc(qz.dueDate || '없음')}</div>
        <div style="margin-top:8px">${r
          ? `<span class="pill done">응시 완료</span> <b>${r.score}/${r.total}점</b> (${Math.round((r.score / r.total) * 100)}점)`
          : closed ? '<span class="pill wait">마감됨</span>'
          : `<button class="btn small primary" data-takequiz="${qz.id}">응시하기</button>`}</div></div>`;
    }).join('') || '<p class="hint">공개된 퀴즈가 없습니다</p>';
    $('quizListS').querySelectorAll('[data-takequiz]').forEach((b) => b.addEventListener('click', () => {
      const qz = quizzes.find((x) => x.id === b.dataset.takequiz);
      if (qz) takeQuiz(qz);
    }));
  }

  function takeQuiz(qz) {
    $('quizTake').innerHTML = `<div class="assign-card"><h3>📝 ${esc(qz.title)} — 응시 중</h3>
      ${qz.questions.map((qq, i) => `<div class="quiz-q"><b>Q${i + 1}. ${esc(qq.q)}</b>
        ${qq.choices.map((c, j) => `<label class="choice-row"><input type="radio" name="tq${i}" value="${j}" /> <span>${esc(c)}</span></label>`).join('')}
      </div>`).join('')}
      <div class="row"><button id="quizSubmitBtn" class="btn primary">제출하기</button>
      <button id="quizCancelBtn" class="btn ghost">취소</button></div></div>`;
    $('quizTake').scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    $('quizCancelBtn').addEventListener('click', () => { $('quizTake').innerHTML = ''; });
    $('quizSubmitBtn').addEventListener('click', () => submitQuiz(qz));
  }

  async function submitQuiz(qz) {
    const answers = qz.questions.map((_, i) => {
      const sel = document.querySelector(`input[name="tq${i}"]:checked`);
      return sel ? +sel.value : -1;
    });
    if (answers.some((a) => a < 0) && !confirm('풀지 않은 문항이 있습니다. 그래도 제출할까요?')) return;
    let score = 0;
    qz.questions.forEach((qq, i) => { if (answers[i] === qq.answer) score++; });
    const doc = { classId: user.classId, quizId: qz.id, uid: user.uid, name: user.name, score, total: qz.questions.length, answers };
    try {
      if (DEMO) {
        const d = demoDb();
        if (d.quizResults.some((r) => r.quizId === qz.id && r.uid === user.uid)) { alert('이미 응시한 퀴즈입니다.'); return; }
        d.quizResults.push({ id: qz.id + '_' + user.uid, ...doc, submittedAt: Date.now() });
        demoSave(d);
      } else {
        // set()은 문서가 없으면 create, 있으면 update로 판정됨.
        // 보안 규칙이 학생에게는 create만 허용하므로 재응시 set()은 거부됨 (1회 응시 강제)
        await db.collection('classes').doc(user.classId).collection('quizResults').doc(qz.id + '_' + user.uid)
          .set({ ...doc, submittedAt: firebase.firestore.FieldValue.serverTimestamp() });
      }
    } catch (e) {
      alert(e && e.code === 'permission-denied' ? '이미 응시한 퀴즈입니다.' : '제출 실패: ' + e.message);
      return;
    }
    $('quizTake').innerHTML = `<div class="assign-card" style="text-align:center"><h3>🎉 채점 완료</h3>
      <p style="font-size:28px;font-weight:800;margin:8px 0">${score}/${qz.questions.length}점 (${Math.round((score / qz.questions.length) * 100)}점)</p></div>`;
    loadQuizListS();
    refreshMyStats();
  }

  /* ---------- 학생: 이수증 ---------- */
  async function loadCert(cfg, stats) {
    const okP = stats.progressRate >= cfg.progressThreshold;
    const okA = stats.attendRate >= cfg.attendThreshold;
    let existing = null;
    if (DEMO) existing = demoDb().certificates.find((c) => c.uid === user.uid && c.classId === user.classId) || null;
    else {
      try {
        const s = await db.collection('certificates').doc(user.uid + '_' + user.classId).get();
        if (s.exists) existing = s.data();
      } catch (e) { console.warn('cert load failed', e); }
    }
    const can = okP && okA;
    $('certBox').innerHTML = `
      <div class="assign-card">
        <div class="meta">발급 기준 — 진도율 ${cfg.progressThreshold}% 이상 ${okP ? '✅' : '⬜'} (내 진도율 ${stats.progressRate}%) ·
        출석률 ${cfg.attendThreshold}% 이상 ${okA ? '✅' : '⬜'} (내 출석률 ${stats.attendRate}%)</div>
        <div style="margin-top:12px">
          ${existing ? `<span class="pill done">발급 완료 (${esc(existing.issuedAtStr || '')})</span> ` : ''}
          <button id="certIssue" class="btn primary" ${can ? '' : 'disabled'}>🏅 이수증 ${existing ? '다시 받기' : '발급받기'}</button>
          ${can ? '' : '<p class="hint">기준을 모두 만족하면 발급 버튼이 활성화됩니다</p>'}
        </div>
      </div>`;
    loadCert._last = existing;
    if (can) $('certIssue').addEventListener('click', () => issueCert(cfg, stats));
  }

  function genCertNo(){
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return `HGS-${new Date().getFullYear()}-${s}`;
  }
  async function issueCert(cfg, stats) {
    const classes = await getClasses();
    const className = (classes.find((c) => c.id === user.classId) || {}).name || '메타송이 클래스';
    const prevNo = (loadCert._last && loadCert._last.certNo) || null;
    const rec = {
      uid: user.uid, name: user.name, classId: user.classId, className,
      progressRate: stats.progressRate, attendRate: stats.attendRate, issuedAtStr: todayStr(),
      certNo: prevNo || genCertNo(),
    };
    if (DEMO) {
      const d = demoDb();
      const i = d.certificates.findIndex((c) => c.uid === user.uid && c.classId === user.classId);
      const obj = { id: user.uid + '_' + user.classId, ...rec, issuedAt: Date.now() };
      if (i >= 0) d.certificates[i] = obj; else d.certificates.push(obj);
      demoSave(d);
    } else {
      await db.collection('certificates').doc(user.uid + '_' + user.classId)
        .set({ ...rec, issuedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }
    drawCert(rec);
    const a = document.createElement('a');
    a.href = $('certCanvas').toDataURL('image/png');
    a.download = `이수증_${user.name}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    alert('이수증을 발급했습니다! PNG 파일이 다운로드됩니다.');
    loadCert(cfg, stats);
  }

  function drawCert(rec) {
    const cv = $('certCanvas'), ctx = cv.getContext('2d');
    const W = 1200, H = 850;
    ctx.fillStyle = '#fdfbf3'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 10; ctx.strokeRect(30, 30, W - 60, H - 60);
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 3; ctx.strokeRect(55, 55, W - 110, H - 110);
    ctx.fillStyle = '#1a1a1a'; ctx.textAlign = 'center';
    const F = '"Noto Sans KR", "Apple SD Gothic Neo", sans-serif';
    // 브랜드
    ctx.font = `700 34px ${F}`; ctx.fillStyle = '#1a5fb4';
    ctx.fillText('효기샘', W / 2, 140);
    // 제목
    ctx.font = `700 92px ${F}`; ctx.fillStyle = '#1a1a1a';
    ctx.fillText('이 수 증', W / 2, 250);
    // 성명
    ctx.font = `400 40px ${F}`;
    ctx.fillText(`성명: ${rec.name}`, W / 2, 350);
    // 본문
    ctx.font = `400 32px ${F}`;
    ctx.fillText(`위 사람은 효기샘 ${rec.className} 과정을 성실히 이수하였기에`, W / 2, 440);
    ctx.fillText('이 증서를 수여합니다.', W / 2, 495);
    // 실적·발급번호·발급일
    ctx.font = `400 28px ${F}`; ctx.fillStyle = '#555';
    ctx.fillText(`진도율 ${rec.progressRate}% · 출석률 ${rec.attendRate}%`, W / 2, 570);
    ctx.fillText(`이수증 발급번호: ${rec.certNo || '-'}`, W / 2, 620);
    ctx.fillText(`발급일: ${rec.issuedAtStr}`, W / 2, 670);
    // 서명란 (우하단): 발급자명 + 직인
    ctx.textAlign = 'right';
    ctx.font = `400 34px ${F}`; ctx.fillStyle = '#1a1a1a';
    ctx.fillText('효기샘 대표 손효기', W - 220, 745);
    // 직인 (캔버스에 직접 그리기)
    const sx = W - 190, sy = 660, ss = 110;
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(sx, sy, ss, ss, 12); else ctx.rect(sx, sy, ss, ss);
    ctx.fill();
    ctx.fillStyle = '#fdfbf3'; ctx.textAlign = 'center';
    ctx.font = `700 34px ${F}`;
    ctx.fillText('효기', sx + ss / 2, sy + 42);
    ctx.fillText('샘印', sx + ss / 2, sy + 84);
    ctx.textAlign = 'center';
  }

  /* ================= AI (Gemini BYOK) ================= */
  const AI_KEY = 'msc_gemini_key';
  function aiKey() { return (localStorage.getItem(AI_KEY) || '').trim(); }
  function requireAiKey() {
    const k = aiKey();
    if (!k) { alert('Gemini API 키를 먼저 입력하세요.\nGoogle AI Studio(aistudio.google.com)에서 무료로 발급받을 수 있습니다.'); return null; }
    return k;
  }
  async function callGemini(apiKey, prompt, jsonMode) {
    const body = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7 } };
    if (jsonMode) body.generationConfig.responseMimeType = 'application/json';
    let res;
    try {
      res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + encodeURIComponent(apiKey), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
    } catch (e) { throw new Error('NETWORK:' + (e && e.message)); }
    if (!res.ok) {
      let msg = 'HTTP ' + res.status;
      try { const j = await res.json(); if (j.error && j.error.message) msg = j.error.message; } catch (e2) { /* 무시 */ }
      throw new Error(msg);
    }
    const data = await res.json();
    const text = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts || [])
      .map((p) => p.text || '').join('').trim();
    if (!text) throw new Error('EMPTY_RESPONSE');
    return text;
  }
  function geminiErrorKo(e) {
    const m = String((e && e.message) || e || '');
    if (/NETWORK/.test(m)) return '네트워크 오류입니다. 인터넷 연결을 확인하세요.';
    if (/API key not valid|API_KEY_INVALID/i.test(m)) return 'API 키가 유효하지 않습니다. 키를 다시 확인하세요.';
    if (/quota|429|RESOURCE_EXHAUSTED/i.test(m)) return 'API 할당량을 초과했습니다. 잠시 후 다시 시도하세요.';
    if (/EMPTY_RESPONSE/.test(m)) return 'AI가 빈 응답을 보냈습니다. 다시 시도해 주세요.';
    return 'AI 호출 실패: ' + m;
  }
  // AI 응답에서 JSON 배열 추출: 코드펜스 제거 → 직접 파싱 → 배열 패턴 추출 순으로 복구 시도
  function parseGeminiJson(text) {
    let t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    try { const v = JSON.parse(t); return v; } catch (e) { /* 다음 시도 */ }
    const m = t.match(/\[[\s\S]*\]/);
    if (m) { try { return JSON.parse(m[0]); } catch (e2) { /* 실패 */ } }
    return null;
  }
  function normalizeQuizQ(q) {
    if (!q || typeof q.q !== 'string' || !Array.isArray(q.choices)) return null;
    const qq = q.q.trim();
    if (!qq) return null;
    const choices = q.choices.map((c) => String(c ?? '').trim()).slice(0, 4);
    while (choices.length < 4) choices.push('');
    let answer = parseInt(q.answer, 10);
    if (isNaN(answer) || answer < 0 || answer > 3) answer = 0;
    return { q: qq, choices, answer };
  }

  /* ---------- 강사: API 키 + 수업 지식 ---------- */
  $('aiKeySaveT').addEventListener('click', () => {
    localStorage.setItem(AI_KEY, $('aiKeyT').value.trim());
    alert('API 키를 저장했습니다. (이 브라우저에만 저장됨)');
  });
  $('aiKeySaveS').addEventListener('click', () => {
    localStorage.setItem(AI_KEY, $('aiKeyS').value.trim());
    alert('API 키를 저장했습니다. (이 브라우저에만 저장됨)');
  });
  async function loadAiKnowledge() {
    let text = '';
    if (DEMO) text = demoDb().aiKnowledge || '';
    else {
      try {
        const s = await db.collection('config').doc('ai_knowledge').get();
        if (s.exists) text = s.data().text || '';
      } catch (e) { console.warn('ai knowledge load failed', e); }
    }
    if ($('aiKnowledge')) $('aiKnowledge').value = text;
  }
  $('aiKnowledgeSave').addEventListener('click', async () => {
    const text = $('aiKnowledge').value.trim();
    try {
      if (DEMO) { const d = demoDb(); d.aiKnowledge = text; demoSave(d); }
      else await db.collection('config').doc('ai_knowledge').set({ text, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      alert('수업 지식을 저장했습니다.');
    } catch (e) { alert('저장 실패: ' + e.message); }
  });
  async function getAiKnowledge() {
    if (DEMO) return demoDb().aiKnowledge || '';
    try {
      const s = await db.collection('config').doc('ai_knowledge').get();
      return s.exists ? (s.data().text || '') : '';
    } catch (e) { console.warn('ai knowledge read failed', e); return ''; }
  }

  /* ---------- 강사: AI 퀴즈 생성기 ---------- */
  $('aiQuizGen').addEventListener('click', async () => {
    const key = requireAiKey(); if (!key) return;
    const src = $('aiQuizSrc').value.trim();
    const n = Math.min(20, Math.max(1, parseInt($('aiQuizCount').value, 10) || 5));
    const level = $('aiQuizLevel').value;
    if (!src) { alert('주제나 수업 내용을 입력하세요.'); return; }
    const btn = $('aiQuizGen');
    btn.disabled = true; btn.textContent = '생성 중…';
    $('aiQuizPreview').innerHTML = '<p class="hint">AI가 문제를 만들고 있습니다…</p>';
    try {
      const prompt = '다음 수업 내용을 바탕으로 객관식 문제 ' + n + '개를 만들어줘. 난이도: ' + level + '.\n'
        + '반드시 아래 JSON 배열 형식으로만 답해. 다른 설명은 절대 쓰지 마.\n'
        + '[{"q":"질문","choices":["보기1","보기2","보기3","보기4"],"answer":0}]\n'
        + 'answer는 정답 보기의 인덱스(0~3).\n\n[수업 내용]\n' + src;
      const raw = await callGemini(key, prompt, true);
      const parsed = parseGeminiJson(raw);
      const norm = (Array.isArray(parsed) ? parsed : []).map(normalizeQuizQ).filter(Boolean);
      if (!norm.length) throw new Error('PARSE_FAILED');
      quizQuestions = norm;
      renderQuizQList();
      $('aiQuizPreview').innerHTML = '<p class="hint">✅ ' + norm.length + '개 문항을 생성했습니다. 위 문항 목록에서 수정·삭제 후 "📝 퀴즈 만들기"를 눌러 등록하세요.</p>';
    } catch (e) {
      const msg = String((e && e.message) || e) === 'PARSE_FAILED'
        ? 'AI 응답을 문제 형식으로 변환하지 못했습니다. 다시 시도해 주세요.'
        : geminiErrorKo(e);
      $('aiQuizPreview').innerHTML = '<p class="hint">❌ ' + esc(msg) + '</p>';
    } finally { btn.disabled = false; btn.textContent = '✨ 문제 생성'; }
  });

  /* ---------- 학생: AI 학습 도우미 ---------- */
  function addChatBubble(who, text) {
    const div = document.createElement('div');
    div.className = 'chat-bubble ' + who;
    div.textContent = text;
    $('aiChatLog').appendChild(div);
    $('aiChatLog').scrollTop = $('aiChatLog').scrollHeight;
    return div;
  }
  async function sendAiChat() {
    const key = requireAiKey(); if (!key) return;
    const q = $('aiChatInput').value.trim();
    if (!q) return;
    $('aiChatInput').value = '';
    addChatBubble('user', q);
    const loadingEl = addChatBubble('ai', '답변을 생각 중…');
    loadingEl.classList.add('loading');
    try {
      let knowledge = await getAiKnowledge();
      if (!knowledge) {
        const mt = (sMats || []).map((m) => '- 자료(' + m.week + '주차): ' + m.title).join('\n');
        const at = (sAssigns || []).map((a) => '- 과제: ' + a.title).join('\n');
        knowledge = '등록된 수업 자료/과제 목록:\n' + (mt + '\n' + at).trim() || '등록된 자료 없음';
      }
      const prompt = '너는 메타송이 클래스의 학습 도우미야. 아래 수업 내용을 기반으로 한국어로 친절하게 답변해. '
        + '수업 내용에 없는 질문이면 모른다고 솔직히 말해.\n\n[수업 내용]\n' + knowledge + '\n\n[학생 질문]\n' + q;
      const ans = await callGemini(key, prompt, false);
      loadingEl.textContent = ans;
    } catch (e) {
      loadingEl.textContent = '❌ ' + geminiErrorKo(e);
    } finally {
      loadingEl.classList.remove('loading');
      $('aiChatLog').scrollTop = $('aiChatLog').scrollHeight;
    }
  }
  $('aiChatSend').addEventListener('click', sendAiChat);
  $('aiChatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendAiChat(); });

  /* ---------- 강사: AI 과제 피드백 ---------- */
  let aiFbSubId = null, aiFbCtx = null;
  async function openAiFeedback(subId) {
    const key = requireAiKey(); if (!key) return;
    const sub = tSubsMap[subId];
    if (!sub) { alert('제출물을 찾을 수 없습니다.'); return; }
    const a = tAssignsMap[sub.assignmentId] || {};
    aiFbSubId = subId;
    aiFbCtx = { title: a.title || '', desc: a.desc || '', url: sub.url || '', name: sub.studentName || '' };
    $('aiFbMeta').textContent = (a.title || '과제') + ' · ' + (sub.studentName || '');
    $('aiFbText').value = sub.aiFeedback || '';
    $('aiFbModal').style.display = 'flex';
    if (!sub.aiFeedback) regenAiFeedback();
  }
  async function regenAiFeedback() {
    const key = requireAiKey(); if (!key) return;
    if (!aiFbCtx) return;
    const btn = $('aiFbRegen');
    btn.disabled = true; btn.textContent = '생성 중…';
    try {
      const prompt = '너는 온라인 강의의 조교야. 아래 과제 제출물에 대해 학생에게 전달할 피드백을 한국어로 3~5문장으로 작성해줘. '
        + '잘한 점 1가지와 개선할 점 1가지를 꼭 포함해. 피드백 본문만 출력해.\n\n'
        + '[과제 제목] ' + aiFbCtx.title + '\n[과제 설명] ' + aiFbCtx.desc + '\n'
        + '[제출자] ' + aiFbCtx.name + '\n[제출 링크] ' + aiFbCtx.url;
      const fb = await callGemini(key, prompt, false);
      $('aiFbText').value = fb.trim();
    } catch (e) { alert(geminiErrorKo(e)); }
    finally { btn.disabled = false; btn.textContent = '🔄 다시 생성'; }
  }
  $('aiFbRegen').addEventListener('click', regenAiFeedback);
  $('aiFbClose').addEventListener('click', () => { $('aiFbModal').style.display = 'none'; });
  $('aiFbSave').addEventListener('click', async () => {
    if (!aiFbSubId) return;
    const text = $('aiFbText').value.trim();
    try {
      if (DEMO) {
        const d = demoDb();
        const s = d.submissions.find((x) => x.id === aiFbSubId);
        if (s) s.aiFeedback = text;
        demoSave(d);
      } else {
        await db.collection('submissions').doc(aiFbSubId).update({ aiFeedback: text });
      }
      if (tSubsMap[aiFbSubId]) tSubsMap[aiFbSubId].aiFeedback = text;
      alert('AI 피드백을 저장했습니다.');
      $('aiFbModal').style.display = 'none';
      loadAssignments();
    } catch (e) { alert('저장 실패: ' + e.message); }
  });

})();
