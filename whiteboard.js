/* 히나 클래스 화이트보드 — tldraw + Firestore 스냅샷 실시간 공유 */
import { Tldraw } from 'https://esm.sh/@tldraw/tldraw@3.13.0?deps=react@18.3.1,react-dom@18.3.1';
import React from 'https://esm.sh/react@18.3.1';
import { createRoot } from 'https://esm.sh/react-dom@18.3.1/client?deps=react@18.3.1';

const qs = new URLSearchParams(location.search);
const room = qs.get('room') || 'demo';
const mode = qs.get('mode') || 'view'; // edit(강사) | view(학생)
const isDemo = qs.get('demo') === '1' || !window.HINA_CONFIG?.firebase;
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

function Board() {
  const onMount = (editor) => {
    if (mode === 'view') {
      editor.updateInstanceState({ isReadonly: true });
    }

    if (isDemo) {
      setStatus(mode === 'edit' ? '✏️ 편집 모드 (데모)' : '👀 보기 모드 (데모)', '#888');
      return;
    }

    const docRef = db.collection('boards').doc(room);

    // 기존 스냅샷 불러오기
    docRef.get().then((snap) => {
      if (snap.exists && snap.data().snapshot) {
        try {
          applyingRemote = true;
          editor.store.loadSnapshot(snap.data().snapshot);
        } catch (e) { console.warn('snapshot load failed', e); }
        applyingRemote = false;
      }
      setStatus(mode === 'edit' ? '● 실시간 공유 중 (강사)' : '● 실시간 보는 중 (학생)', '#3fb950');
    }).catch(() => setStatus('연결 실패 — 새로고침 해주세요', '#f85149'));

    if (mode === 'edit') {
      // 변경 시 스로틀 저장
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
      // 학생: 실시간 구독
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
