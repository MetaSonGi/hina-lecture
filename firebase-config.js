/* 히나 클래스 — Firebase 설정
 *
 * 실제 서비스로 쓰려면 아래 순서대로 Firebase 프로젝트를 만들고
 * firebaseConfig에 값을 채우세요. 비워두면 데모 모드로 동작합니다.
 *
 * 1. https://console.firebase.google.com → 프로젝트 만들기
 * 2. Authentication → 로그인 방법 → Google 사용 설정
 * 3. Firestore Database → 만들기 (프로덕션 모드)
 * 4. Storage → 시작하기
 * 5. 프로젝트 설정 → 내 앱 → 웹 앱 등록 → firebaseConfig 복사
 * 6. teacherEmails에 강사 Gmail을 넣으세요 (이 이메일만 강사 권한)
 */
window.HINA_CONFIG = {
  firebase: {
    apiKey: "AIzaSyDPi4lLYi9nJGUyElJmA6bFMl-vWsdCT8E",
    authDomain: "hina-class.firebaseapp.com",
    projectId: "hina-class",
    storageBucket: "hina-class.firebasestorage.app",
    messagingSenderId: "210145740964",
    appId: "1:210145740964:web:4711ecb47b77a73317be31"
  },
  teacherEmails: ["sonhyogi0078@gmail.com"],
};
