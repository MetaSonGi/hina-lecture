# 🎓 메타송이 클래스 | MetaSonGi Class

> 실시간 강의 플랫폼 — 화이트보드·과제·Google 로그인  
> Real-time lecture platform with whiteboard and assignments

[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen?style=flat-square)](https://metasongi.github.io/metasongi-class/) ![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square) ![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square) ![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=flat-square)

🌐 **Live:** https://metasongi.github.io/metasongi-class/

---

강사·학생 강의 플랫폼. 강사 승인제 반 관리, tldraw 실시간 화이트보드,
주차별 자료실(드라이브 링크), 링크 공유, 과제 제출(링크 or Git URL)까지.


## 기능

### 👩‍🏫 강사
- **승인 관리**: Google 로그인한 학생을 승인 → 반 배정, 반별 명단
- **주차별 자료**: 드라이브 공유 링크 등록 (학생은 보기 전용)
- **자료실 링크**: 유용한 링크 공유
- **과제**: 제목·설명·마감일·Git 허용 여부 설정 → **학생별 제출 현황** 확인
- **화이트보드**: tldraw 실시간 **동시 그리기**
  - 반별 보드 1개 — 강사·학생이 동시에 그릴 수 있음 (위크벤치 스타일)
  - 도형 단위 Firestore 동기화 (`boards/{반ID}/shapes/{도형ID}`): 각자 그린 도형이 따로 저장되어 덮어쓰지 않음
- **학습 관리(LMS)**: 📊 탭에서 한눈에 관리
  - ✅ **출석**: 수업 회차 생성(제목·날짜) → 반별 출석부에서 학생별 출석/지각/결석 체크
  - 📊 **반 학습 현황**: 학생별 진도율·출석률·퀴즈 평균·자료 열람/과제 제출 수 표
  - 📝 **퀴즈**: 객관식(보기 4개) 출제 → 응시 현황·평균 점수·학생별 점수 표, 공개/비공개 전환
  - ⚙️ **수료 기준**: 진도율·출석률 기준 % 설정 (`config/lms`에 저장)
  - 🤖 **AI 퀴즈 생성기**: 주제/수업 내용 붙여넣기 → Gemini가 객관식 문항 생성 → 검토·수정 후 퀴즈로 등록
  - 🤖 **AI 설정**: 수업 지식 텍스트 저장 (`config/ai_knowledge`) — AI 학습 도우미의 답변 근거
  - 🤖 **AI 과제 피드백**: 제출물마다 AI 피드백 초안 생성 → 강사 수정 후 저장 (학생 화면에 표시)

### 🧑‍🎓 학생
- 로그인 후 강사 승인 대기 → 반 입장
- 주차별 강의 자료 보기, 자료실 링크, 과제 제출(링크 or Git URL)
- 화이트보드 실시간 동시 그리기 참여
- **내 학습(LMS)**: 📊 탭에서 내 학습 현황 확인
  - 📊 **대시보드**: 내 진도율·출석률·퀴즈 평균, 주차별 체크리스트(자료 열람 ✅/⬜·과제 제출 현황)
  - ✅ **출석하기**: 당일 회차에 셀프 체크인 (중복 방지)
  - 📝 **퀴즈**: 공개된 퀴즈 응시 → 제출 즉시 자동 채점·점수 표시 (마감 전 1회만)
  - 🏅 **수료증**: 진도율·출석률 기준 달성 시 발급 버튼 활성화 → canvas 수료증 PNG 다운로드
  - 💬 **AI 학습 도우미**: 📊 탭에서 수업 내용 질문 → Gemini가 한국어로 답변 (수업 지식 기반)

## 🤖 AI LMS 기능 (Gemini BYOK)

서버 없이 동작하는 Bring-Your-Own-Key 방식입니다. 강사·학생 각자가 자신의 Gemini API 키를
브라우저에 입력하면 AI 기능을 쓸 수 있습니다.

### API 키 발급 (무료, 1분)

1. https://aistudio.google.com/apikey 접속 → Google 로그인
2. "Create API key" 클릭 → 키 복사
3. 사이트의 강사 "📊 학습 관리 → 🤖 AI 설정" 또는 학생 "📊 내 학습" 상단의 🔑 입력칸에 붙여넣기 → 저장

- 키는 `localStorage`에만 저장되고, 서버(Firestore)에는 절대 전송·저장되지 않습니다.
- 키가 유출된 것 같으면 AI Studio에서 키를 삭제하고 새로 발급받으세요.
- 무료 할당량을 초과하면 "할당량 초과" 안내가 표시됩니다.

### 기능 3종

1. **🤖 AI 퀴즈 생성기** (강사, 📊 학습 관리 → 🤖 AI 퀴즈 생성기)
   - 주제/수업 내용 텍스트 + 문항 수(1~20) + 난이도 선택 → "✨ 문제 생성"
   - 생성된 문항은 기존 문항 편집기에 그대로 들어가 수정·삭제 가능 → "📝 퀴즈 만들기"로 등록
   - AI 응답이 JSON이 아니면 코드펜스 제거·배열 추출 순으로 복구를 시도합니다.
2. **💬 AI 학습 도우미** (학생, 📊 내 학습 → 💬 AI 학습 도우미)
   - 강사가 "🤖 AI 설정"에 저장한 **수업 지식**(`config/ai_knowledge`)을 근거로 답변합니다.
   - 수업 지식이 비어 있으면 등록된 자료/과제 제목 목록을 자동으로 근거로 사용합니다.
   - 수업 내용에 없는 질문에는 모른다고 답하도록 프롬프트되어 있습니다.
3. **📝 AI 과제 피드백** (강사, 📝 과제 → 제출물별 "🤖 AI 피드백" 버튼)
   - 과제 제목·설명 + 제출 링크를 바탕으로 3~5문장 피드백 초안 생성 (잘한 점 + 개선점 포함)
   - 강사가 textarea에서 수정 후 "💾 저장" → `submissions` 문서의 `aiFeedback` 필드에 저장
   - 학생은 자신의 과제 제출 화면에서 AI 피드백을 확인할 수 있습니다.

### 제한 사항

- **PDF 직접 읽기 불가**: 자료가 드라이브 공유 링크(PDF)라 AI가 원문을 읽을 수 없습니다.
  강사가 "🤖 AI 설정 → 수업 지식"에 핵심 요약을 넣어주면 도우미 답변이 좋아집니다.
- 새 Firestore 컬렉션을 쓰지 않으므로 **보안 규칙 변경이 필요 없습니다**
  (`config/ai_knowledge`는 기존 `match /config/{docId}` 규칙, `aiFeedback`은 기존 `submissions` 규칙으로 커버).

### 📝 수업 지식 작성 가이드 (AI 학습 도우미용)

AI 학습 도우미는 강사가 저장한 **수업 지식** 텍스트를 근거로 학생 질문에 답합니다.
주차별로 핵심 개념·용어 정의·자주 묻는 질문을 bullet 형태로 넣어주세요.

**작성 예시:**
```
[1주차] 파이썬 기초
- 변수: 값을 담는 상자. 예) name = "메타송이"
- print(): 화면에 출력하는 함수
- 자주 묻는 질문: "변수 이름에 한글 써도 돼요?" → 네, 되지만 영문 권장

[2주차] 조건문
- if/elif/else 구조, 들여쓰기 4칸 필수
- 비교 연산자 ==, !=, >, < 차이
```

**팁:**
- PDF 전체를 복사하기보다 **핵심 요약 1~2페이지 분량**이 효과적입니다 (너무 길면 AI가 핵심을 놓칩니다)
- 용어 정의는 "용어: 설명" 형식으로 한 줄에 하나씩
- 학생들이 자주 묻는 질문과 모범 답안을 미리 넣어두면 도우미가 그대로 답해줍니다
- 비어 있으면 자료/과제 제목 목록만으로 답변하므로, 수업 지식 등록을 권장합니다

## LMS 진도율 계산식

- **진도율** = (열람한 자료 수 + 제출한 과제 수) / (전체 자료 수 + 전체 과제 수) × 100
  - 자료 열람: 학생이 자료 "보기" 버튼을 누르면 `progress/{uid}/views/{materialId}` 에 기록
- **출석률** = (출석 1 + 지각 0.5) / (지나간 회차 수) × 100
- **수료증**: 진도율·출석률이 기준(기본 80%, 강사가 조정 가능)을 모두 넘으면 발급

## 화이트보드 동시 그리기 방식

스냅샷 통째 저장(구 방식)은 여러 명이 동시에 그리면 마지막 저장자가 덮어써버린다.
그래서 도형 단위로 쪼개서 저장한다: `boards/{room}/shapes/{recordId}`.
tldraw의 `store.listen({scope:'document', source:'user'})`로 변경분을 감지해
추가/삭제는 즉시, 수정은 도형별 250ms 디바운스로 batch write.
원격 변경은 `onSnapshot` + `mergeRemoteChanges`로 적용해 에코를 방지한다.

## 파일은 왜 드라이브 링크인가요?

Firebase Storage는 신규 프로젝트에서 유료(Blaze) 요금제를 요구합니다.
무료로 운영하기 위해 파일 저장은 구글 드라이브를 사용합니다:

1. 강사가 드라이브에 `메타송이 클래스 강의자료` 폴더를 만들고 PDF를 올림
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

### LMS 추가 후 강사가 해야 할 일 (Firebase Console)

1. Firebase Console → Firestore Database → **규칙** 탭 열기
2. 기존 규칙 안에 위 `// ---- LMS ----` 블록(출석 회차·출석 기록·진도·퀴즈·퀴즈 결과·수료증)을 추가한 뒤 **게시**
   - `config/lms`(수료 기준)는 기존 `match /config/{docId}` 규칙이 그대로 커버하므로 추가 작업 없음
   - 수료 기준 % 값 자체는 사이트 내 강사 "📊 학습 관리 → ⚙️ 수료 기준"에서 변경 (Firestore에 자동 저장)
3. 규칙 게시 후 학생 화면에서 출석 체크인·퀴즈 응시가 되는지 1회 테스트

> 참고: 공개된 퀴즈 문서에는 정답이 함께 들어 있습니다. 로그인한 사용자가 개발자 도구로 보면
> 답을 알 수 있으므로, 엄격한 시험 용도라면 별도 채점 서버(Cloud Functions) 방식을 권장합니다.

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
    // ---- LMS ----
    // 출석 회차 — 읽기: 로그인 사용자, 쓰기: 강사
    match /classes/{classId}/sessions/{sessionId} {
      allow read: if signedIn();
      allow write: if isTeacher();
    }
    // 출석 기록 — 학생은 본인 것만 생성(셀프 체크인), 강사는 전체 관리
    match /classes/{classId}/attendance/{recordId} {
      allow read: if signedIn();
      allow create: if isTeacher()
        || (signedIn() && request.resource.data.uid == request.auth.uid);
      allow update: if isTeacher()
        || (signedIn() && resource.data.uid == request.auth.uid && resource.data.by == 'self');
      allow delete: if isTeacher();
    }
    // 학습 진도 (자료 열람 기록) — 본인 것만 쓰기, 강사는 전체 조회
    match /progress/{uid} {
      allow read: if (signedIn() && request.auth.uid == uid) || isTeacher();
      allow write: if (signedIn() && request.auth.uid == uid) || isTeacher();
    }
    match /progress/{uid}/views/{viewId} {
      allow read: if (signedIn() && request.auth.uid == uid) || isTeacher();
      allow write: if (signedIn() && request.auth.uid == uid) || isTeacher();
    }
    // 퀴즈 — 미공개는 강사만 읽기, 공개된 것은 로그인 사용자 읽기 / 쓰기: 강사
    match /classes/{classId}/quizzes/{quizId} {
      allow read: if isTeacher() || (signedIn() && resource.data.published == true);
      allow write: if isTeacher();
    }
    // 퀴즈 결과 — 학생은 본인 것만 생성/읽기, 강사는 전체
    match /classes/{classId}/quizResults/{resultId} {
      allow read: if isTeacher() || (signedIn() && resource.data.uid == request.auth.uid);
      allow create: if signedIn() && request.resource.data.uid == request.auth.uid;
      allow update, delete: if isTeacher();
    }
    // 수료증 발급 기록 — 학생은 본인 것만 생성/읽기, 강사는 전체
    match /certificates/{certId} {
      allow read: if isTeacher() || (signedIn() && resource.data.uid == request.auth.uid);
      allow create: if signedIn() && request.resource.data.uid == request.auth.uid;
      allow update, delete: if isTeacher();
    }
    // 수료 기준(config/lms)은 위 match /config/{docId} 규칙이 그대로 커버
    // (읽기: 로그인 사용자, 쓰기: 강사) — 별도 규칙 불필요
    // 화이트보드 — 반별 단일 보드, 도형 단위 실시간 동기화
    match /boards/{docId} {
      allow read: if signedIn();
      allow write: if isTeacher()
        || (signedIn() && docId.endsWith('__s_' + request.auth.uid));
    }
    match /boards/{room}/shapes/{shapeId} {
      allow read: if signedIn();
      allow write: if signedIn();
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

---

## English Summary

Real-time lecture platform with whiteboard and assignments.
