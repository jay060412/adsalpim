# 광고살핌 Node.js 21 배포 안내

이 ZIP에는 화면과 AI 분석 API를 함께 실행하는 Next.js 소스가 들어 있습니다. Windows 또는 Linux의 Node.js 서버에서 설치·빌드한 뒤 실행합니다. 별도 데이터베이스나 Python 서버는 필요하지 않습니다.

현재 운영 주소는 http://play.wrd.kr:25860/ 입니다. 사양 증설 후 기존 빌드와 타입 검사를 유지하는 구성으로 정상 HTTP 응답을 확인했습니다. 현재 서버의 업로드 순서는 [빠른 배포 안내](../DEPLOY.md)를 참고하세요.

## 1. 압축 해제와 설치

현재 서버의 Node.js **21.7.3**에 맞춘 패키지입니다. 압축을 풀고 `package.json`이 있는 폴더에서 실행합니다.

```sh
npm ci --include=dev
```

빌드 시 TypeScript와 Tailwind를 사용하므로 개발 의존성까지 설치해야 합니다. Windows의 `node_modules`를 Linux 서버에 옮기지 말고, 배포할 서버에서 위 명령을 실행하세요.

ZIP에는 TypeScript와 Tailwind 등 빌드에 필요한 도구만 포함합니다. 개발 작업 폴더에서 사용하는 Vitest·ESLint와 테스트 파일은 서버 패키지에서 제외했습니다.

v0.2.1은 `playwright-core`와 `@sparticuz/chromium`을 설치해 이미지가 포함된 광고 화면을 캡처합니다. Linux x64에서 관리자 권한이나 별도 `apt install` 없이 실행하도록 Chromium·NSS 라이브러리와 한글 글꼴을 준비합니다. **Pterodactyl의 `/tmp` 기본 100MB 제한을 피하기 위해 서버 디스크의 `.adsalpim-runtime/tmp`를 사용합니다.** 약 300MB 이상의 여유 공간과 해당 폴더 쓰기·실행 권한이 필요합니다. 다른 저장 경로는 패널 환경변수 `ADSALPIM_CAPTURE_DIR`로 지정합니다. Node.js 21 호환을 위해 Chromium은 `143.0.4`로 고정하며 내부 압축 해제 도우미를 사용하므로 버전 변경 시 재검증해야 합니다. Windows 개발 환경은 설치된 Chrome/Edge를 별도 임시 프로필로 실행합니다. 다른 실행 파일은 `CAPTURE_CHROME_PATH`로 지정합니다.

`index.js`는 빌드 후 캡처 엔진을 실제로 실행·확인합니다. `[adsalpim] Capture ready` 로그가 정상이며, 실패하면 `Capture unavailable`과 상태 코드를 표시합니다. `CAPTURE_STORAGE`는 디스크 공간, `CAPTURE_PERMISSION`은 실행/쓰기 권한, `CAPTURE_LIBRARIES`는 Linux 라이브러리 호환성을 확인하세요. 실행 중 캡처 실패도 같은 형식으로 서버에 기록하며, 사용자 화면에는 이미지 분석이 빠졌다는 안내를 표시합니다.

v0.3.0은 기본 분석 3건 동시 실행, 추가 12건 대기이며 대기는 최대 2분입니다. `ANALYSIS_CONCURRENCY` (1~8), `ANALYSIS_QUEUE_LIMIT` (1~50) 환경변수로 조절합니다. 캡처는 한 번에 1건씩 순차 처리하므로 동시 요청도 이미지를 분석합니다. 대기 중 안내와 연결 유지 이벤트를 보내며, 취소된 대기 요청은 제거합니다. 대기 초과는 `SERVER_BUSY`로 안내하며 텍스트 분석으로 몰래 전환하지 않습니다. 실제 캡처 실패 시에만 텍스트 분석으로 전환하고 제한을 표시합니다. 긴 광고는 앞부분 최대 8장을 분석합니다. 웹사이트의 JavaScript, 로그인, 펼치기 조작, 동영상은 실행하지 않습니다.

이 대기열은 현재 Pterodactyl의 단일 Node 프로세스 기준입니다. 여러 Node 프로세스나 서버로 확장할 때는 Redis 등 공유 작업 저장소를 별도로 구성해야 합니다. 서버 사양·Gemini 할당량에 따라 처리 시간과 허용량이 달라집니다. 동일한 공인 IP를 공유하는 이용자는 기존 IP별 요청 제한도 함께 적용받습니다.

## 2. API 키 설정

현재 서버의 `package.json` 옆에 있는 `.env`를 유지하면 됩니다. `.env.local`을 사용하고 있다면 그 파일을 그대로 유지해도 됩니다. ZIP에는 실제 키를 넣지 않았습니다.

키 파일이 없는 새 설치에서만 `.env.example`을 `.env` 또는 `.env.local`로 복사하고 다음 값을 채웁니다. 기존 키 파일에 예시 내용을 덮어쓰지 마세요.

```dotenv
GEMINI_API_KEY=본인의_API_키
GEMINI_MODEL=gemini-3.8-flash
```

호스팅 관리 화면에 환경변수를 등록할 수 있다면 파일 대신 같은 이름으로 등록해도 됩니다. `NEXT_PUBLIC_` 접두사는 붙이지 마세요. 키를 바꾼 뒤에는 서버를 다시 시작합니다.

## 3. 빌드와 실행

### 현재 Pterodactyl 서버에 올릴 때

