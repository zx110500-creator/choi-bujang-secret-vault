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

## 7단계 이상 접속 추가 확인

`npm run decider:test`와 `npm run fixture:7`을 실행합니다. 등록 기기의 정상 가상 요청은 `allow`, 미등록 기기는 `deny`, 복합 이상 접속·지역 신호 단독·출처 불명 또는 누락 신호는 `step_up`과 `step_up_required`가 되어야 합니다. 계약의 `stepUp`이 15분 이내에 확인된 이상 접속은 `allow`가 됩니다. 이들은 가상 연습이며 실제 심판 판정이나 운영 접속 기록이 아닙니다.

## 8단계 자료 구역과 메모 소유권

메모는 `GET /api/notes/:id`, `PATCH /api/notes/:id`, `DELETE /api/notes/:id` 단건 경로만 판정기가 허용합니다. 메모 목록·`export`·쿼리 선택은 거부합니다. `/api/notes/:id` 서버 함수는 검증한 로그인 사용자 ID와 DB의 `owner_id`를 대조합니다. 현재 저장소에는 공지·강사 자료 API나 권한 스키마가 없어 해당 구역은 정의되기 전까지 거부되며, 요청 본문·헤더의 역할값은 권한 판정에 쓰지 않습니다.

`npm run decider:test`로 정상 단건 메모, 거부 경로와 소유자 권한 사례를 확인하고 `npm run bundle`로 실제 비로그인 API 응답을 기록합니다. 로컬 판정 시험과 번들은 심판 결과가 아닙니다.

## 9단계 폭주 조회 탐지 연습

`npm run detect:test`는 사건의 `at`, `method`, `identity.sub`만 사용해 같은 사용자의 GET을 10분 창으로 셉니다. 120건까지는 `observe`, 121건부터는 정확히 `{ action: 'propose_revocation', reasonCode: 'burst_read', subject }`를 반환합니다. 비정렬 입력은 사용자별 시각순으로 정렬해 검사합니다. `npm run decider:test`와 `npm run bundle`도 실행해 기존 경로 판정과 제출 묶음을 확인합니다. 이 가상 사건 연습은 운영 사건 전달·회수 집행이나 심판 판정의 증거가 아닙니다.

## 10단계 검증된 백업과 단일 메모 복원

### 단일 메모 복원 절차

`POST /api/admin/restore-note`는 `notes` 서비스의 지정된 시험 계정 B 메모 한 건만 대상으로 합니다. 로컬 가상 시험 ID는 `note-restore-b`이며, 서버에서 검증된 Supabase 로그인 사용자 ID가 Vercel의 `RESTORE_ADMIN_USER_ID`와 일치해야 합니다. 실제 배포 사본은 `RESTORE_NOTE_BACKUP_JSON` 서버 환경변수에서, 없으면 로컬 전용 `backups/private/restore-note-b.json` 파일에서 읽습니다. 복원 요청 직전에 사본을 다시 읽어 ID·소유자·본문 SHA-256을 확인하며, 사본이 없거나 해시가 맞지 않으면 DB를 읽거나 쓰지 않고 중단합니다. `RESTORE_NOTE_ID`와 `RESTORE_NOTE_OWNER_ID`는 사본의 ID·소유자와 일치해야 합니다.

POST를 보내기 전에 운영자는 사본 SHA-256을 해당 사본 버전의 식별값으로 확인하고, 대상 ID·소유자와 변경 범위(제목·본문)를 검토해야 합니다. 이 검토가 끝나기 전에는 요청을 실행하지 않습니다. 복원은 지정된 한 메모만 사본 상태로 삽입하거나 갱신하고, 직후 DB에서 다시 조회해 ID·소유자·제목·내용 SHA-256을 대조합니다. 값이 하나라도 다르면 성공 응답을 주지 않습니다. 이 절차는 다른 메모, 감사 기록(로그), 다른 서비스 규칙을 변경하거나 삭제하지 않습니다. 로컬 가상 사본은 실제 계정 B의 자료가 아니며 Git에서 제외됩니다. 실제 계정 ID·본문·환경변수 값은 코드·Git·채팅에 넣지 마세요.

#### 복원 뒤 정상·금지 요청 재시험 순서

실제 메모 복원과 복원 후 배포·브라우저 재시험은 미실행입니다. 아래 순서대로 별도 확인합니다. 과거 `npm run bundle`에서 비로그인 복구 POST가 HTTP 401을 반환한 기록은 있으나, 이는 실제 복원 뒤 검증이나 현재 배포의 복원 성공 검증이 아닙니다.

