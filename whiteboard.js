/* 히나 클래스 화이트보드 — tldraw + Firestore 스냅샷 실시간 공유
 * board=main        → 강사 공용 보드 (강사 편집 → 전원에게 공유)
 * board=s_<uid>     → 학생 개인 보드 (학생이 그림, 강사가 볼 수 있음)
 */
import { Tldraw } from 'https://esm.sh/@tldraw/tldraw@3.13.0?deps=react@18.3.1,react-dom@18.3.1';
import React from 'https://esm.sh/react@18.3.1';
import { createRoot } from 'https://esm.sh/react-dom@18.3.1/client?deps=react@18.3.1';

const qs = new URLSearchParams(location.search);
const room = qs.get('room') || 'demo';
const board = qs.get('board') || 'main';
const mode = qs.get('mode') || 'view'; // edit | view
const isDemo = qs.get('demo') === '1' || !window.HINA_CONFIG?.firebase;
const docId = board === 'main' ? room : `${room}__${board}`;

const statusEl = document.getElementById('status');
const setStatus = (t, color) => {
  statusEl.textContent = t;
  statusEl.style.border = color ? `2px solid ${color}` : 'none';
};

let db = null;
if (!isDemo) {
  firebase.initializeApp(window.HINA_CONFIG.firebase);
  db = firebase.firestore();
}
setStatus(isDemo ? '데모 모드 (동기화 없음)' : '연결 중…');

document.getElementById('back').addEventListener('click', () => { location.href = 'index.html'; });

let saveTimer = null;
let applyingRemote = false;

function statusFor() {
  if (isDemo) return mode === 'edit' ? '✏️ 그리기 모드 (데모)' : '👀 보기 모드 (데모)';
  if (board === 'main') return mode === 'edit' ? '● 강사 보드 공유 중' : '● 강사 보드 보는 중';
  return mode === 'edit' ? '✏️ 내 보드 (자동 저장됨)' : '👀 학생 보드 보는 중';
}

function Board() {
  const onMount = (editor) => {
    if (mode === 'view') {
      editor.updateInstanceState({ isReadonly: true });
    }

    if (isDemo) {
      setStatus(statusFor(), '#888');
      return;
    }

    const docRef = db.collection('boards').doc(docId);

    docRef.get().then((snap) => {
      if (snap.exists && snap.data().snapshot) {
        try {
          applyingRemote = true;
          editor.store.loadSnapshot(snap.data().snapshot);
        } catch (e) { console.warn('snapshot load failed', e); }
        applyingRemote = false;
      }
      setStatus(statusFor(), '#3fb950');
    }).catch(() => setStatus('연결 실패 — 새로고침 해주세요', '#f85149'));

    if (mode === 'edit') {
      editor.store.listen(() => {
        if (applyingRemote) return;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          try {
            docRef.set({ snapshot: editor.store.getSnapshot(), updatedAt: Date.now() }, { merge: true });
          } catch (e) { console.warn('snapshot save failed', e); }
        }, 2000);
      });
    } else {
      docRef.onSnapshot((snap) => {
        if (!snap.exists || !snap.data().snapshot) return;
        try {
          applyingRemote = true;
          editor.store.loadSnapshot(snap.data().snapshot);
        } catch (e) { console.warn('snapshot apply failed', e); }
        applyingRemote = false;
      });
    }
  };

  return React.createElement(Tldraw, { onMount, autoFocus: mode === 'edit' });
}

createRoot(document.getElementById('root')).render(React.createElement(Board));
