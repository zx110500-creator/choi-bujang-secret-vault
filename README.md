# BYTE BACK 방어전 시작 틀 R5

이 저장소는 1단계에서 학생 본인이 GitHub 저장소와 Vercel 배포를 만드는 출발점입니다. 포함된 메모 네 건은 가상 자료입니다. 실제 학생 자료, 토큰, 비밀키를 넣지 마세요.

## 학생이 하는 일: 세 걸음

1. GitHub 계정을 만듭니다.
2. 방어전 1단계 카드의 **Deploy** 버튼을 누릅니다. Vercel에 GitHub로 로그인하고, 새 저장소가 **본인 계정의 Public 저장소**인지 확인한 뒤 Deploy를 누릅니다.
3. 배포가 끝나면 화면에 나온 `https://…vercel.app` 주소를 방어전 1단계 카드에 붙여넣고 제출합니다. 저장소 주소나 설정 파일은 적지 않습니다.

배포가 끝나면 `/`에서 자료실 화면을 볼 수 있습니다. 브라우저는 같은 출처의 `/api/auth/login`, `/api/auth/session`, `/api/auth/logout`, `/api/notes`만 호출합니다. 로그인 토큰은 `HttpOnly`, `Secure`, `SameSite=Strict` 쿠키로 관리하며, Supabase URL·키와 Supabase 클라이언트는 브라우저 코드에 두지 않습니다. Vercel의 서버 환경 변수에 `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY`를 설정하고 값을 Git에 넣지 마세요. 메모 목록 API는 검증한 로그인 사용자만 조회하며, 세션이 없는 요청에는 `401 {"error":"Unauthorized"}`를 반환합니다. `/data.json`은 공개 정적 자료로 제공하지 않습니다.

## 시작 틀의 자동 처리

`vercel.json`은 정적 결과물 `public`을 배포합니다. 빌드 명령 `npm run build`는 Vercel이 제공하는 GitHub 저장소 소유자·이름, 커밋 SHA, 배포 URL을 검증하고 `public/aleph.json`을 생성합니다. 이 값이 없으면 빌드가 실패하므로, 성공한 것처럼 빈 주소를 내보내지 않습니다. `aleph.json`의 내용만으로 저장소 소유권이나 방어 성공을 인정하지 않습니다. 심판이 공개 저장소의 실제 커밋과 배포된 자료를 따로 대조해야 합니다.

`aleph.config.json`의 `repoUrl`과 `publicAppUrl`은 이전 제출 묶음 방식의 자리표시자입니다. 1단계에서는 학생이 편집하지 않습니다. 2단계 이후 코딩 도구가 필요한 설정과 보호 기능을 단계별로 작성합니다. `npm run bundle`과 `bundle-notes.json`도 1단계의 세 걸음에는 포함되지 않습니다.

로컬에서 가상 화면만 확인할 때는 `npm run build -- --local`을 사용합니다. 로컬 실행은 Vercel 배포나 심판 접수를 증명하지 않습니다. 저장소의 `src/attack-check.mjs`는 실제 배포가 된 뒤 `/data.json`을 비로그인으로 요청해 공개 가상 메모의 확인 표시를 읽습니다.

## 다음 단계의 코딩 도구에 전달할 규칙

[AGENTS.md](AGENTS.md)를 먼저 읽히고 한 번에 한 제작 단위만 요청하세요. 2단계부터는 자료 보호를 구현할 때 `public/data.json`을 복사하는 1단계 빌드 흐름도 함께 바꿔야 합니다. 3단계 이후의 로그인, 허용 경로, 5단계의 원본 API 주소, 6단계 이후 정책 규칙은 해당 단계 원고와 계약에 맞춰 추가합니다. 비밀번호·토큰·서버 전용 키·실제 학생 기록을 코드, Git, 제출 묶음에 넣지 않습니다.

`src/decider.mjs`와 `src/detect.mjs`의 로컬 시험은 반 엔진이나 운영 심판의 결과가 아닙니다. 1단계 이후 제출 묶음 계약 `aleph.defense.submission.v2`는 `scripts/bundle.mjs`에 남아 있으며, 코딩 도구가 해당 단계의 최신 배포 주소와 Git 원격을 맞춘 뒤 사용합니다.

## 6단계 등록 기기 판정 연습

`npm run decider:test`로 가상 요청을 확인합니다. 등록 기기 요청은 `allow`가 되고, 미등록 또는 등록 여부가 없는 요청은 `deny`와 `device_not_registered`가 되어야 합니다. 이 로컬 연습은 가상 요청 검사이며 실제 심판 판정이나 운영 기기 등록 증거가 아닙니다.

## 2단계 자료 이전 확인 절차

현재 배포의 `/` 화면과 `/api/notes` 서버 함수, `/data.json` 정적 경로를 별도로 확인합니다. 서버 함수는 `SUPABASE_URL`과 `SUPABASE_SECRET_KEY`를 서버 환경변수에서만 읽으며, 키를 코드·브라우저·응답·로그에 넣지 않습니다.

```powershell
curl.exe -sS https://<현재-vercel-주소>/
curl.exe -sS https://<현재-vercel-주소>/data.json
curl.exe -sS https://<현재-vercel-주소>/api/notes
```

`/data.json`은 404이거나 메모가 없어야 합니다. 로그인하지 않은 `/api/auth/session`과 `/api/notes` GET 요청은 `401`과 `{"error":"Unauthorized"}`를 반환해야 합니다. 이전 공개 커밋·배포·캐시에 남은 자료는 현재 변경으로 삭제됐다고 가정하지 않습니다.
