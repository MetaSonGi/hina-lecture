# 히나 클래스 🌸

강사·학생 강의 플랫폼. 강사 승인제 반 관리, tldraw 실시간 화이트보드,
주차별 자료실(드라이브 링크), 링크 공유, 과제 제출(링크 or Git URL)까지.

🌐 **바로 실행:** https://metasongi.github.io/hina-lecture/

## 기능

### 👩‍🏫 강사
- **승인 관리**: Google 로그인한 학생을 승인 → 반 배정, 반별 명단
- **주차별 자료**: 드라이브 공유 링크 등록 (학생은 보기 전용)
- **자료실 링크**: 유용한 링크 공유
- **과제**: 제목·설명·마감일·Git 허용 여부 설정 → **학생별 제출 현황** 확인
- **화이트보드**: tldraw 편집 → 학생 화면에 실시간 공유
  - 강사 공용 보드: 강사가 그리면 전원에게 실시간 공유 (학생은 보기 전용)
  - 학생 개인 보드: 학생이 직접 그리기 가능 → 강사가 학생별로 열어볼 수 있음

### 🧑‍🎓 학생
- 로그인 후 강사 승인 대기 → 반 입장
- 주차별 강의 자료 보기, 자료실 링크, 과제 제출(링크 or Git URL)
- 화이트보드 실시간 시청 + 내 보드 그리기

## 파일은 왜 드라이브 링크인가요?

Firebase Storage는 신규 프로젝트에서 유료(Blaze) 요금제를 요구합니다.
무료로 운영하기 위해 파일 저장은 구글 드라이브를 사용합니다:

1. 강사가 드라이브에 `히나 클래스 강의자료` 폴더를 만들고 PDF를 올림
2. 강의 사이트 → 주차별 자료 탭에서 폴더 공유 링크를 1회 등록
3. 자료 추가 시 PDF의 공유 링크를 붙여넣기
4. 학생 과제 제출도 파일 대신 드라이브/GitHub 링크로 제출

## Firebase 구성 (프로젝트: hina-class)

- **Authentication**: Google 로그인 사용
- **Firestore**: asia-northeast3 (Seoul), 프로덕션 모드
- **승인된 도메인**: `metasongi.github.io` 등록됨

### 강사 권한 부여 방법 (이메일은 저장소에 노출하지 않음)

강사 이메일 allowlist는 공개 저장소가 아닌 Firestore에만 보관합니다.

1. Firebase Console → Firestore → `config/admins` 문서 만들기
2. 내용: `{ "emails": ["강사Gmail주소"] }`
3. 해당 이메일로 사이트에 로그인하면 자동으로 `teachers/{uid}` 문서가 생성되고 강사 권한 획득

### Firestore 보안 규칙

Firebase Console → Firestore Database → 규칙 탭에 아래를 붙여넣고 게시:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() { return request.auth != null; }
    function isTeacher() {
      return signedIn()
        && exists(/databases/$(database)/documents/teachers/$(request.auth.uid));
    }
    function isAdminEmail() {
      return signedIn()
        && get(/databases/$(database)/documents/config/admins)
             .data.emails.hasAny([request.auth.token.email]);
    }

    // 설정 (admins: 강사 이메일 목록, drive: 드라이브 폴더 링크)
    match /config/{docId} {
      allow read: if signedIn();
      allow write: if isTeacher();
    }
    // 강사 명단 (최초 등록은 admins 이메일 대조)
    match /teachers/{uid} {
      allow read: if signedIn();
      allow create: if signedIn() && request.auth.uid == uid && isAdminEmail();
      allow update, delete: if isTeacher();
    }
    // 회원
    match /users/{uid} {
      allow read: if signedIn();
      allow create: if signedIn() && request.auth.uid == uid;
      allow update: if (signedIn() && request.auth.uid == uid) || isTeacher();
      allow delete: if isTeacher();
    }
    // 반 / 자료 / 링크 / 과제 — 읽기: 로그인 사용자, 쓰기: 강사
    match /classes/{docId} {
      allow read: if signedIn();
      allow write: if isTeacher();
    }
    match /materials/{docId} {
      allow read: if signedIn();
      allow write: if isTeacher();
    }
    match /links/{docId} {
      allow read: if signedIn();
      allow write: if isTeacher();
    }
    match /assignments/{docId} {
      allow read: if signedIn();
      allow write: if isTeacher();
    }
    // 제출물 — 학생은 자기 것만, 강사는 전체
    match /submissions/{docId} {
      allow read: if isTeacher()
        || (signedIn() && resource.data.studentId == request.auth.uid);
      allow create: if signedIn()
        && request.resource.data.studentId == request.auth.uid;
      allow update, delete: if isTeacher();
    }
    // 화이트보드 — 읽기: 로그인 사용자, 쓰기: 강사 + 본인 보드
    match /boards/{docId} {
      allow read: if signedIn();
      allow write: if isTeacher()
        || (signedIn() && docId.endsWith('__s_' + request.auth.uid));
    }
  }
}
```

### API 키 도용 방지 (권장)

`firebase-config.js`의 apiKey는 Firebase 웹 앱의 공개용 키입니다.
도용을 막으려면 Google Cloud Console → API 및 서비스 → 사용자 인증 정보 →
해당 API 키 → 애플리케이션 제한사항 → HTTP 리퍼러에
`https://metasongi.github.io/*` 를 등록하세요.

## Firebase 무료(Spark) 플랜으로 되나요?

네, 됩니다. 학원·강의 규모에서는 무료 할당량으로 충분합니다.
(Storage는 무료 플랜에서 시작할 수 없어 드라이브 링크 방식으로 대체)

| 항목 | 무료 할당량 | 이 앱 사용량 |
|---|---|---|
| Authentication | 월 5만 명 | 학생 수십~수백 명이면 충분 |
| Firestore 읽기 | 일 5만 건 | 보드 1개 구독 = 변경당 1건 |
| Firestore 쓰기 | 일 2만 건 | 그림 변경 시 2초 스로틀 저장 |

주의: 화이트보드를 하루 종일 켜두면 쓰기 할당량이 쌓이므로, 수업 시간 외에는 보드를 닫는 게 좋습니다. 한도를 넘으면 다음 날 자정에 리셋됩니다 (과금 없음).

## 기술

- Vanilla JS + Firebase (Auth/Firestore, compat CDN)
- tldraw 3.x (ESM) — 스냅샷을 Firestore에 저장해 실시간 공유
- 파일 저장: 구글 드라이브 공유 링크 (Storage 미사용)
- Firebase 미연결 시 localStorage 데모 모드
