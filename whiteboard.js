/* 와글보드 화이트보드 — tldraw + Firestore 도형 단위 실시간 동기화
 *
 * 반별 보드 1개, 강사·학생 동시 그리기 지원 (위크벤치 스타일).
 * 구조: boards/{room}/shapes/{recordId} — 도형 1개 = 문서 1개.
 * 각자 그린 도형이 따로 저장되므로 동시에 그려도 덮어쓰지 않는다.
 */
import { Tldraw } from 'https://esm.sh/@tldraw/tldraw@3.13.0?deps=react@18.3.1,react-dom@18.3.1';
import React from 'https://esm.sh/react@18.3.1';
import { createRoot } from 'https://esm.sh/react-dom@18.3.1/client?deps=react@18.3.1';

const qs = new URLSearchParams(location.search);
const room = qs.get('room') || 'demo';
const mode = qs.get('mode') || 'edit'; // edit | view
const isDemo = qs.get('demo') === '1' || !window.HINA_CONFIG?.firebase;

const statusEl = document.getElementById('status');
const setStatus = (t, color) => {
  statusEl.textContent = t;
  statusEl.style.border = color ? `2px solid ${color}` : 'none';
};

let db = null, auth = null;
if (!isDemo) {
  firebase.initializeApp(window.HINA_CONFIG.firebase);
  auth = firebase.auth();
  db = firebase.firestore();
}
setStatus(isDemo ? '데모 모드 (동기화 없음)' : '연결 중…');

document.getElementById('back').addEventListener('click', () => { location.href = 'index.html'; });

// Firestore는 undefined 값을 못 넣으므로 제거
const clean = (rec) => JSON.parse(JSON.stringify(rec));

// 같은 origin(index.html)에서 로그인한 세션이 복원될 때까지 대기
function waitForAuth() {
  return new Promise((resolve) => {
    const unsub = auth.onAuthStateChanged((u) => { unsub(); resolve(u); });
  });
}

function startSync(editor) {
  const shapesRef = db.collection('boards').doc(room).collection('shapes');

  // 원격 변경 구독 (첫 스냅샷 = 초기 로드)
  let firstSnap = true;
  shapesRef.onSnapshot((snap) => {
    const puts = [], removes = [];
    snap.docChanges().forEach((ch) => {
      if (ch.type === 'removed') removes.push(ch.doc.id);
      else puts.push(ch.doc.data());
    });
    if (puts.length || removes.length) {
      editor.store.mergeRemoteChanges(() => {
        if (puts.length) editor.store.put(puts);
        if (removes.length) editor.store.remove(removes);
      });
    }
    if (firstSnap) {
      firstSnap = false;
      setStatus(mode === 'edit' ? '● 실시간 동시 그리기 연결됨' : '● 실시간 보는 중', '#3fb950');
    }
  }, () => setStatus('연결 실패 — 새로고침 해주세요', '#f85149'));

  // 로컬 변경 → Firestore (추가/삭제 즉시, 수정은 250ms 디바운스 batch)
  if (mode === 'edit') {
    const pending = new Map(); // recordId -> record
    let timer = null;
    const flush = () => {
      timer = null;
      if (!pending.size) return;
      const batch = db.batch();
      pending.forEach((rec, id) => batch.set(shapesRef.doc(id), clean(rec), { merge: true }));
      pending.clear();
      batch.commit().catch((e) => console.warn('shape save failed', e));
    };
    editor.store.listen(({ changes }) => {
      const removedIds = Object.keys(changes.removed);
      if (removedIds.length) {
        const batch = db.batch();
        removedIds.forEach((id) => batch.delete(shapesRef.doc(id)));
        batch.commit().catch((e) => console.warn('shape delete failed', e));
      }
      Object.values(changes.added).forEach((rec) => pending.set(rec.id, rec));
      Object.values(changes.updated).forEach(([, to]) => pending.set(to.id, to));
      if (pending.size && !timer) timer = setTimeout(flush, 250);
    }, { scope: 'document', source: 'user' });
    window.addEventListener('beforeunload', () => { if (timer) { clearTimeout(timer); flush(); } });
  }
}

function Board() {
  const onMount = (editor) => {
    if (mode === 'view') {
      editor.updateInstanceState({ isReadonly: true });
    }

    if (isDemo) {
      setStatus(mode === 'edit' ? '✏️ 그리기 모드 (데모)' : '👀 보기 모드 (데모)', '#888');
      return;
    }

    setStatus('로그인 확인 중…');
    waitForAuth().then((user) => {
      if (!user) {
        setStatus('로그인이 필요합니다 — 메인 페이지에서 먼저 로그인하세요', '#f85149');
        return;
      }
      startSync(editor);
    });
  };

  return React.createElement(Tldraw, { onMount, autoFocus: mode === 'edit' });
}

createRoot(document.getElementById('root')).render(React.createElement(Board));