1. 서버를 정지합니다.
2. `adsalpim-node21-ready.zip`을 `/home/container`에 풀어 기존 파일을 덮어씁니다. `index.js`와 `package.json`이 `/home/container` 바로 아래에 있어야 합니다. ZIP 안의 `.npmrc`, `package-lock.json`, `src`도 모두 교체합니다.
3. 기존 `.env` 또는 `.env.local`은 그대로 둡니다. 이번 ZIP에는 실제 API 키가 들어 있지 않습니다.
4. 시작 설정에서 `MAIN_FILE`을 `index.js`로 설정합니다. `NODE_ARGS`는 비워둡니다.
5. 서버를 시작합니다. 기존 패널 명령이 먼저 `npm install`을 실행한 뒤 `index.js`를 실행합니다. 시작 파일이 자동으로 빌드하고 서버를 띄웁니다.

포트는 호스팅의 `PORT` 환경변수, `SERVER_PORT` 환경변수, 기본값 `25860` 순서로 선택합니다. 이 호스팅에서는 선택된 값이 실제 할당 포트 `25860`인지 확인하세요. 콘솔에 다음 줄과 Next.js의 `Ready`가 나오면 서버가 실행된 것입니다.

```text
[adsalpim] Starting HTTP server on 0.0.0.0:25860
```

브라우저에서 `http://play.wrd.kr:25860/`을 엽니다. HTTPS는 별도로 설정하지 않았다면 사용할 수 없습니다. Node.js 21 버전은 변경하지 않아도 됩니다.

`Cannot find module './index.js'`는 압축이 한 단계 아래 폴더에 풀렸거나 실행 파일이 누락된 경우입니다. 빌드 중에는 서버가 아직 웹 요청을 받지 않습니다. 업데이트된 소스를 사용하도록 시작할 때마다 빌드하며, 빌드에 실패하면 오래된 결과를 실행하지 않고 종료합니다.

### 일반 Node.js 호스팅

```sh
npm run build
npm start
```

기본 접속 주소는 http://localhost:3000 입니다. 터미널을 닫으면 서버가 종료되므로 운영 서버에서는 호스팅 서비스의 프로세스 관리 기능이나 서비스 관리자로 실행하세요.

호스팅 설정은 다음과 같습니다.

| 항목 | 값 |
| --- | --- |
| 실행 환경 | Node.js 21.7.3 이상 |
| 프로젝트 루트 | `package.json`이 있는 폴더 |
| 설치 명령 | `npm ci --include=dev` |
| 빌드 명령 | `npm run build` |
| 시작 명령 | `npm start` |
| 포트 | `PORT` 환경변수, 없으면 `3000` |
| 필수 비밀 환경변수 | `GEMINI_API_KEY` |
| 상태 확인 경로 | `GET /` |

설치와 빌드 입력칸이 하나라면 `npm ci --include=dev && npm run build`로 설정합니다. 정적 파일 게시 폴더는 지정하지 않습니다. 이 패키지는 Cloudflare Pages의 정적 파일 직접 업로드용이 아닙니다.

포트를 직접 지정하려면 다음 명령도 사용할 수 있습니다.

```sh
npm start -- --port 8080
```

`PORT`를 사용한다면 호스팅 설정이나 셸 환경변수로 지정하세요. `.env.local`에 적는 방식으로는 서버의 포트를 바꿀 수 없습니다.

## 4. 도메인과 프록시

호스팅 서비스의 HTTPS·도메인 연결 기능을 사용합니다. 직접 Nginx를 운영한다면 기존 HTTPS 서버 블록 안에 아래 설정을 적용할 수 있습니다. 이 예시는 Nginx가 인터넷 요청을 직접 받는 구성입니다.

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_set_header X-Forwarded-Host $http_host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_buffering off;
    proxy_read_timeout 600s;
}
```

분석 진행 상태는 스트림으로 전송합니다. 프록시 버퍼링을 끄고 분석이 끝날 때까지 연결을 허용하세요. 앞에 CDN이나 다른 프록시가 있다면 신뢰하는 프록시에서만 실제 IP를 복원하도록 설정해야 합니다. 앱의 요청 횟수 제한은 IP 헤더를 사용합니다.

## 5. 실행 확인

1. `/`, `/privacy`, `/legal`이 열리는지 확인합니다.
2. 공개 광고 URL 하나로 실제 분석을 실행합니다.
3. 주장·출처·오류 안내가 표시되는지 확인합니다.

실제 Gemini 분석은 키의 모델 접근 권한과 사용량 한도에 따라 달라집니다. v0.2.0은 LG 이벤트 페이지에서 실제 API 호출과 하이라이트를 로컬 검증했습니다. 원격 서버에서도 업로드 후 같은 페이지로 이미지 문구와 표시 위치를 확인하세요.

### 운영자용 오류 코드 안내

사이트 방문자에게는 서비스 이용 안내를 표시합니다. 서버 설정 확인이 필요한 경우 분석 API 응답의 `code`를 기준으로 다음을 점검하세요.

| 오류 코드 | 운영자가 확인할 항목 |
| --- | --- |
| `MISSING_API_KEY` | `.env`, `.env.local` 또는 패널 환경변수의 `GEMINI_API_KEY` 설정 후 서버 재시작 |
| `AI_AUTH` | Google API 키의 유효성·권한 |
| `AI_MODEL_NOT_FOUND` | `GEMINI_MODEL`과 해당 키의 모델 접근 권한 |
| `AI_BAD_REQUEST` | 해당 모델의 URL Context·Google 검색·구조화 출력 지원 여부 |
| `AI_QUOTA` | Google 프로젝트의 사용량·할당량 |
| `SERVER_BUSY` | 전체 분석 대기 한도·시간 초과. 서버 사양과 API 할당량 확인 후 동시 실행 수 조절 |

개발 화면만 확인하려면 `npm run dev:mock`으로 http://localhost:3100 을 엽니다. 이 모드는 가상 데이터를 사용하며, 운영 서버에서는 켜지지 않습니다.
