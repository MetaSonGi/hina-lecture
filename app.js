/* 와글보드 — 강사/학생 실시간 강의 플랫폼 (Firebase + 데모 모드) */
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
      };
      localStorage.setItem(DKEY, JSON.stringify(d));
    }
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
  async function initTeacher() {
    tClasses = await getClasses();
    ['classSelect', 'matClass', 'linkClass', 'asClass', 'boardClass'].forEach((id) => classOptions($(id), tClasses, tClasses[0]?.id));
    loadPending(); loadRoster(); loadMaterials(); loadLinks(); loadAssignments(); loadDriveFolder();
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
        <button class="btn small ghost" data-delclass="${c.id}" data-name="${esc(c.name)}" style="margin-left:8px">삭제</button></div>
        ${members.map((m) => `<div class="mat-item"><span>${esc(m.name)} <span class="meta">${esc(m.email)}</span></span></div>`).join('') || '<p class="hint">학생 없음</p>'}</div>`;
    }).join('') + (unassigned.length ? `<div class="week-group"><div class="week-title">미배정 (${unassigned.length}명)</div>
      ${unassigned.map((m) => `<div class="mat-item"><span>${esc(m.name)} <span class="meta">${esc(m.email)}</span></span></div>`).join('')}</div>` : '');
    $('classRoster').querySelectorAll('[data-delclass]').forEach((b) =>
      b.addEventListener('click', () => delClass(b.dataset.delclass, b.dataset.name)));
  }

  // 반 삭제: 관련 자료·링크·과제·제출·보드 도형까지 함께 삭제, 소속 학생은 미배정
  async function delClass(id, name) {
    const members = tStudents.filter((s) => s.classId === id);
    if (!confirm(`'${name}' 반을 삭제할까요?\n자료·과제·화이트보드도 함께 지워집니다.${members.length ? `\n학생 ${members.length}명은 미배정 상태가 됩니다.` : ''}`)) return;
    if (DEMO) {
      const d = demoDb();
      d.classes = d.classes.filter((c) => c.id !== id);
      d.materials = d.materials.filter((m) => m.classId !== id);
      d.links = d.links.filter((l) => l.classId !== id);
      const aids = d.assignments.filter((a) => a.classId === id).map((a) => a.id);
      d.assignments = d.assignments.filter((a) => a.classId !== id);
      d.submissions = d.submissions.filter((s) => !aids.includes(s.assignmentId));
      d.users.forEach((u) => { if (u.classId === id) u.classId = null; });
      demoSave(d);
    } else {
      const [mats, links, assigns, shapes] = await Promise.all([
        db.collection('materials').where('classId', '==', id).get(),
        db.collection('links').where('classId', '==', id).get(),
        db.collection('assignments').where('classId', '==', id).get(),
        db.collection('boards').doc(id).collection('shapes').get(),
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
    $('assignList').innerHTML = assigns.filter((a) => a.classId === cls).map((a) => {
      const aSubs = subs.filter((x) => x.assignmentId === a.id);
      return `<div class="assign-card"><h3>📝 ${esc(a.title)}</h3>
        <div class="meta">${esc(a.desc || '')} · 마감: ${esc(a.due || '없음')} · Git 제출 ${a.allowGit ? '허용' : '불가'}</div>
        ${clsStudents.map((st) => {
          const sub = aSubs.find((x) => x.studentId === st.uid);
          return `<div class="sub-row"><span>${esc(st.name)}</span>
            ${sub ? `<span>${sub.type === 'git' ? `🔗 <a href="${esc(sub.url)}" target="_blank" rel="noopener">${esc(sub.url)}</a>` : `📎 <a href="${esc(sub.url)}" target="_blank" rel="noopener">${esc(sub.name || sub.url)}</a>`}
            <span class="pill done">제출됨</span></span>`
            : `<span class="no">미제출 <span class="pill wait">대기</span></span>`}</div>`;
        }).join('') || '<p class="hint">이 반에 학생이 없습니다</p>'}</div>`;
    }).join('') || '<p class="hint">만든 과제가 없습니다</p>';
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
    $('sMatList').innerHTML = weeks.map((w) => `
      <div class="week-group"><div class="week-title">${w}주차</div>
      ${mats.filter((m) => m.week === w).map((m) => `
        <div class="mat-item"><span>📄 ${esc(m.title)}</span>
        <button class="btn small" data-openlink="${esc(m.url)}">보기</button></div>`).join('')}</div>`).join('')
      || '<p class="hint">아직 올라온 자료가 없습니다</p>';
    bindOpenLink($('sMatList'));

    $('sLinkList').innerHTML = links.map((l) => `
      <li><span>🔗 <a href="${esc(l.url)}" target="_blank" rel="noopener" style="color:#58a6ff">${esc(l.title)}</a></span></li>`).join('')
      || '<li><span class="meta">등록된 링크가 없습니다</span></li>';

    $('sAssignList').innerHTML = assigns.map((a) => {
      const sub = subs.find((x) => x.assignmentId === a.id);
      return `<div class="assign-card"><h3>📝 ${esc(a.title)}</h3>
        <div class="meta">${esc(a.desc || '')} · 마감: ${esc(a.due || '없음')}</div>
        ${sub ? `<div><span class="pill done">제출 완료</span>
          ${sub.type === 'git' ? ` <a href="${esc(sub.url)}" target="_blank" rel="noopener" style="color:#58a6ff">${esc(sub.url)}</a>` : ` <a href="${esc(sub.url)}" target="_blank" rel="noopener" style="color:#58a6ff">${esc(sub.name || sub.url)}</a>`}</div>`
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
})();