1. **정상 요청:** 복원 적용 후 등록 기기의 계정 A로 본인 메모 `GET`과 `PATCH`를 호출해 허용되는지 확인합니다. 반 공지 API는 저장소에 없어 공지 `GET` 허용 재시험은 미실행이며, 경로를 임의로 만들지 않습니다.
2. **로그인·소유권 거부:** 로그아웃 상태의 메모 조회와 계정 A의 타인 메모 `GET`·`PATCH`를 호출해 `401` 또는 `403`인지 확인합니다. 배포 API 직접 호출은 미실행입니다.
3. **원본 DB 직접 접근 거부:** 익명 키로 메모 테이블을 직접 조회해 자료가 반환되지 않는지 확인합니다. DB 권한 SQL 적용과 직접 조회는 미실행입니다.
4. **기기·이상 접속:** 미등록 기기가 `deny`, 지역 급변·이상 시각·낯선 네트워크 등 가상 이상 신호가 `step_up`인지 확인합니다. `npm run decider:test`는 로컬 가상 요청 18개 통과로 실행 확인됐으며, 배포 엔진 재시험은 미실행입니다.
5. **다른 구역·쓰기 차단:** 공지 쓰기와 강사 자료 쓰기 거부는 해당 API가 저장소에 없어 배포 요청 미실행입니다.
6. **폭주 조회:** 같은 주체의 10분 창에서 120건은 관찰, 121건부터 `burst_read` 회수 제안인지 확인합니다. `npm run detect:test`는 로컬 가상 사건 10개 통과로 실행 확인됐으나, 운영 사건 전달·회수 집행은 미실행입니다.
7. **복원 후 대조:** 실제 복원 메모를 다시 조회해 ID·소유자·내용 SHA-256을 사본과 비교합니다. `npm run test:restore`는 DB 모의 응답 6개 통과로 실행 확인됐으며, 실제 DB 복원과 재조회 대조는 미실행입니다.

### 안전 정책 복원 절차 (시험 사본 전용)

안전 정책 사본은 푸시된 9단계 커밋 `068d193d049ee6c1b299d98c75d2513fe5982f96`의 `src/decider.mjs`와 `aleph.config.json`입니다. `npm run policy:verify`와 복원 직전에 매니페스트 및 사본 파일을 다시 읽어 SHA-256을 검증합니다. 사본이나 매니페스트가 없거나 해시가 맞지 않으면 기준본과의 diff를 보여 주고 즉시 중단하며, 기준본으로 덮어쓰거나 자동 재생성하지 않습니다.

`npm run policy:restore`는 복원할 기준 커밋과 두 정책 파일의 변경 diff를 먼저 보여 주는 계획 출력이며, 실제 파일을 바꾸지 않습니다. 검토 뒤 `npm run policy:restore -- --apply`를 실행하면 검증된 사본을 **로컬 시험 작업 사본에만** 적용합니다. 이 명령은 배포된 운영 정책이나 DB를 바꾸지 않습니다. 복원 범위 밖의 다른 서비스 규칙과 감사 이력도 보존합니다. 저장소에 DB 권한 SQL·마이그레이션이 없어 DB 정책은 백업 대상에 포함되지 않습니다. `npm run policy:verify`는 실행되어 통과했고, `--apply`는 미실행입니다.

## 2단계 자료 이전 확인 절차

현재 배포의 `/` 화면과 `/api/notes` 서버 함수, `/data.json` 정적 경로를 별도로 확인합니다. 서버 함수는 `SUPABASE_URL`과 `SUPABASE_SECRET_KEY`를 서버 환경변수에서만 읽으며, 키를 코드·브라우저·응답·로그에 넣지 않습니다.

```powershell
curl.exe -sS https://<현재-vercel-주소>/
curl.exe -sS https://<현재-vercel-주소>/data.json
curl.exe -sS https://<현재-vercel-주소>/api/notes
```

`/data.json`은 404이거나 메모가 없어야 합니다. 로그인하지 않은 `/api/auth/session`과 `/api/notes` GET 요청은 `401`과 `{"error":"Unauthorized"}`를 반환해야 합니다. 이전 공개 커밋·배포·캐시에 남은 자료는 현재 변경으로 삭제됐다고 가정하지 않습니다.
