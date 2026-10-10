# 히나 클래스 🌸

강사·학생 강의 플랫폼. 강사 승인제 반 관리, tldraw 실시간 화이트보드,
주차별 PDF 자료실, 링크 공유, Git/파일 과제 제출까지.

🌐 **바로 실행:** https://metasongi.github.io/hina-lecture/

## 기능

### 👩‍🏫 강사
- **승인 관리**: Google 로그인한 학생을 승인 → 반 배정, 반별 명단
- **주차별 자료**: PDF 업로드 (학생은 보기 전용)
- **자료실 링크**: 유용한 링크 공유
- **과제**: 제목·설명·마감일·Git 허용 여부 설정 → **학생별 제출 현황** 확인
- **화이트보드**: tldraw 편집 → 학생 화면에 실시간 공유
  - 강사 공용 보드: 강사가 그리면 전원에게 실시간 공유 (학생은 보기 전용)
  - 학생 개인 보드: 학생이 직접 그리기 가능 → 강사가 학생별로 열어볼 수 있음

### 🧑‍🎓 학생
- 로그인 후 강사 승인 대기 → 반 입장
- 주차별 강의 자료 보기, 자료실 링크, 과제 제출(파일 or Git URL)
- 화이트보드 보기 전용 실시간 시청

## Firebase 연결 (실서비스용)

지금은 **데모 모드**로 동작합니다. 실제로 쓰려면:

1. [Firebase Console](https://console.firebase.google.com) → 프로젝트 만들기
2. **Authentication** → 로그인 방법 → **Google** 사용 설정
3. **Firestore Database** → 만들기 (프로덕션 모드)
4. **Storage** → 시작하기
5. 프로젝트 설정 → 웹 앱 등록 → `firebaseConfig` 복사
6. `firebase-config.js`의 `firebase:` 주석을 풀고 값 채우기
7. `teacherEmails`에 강사 Gmail 입력 (이 이메일만 강사 권한)

### Firestore 보안 규칙 (권장)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    match /{doc=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
  }
}
```

### Storage 보안 규칙 (권장)

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
  }
}
```

## Firebase 무료(Spark) 플랜으로 되나요?

네, 됩니다. 학원·강의 규모에서는 무료 할당량으로 충분합니다.

| 항목 | 무료 할당량 | 이 앱 사용량 |
|---|---|---|
| Authentication | 월 5만 명 | 학생 수십~수백 명이면 충분 |
| Firestore 읽기 | 일 5만 건 | 보드 1개 구독 = 변경당 1건 |
| Firestore 쓰기 | 일 2만 건 | 그림 변경 시 2초 스로틀 저장 |
| Storage | 5GB 저장·일 1GB 다운로드 | PDF·과제 파일용으로 충분 |

주의: 화이트보드를 하루 종일 켜두면 쓰기 할당량이 쌓이므로, 수업 시간 외에는 보드를 닫는 게 좋습니다. 한도를 넘으면 다음 날 자정에 리셋됩니다 (과금 없음).

## 기술

- Vanilla JS + Firebase (Auth/Firestore/Storage, compat CDN)
- tldraw 3.x (ESM) — 스냅샷을 Firestore에 저장해 실시간 공유
- Firebase 미연결 시 localStorage 데모 모드
