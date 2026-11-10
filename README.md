# 광고살핌

**광고를 믿기 전, AI로 한 번 더 살핌.**

이 저장소에는 Node.js 서버와 Cloudflare Pages 연결 코드가 함께 들어 있습니다.

| 구성 | 위치 | 역할 |
| --- | --- | --- |
| Node.js 서버 | 저장소 루트, `src/`, `index.js` | 사이트 화면, 광고 화면 캡처, Gemini 분석 API |
| Cloudflare Pages | [`deployment/cloudflare-pages/`](deployment/cloudflare-pages/README.md) | 공개 HTTPS 주소에서 Node.js 서버로 요청 전달 |
| 서버 배포 ZIP 생성 | `scripts/package-node.ps1` | Node.js 21 호스팅용 의존성 구성으로 패키징 |
| Cloudflare ZIP 생성 | `scripts/package-cloudflare.ps1` | Pages 직접 업로드 파일 3개 패키징 |

실제 API 키와 `.env` 파일, 설치된 의존성, 빌드 결과, 개인 작업 기록은 GitHub에 포함하지 않습니다. 개발용 전체 설치·테스트는 Node.js 24에서 수행하고, Node.js 21 서버에는 생성한 서버 배포 ZIP을 사용합니다.

공개 광고 URL의 본문과 핵심 주장을 추출하고, Gemini와 Google Search Grounding으로 근거를 찾아 주장별 보고서를 제공하는 Next.js 애플리케이션입니다. EasyThon 2026 출품을 위해 개발했습니다. 법률 위반을 확정하거나 허위광고 확률·신뢰도 점수를 만들지 않습니다.

공개 사이트 연결 대상은 [adsalpim.pages.dev](https://adsalpim.pages.dev/)이며, 원본 서버는 [play.wrd.kr:25860](http://play.wrd.kr:25860/)입니다. Node.js 21.7.3과 Pterodactyl의 `MAIN_FILE=index.js` 구성을 사용합니다. Cloudflare 주소 연결은 [Pages 연결 배포 안내](docs/cloudflare-pages-deployment.md), 원본 서버 업데이트는 [서버 배포 안내](DEPLOY.md)를 확인하세요. Pages 연결 ZIP은 준비 및 로컬 검증을 마쳤으며, 실제 Pages 반영은 업로드 후 확인해야 합니다.

**v0.3.0은 여러 사용자의 분석 요청을 대기열로 처리합니다.** 기본 3건의 분석을 동시에 실행하고 12건을 추가로 대기시킵니다. 캡처 차례를 기다리는 요청도 이미지를 분석하며, 대기 초과를 텍스트 분석 성공으로 표시하지 않습니다. 이미지 인식·광고 화면 하이라이트와 Pterodactyl 임시 공간 제한 수정도 포함합니다. 새 버전은 Node.js 서버에 업로드해야 반영됩니다. 배포 ZIP에는 비밀값을 포함하지 않습니다. [검증 기록](docs/verification.md)에서 점검 범위를 확인하세요.

## 주요 기능

- URL 확인 → 본문 수집 → 주장 추출 → 근거 검색 → 보고서 생성의 5단계 진행 상태
- Gemini URL Context 및 서버 HTML 수집, 확보한 원문과 인용문 대조
- 검색 도구의 인용 메타데이터로 출처 구성, 공공기관 자료 우선 검색
- 근거 확인 / 검증 필요 / 근거 부족 / 사실 불일치 / 판단 불가 분류
- 이미지 속 문구 인식, 캡처한 광고 화면에 번호·하이라이트 표시, 해당 분석 카드와 양방향 이동
- 주장별 설명·근거·추가 확인 사항, 텍스트 원문은 접힌 보조 영역으로 제공
- 결과 복사, 원본 광고 열기, 인쇄, 새 분석, 취소 및 오류 재시도
- 한국어 UI, 반응형 레이아웃, 다크 모드, Motion 애니메이션과 동작 줄이기 설정 존중
- SSRF·DNS 재바인딩 방어, 리다이렉트 재검증, 요청 크기·시간·횟수 제한

## 기술 스택

Next.js 16.4.6 App Router, React 19.3, TypeScript, Tailwind CSS 4, shadcn/ui, Lucide React, Motion for React, 공식 `@google/genai` 2.32, Zod 4, Cheerio, Undici 7을 사용합니다. Node.js 21 호환을 위해 서버 의존성 버전을 고정했습니다. shadcn 스타일은 MIT 라이선스와 함께 로컬 CSS로 포함합니다. 별도 Python 서버나 데이터베이스는 필요하지 않습니다.

## 설치 및 API 키 설정

Node.js 21.7.3 이상과 npm이 필요합니다. 서버와 같은 Node.js 21.7.3을 호환 대상 버전으로 사용합니다. 프로젝트 루트에서 실행합니다.

```sh
npm ci
```

키 파일이 없는 새 설치에서만 `.env.example`을 `.env.local`로 복사합니다. 기존 `.env` 또는 `.env.local`이 있다면 그대로 사용합니다.

```powershell
# Windows PowerShell
Copy-Item .env.example .env.local
```

```sh
# macOS / Linux
cp .env.example .env.local
```

[Google AI Studio](https://aistudio.google.com/apikey)에서 발급받은 키를 `.env.local`에 설정합니다. API 키를 소스코드나 채팅에 붙여 넣지 마세요.

```dotenv
GEMINI_API_KEY=발급받은_API_키
GEMINI_MODEL=gemini-3.8-flash
```

```sh
npm run dev
```

[http://localhost:3000](http://localhost:3000)을 열고 공개 광고 URL을 입력합니다. 환경변수를 바꾸면 서버를 다시 시작하세요. 키가 없거나 예시 자리표시자 그대로이면 설정 안내 오류를 표시합니다.

### API 키 없이 화면 확인

실행 중인 개발 서버를 종료한 뒤 다음 명령을 사용합니다.

```sh
npm run dev:mock
```

[http://localhost:3100](http://localhost:3100)에서 `https://example.com/product`를 입력하면 고정된 가상 광고 보고서를 확인할 수 있습니다. 페이지 수집·AI 분석·검색 모두 모의이며 결과에 **테스트용 모의 데이터**가 표시됩니다. 다른 URL도 같은 가상 광고를 반환합니다.

`ADSALPIM_MOCK=1`은 `NODE_ENV=production`에서 무시됩니다. 두 개발 서버는 `.next/dev`를 공유하므로 동시에 실행하지 마세요.

### 환경변수

| 변수 | 기본값 | 용도 |
| --- | --- | --- |
| `GEMINI_API_KEY` | 없음 | 서버에서만 사용하는 API 키 |
| `GEMINI_MODEL` | `gemini-3.8-flash` | 사용할 모델 ID |
| `PAGE_READER` | `url-context` | `url-context` 또는 `direct` |
| `RATE_LIMIT_PER_MINUTE` | `5` | IP당 분당 요청 한도 |
| `RATE_LIMIT_PER_DAY` | `60` | IP당 24시간 요청 한도 |
| `ADSALPIM_MOCK` | 꺼짐 | `1`이면 개발·테스트 환경에서만 모의 분석 |
| `CAPTURE_CHROME_PATH` | 자동 선택 | 별도 Chromium 실행 파일을 사용할 때만 지정 |
| `ADSALPIM_CAPTURE_DIR` | `.adsalpim-runtime` | Linux 캡처 엔진·임시 파일을 둘 서버 디스크 경로 |
| `ANALYSIS_CONCURRENCY` | `3` | 프로세스당 동시 분석 수 (1~8) |
| `ANALYSIS_QUEUE_LIMIT` | `12` | 추가 분석 대기 수 (1~50), 최대 2분 대기 |

화면 캡처에 성공하면 본문과 캡처 이미지를 함께 Gemini에 전달합니다. 캡처에 실패하면 기존 텍스트 분석으로 전환하고 한계를 표시합니다. 이때 기본 모드는 URL Context와 서버 본문을 대조하며, `direct` 모드는 서버 본문을 우선 사용합니다. 서버가 원문을 확보하지 못하면 URL Context의 읽기 성공 상태를 확인해야 분석을 계속합니다.

## 분석 구조

`POST /api/analyze`에 `{ "url": "https://..." }`을 보내면 `application/x-ndjson`으로 `stage`, `ping`, `result`, `error` 이벤트를 받습니다. 입력·설정 오류는 스트림 시작 전에 JSON 오류로 반환됩니다.

1. URL과 공개 주소 여부를 검사합니다.
2. DNS를 검증하는 HTTP 클라이언트로 HTML·이미지·CSS·글꼴을 수집합니다. 스크립트를 실행하지 않는 Chromium으로 공개 화면을 캡처합니다.
3. Gemini Interactions API로 텍스트·이미지 문구와 화면 좌표를 추출합니다. 원문에 없고 유효한 화면 위치도 없는 인용은 제외합니다. 이미지 인식과 좌표는 AI 추정이므로 오차가 있을 수 있습니다.
4. Google 검색 도구로 검증 자료를 찾고 인용 메타데이터에서 출처를 구성합니다.
5. 별도 구조화 응답으로 보고서를 만들고 Zod 검증, 출처 ID 연결, 근거 없는 확정 판정 조정을 거칩니다.

Gemini 3의 도구·구조화 출력 조합은 공식 문서에 명시되어 있습니다. 이 프로젝트는 근거 검색과 최종 보고서 생성을 분리합니다. 구조화 요청이 거부되면 JSON 출력 지시로 재시도합니다. [Gemini 3.8 Flash 공식 문서](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash)를 확인했지만, 사용자 키의 모델 접근 권한과 할당량은 실제 호출로 확인해야 합니다.

```text
src/app/api/analyze/route.ts   요청 제한, NDJSON 스트림, 연결 취소
src/lib/analysis/             Gemini, 프롬프트, 스키마, 파이프라인, 출처 처리
src/lib/security/             URL·DNS 검증, 안전한 수집, 요청 횟수 제한
src/lib/extract/              HTML 본문 추출
src/components/analyzer/     입력 및 진행 화면
src/components/report/       주장·출처·원문·복사·인쇄
```

## 검사 및 프로덕션 실행

개발 작업 폴더의 테스트·린트 도구(Vitest 5, ESLint)는 Node.js 24에서 사용합니다. 서버용 ZIP에는 해당 도구와 테스트 파일을 넣지 않으며, 빌드·실행에 필요한 구성만 포함합니다.

```sh
npm test
npm run typecheck
npm run lint
npm run build
npm run start
```

테스트는 유료 Gemini API를 호출하지 않습니다. 실제 검증은 키를 설정하고 모의 모드를 끈 서버에서 공개 URL로 수행하세요. 접근 실패, 검색 근거 없음, 할당량 초과도 함께 확인해야 합니다.

## Node.js 서버 배포

`adsalpim-node21-ready.zip`은 현재 서버에 맞춘 소스 패키지입니다. Pterodactyl에서는 ZIP을 서버 루트에 풀고 `MAIN_FILE=index.js`로 시작합니다. 직접 셸에서 같은 방식으로 실행하려면 다음 명령을 사용합니다.

```sh
npm ci --include=dev
node index.js
```

서버에 이미 있는 `.env` 또는 `.env.local`을 유지하세요. 호스팅 환경변수에 `GEMINI_API_KEY`를 등록하는 방식도 지원합니다. 현재 서버의 포트는 25860입니다. 자세한 설정과 프록시 예시는 [Node.js 배포 안내](docs/nodejs-deployment.md)를 참고하세요.

이 패키지는 Node.js 서버 실행용이며 Cloudflare Pages 정적 파일 직접 업로드용이 아닙니다. 로컬 개발은 `npm run dev`로 localhost:3000에서 실행합니다.

현재 사용 중인 Pterodactyl 호스팅에서는 실행 파일(`MAIN_FILE`)을 **`index.js`**로 설정합니다. 이 파일은 매번 소스를 빌드하고, 성공한 경우에만 서버를 실행합니다. 포트는 `PORT` → `SERVER_PORT` → `25860` 순서로 선택하며 모든 인터페이스(`0.0.0.0`)에서 수신합니다. `.npmrc`가 빌드용 개발 의존성 설치를 유지하므로 ZIP의 숨김 파일까지 함께 업로드하세요.

ZIP을 다시 만들려면 프로젝트 루트에서 PowerShell로 실행합니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package-node.ps1
```

결과는 `artifacts/adsalpim-node21-ready.zip`입니다. 서버 소스·빌드 도구·잠금 파일·설정·문서를 포함하고 `.env`, `.env.local`, `node_modules`, `.next`, 테스트·린트 도구, 작업 이력은 제외합니다. 생성 과정에서 서버 구성에 맞는 잠금 파일을 따로 만듭니다.

## Vercel 배포 (대안)

1. 본인 Git 저장소를 Vercel에서 가져옵니다.
2. 프레임워크를 **Next.js**, 루트 디렉터리를 이 프로젝트 폴더로 지정하고 Node.js 24를 사용합니다.
3. `GEMINI_API_KEY`, `GEMINI_MODEL`을 Production/Preview 중 필요한 환경에 등록합니다. 키에 `NEXT_PUBLIC_` 접두사를 붙이지 마세요.
4. 기본 빌드 명령 `npm run build`로 배포합니다. DNS와 Undici를 사용하므로 Node.js 서버가 필요합니다. 정적 내보내기나 Edge 런타임을 사용하지 않습니다.
5. `/api/analyze`는 `maxDuration = 600`을 선언합니다. 실제 함수 제한은 [Vercel 실행 시간 문서](https://vercel.com/docs/functions/configuring-functions/duration)와 프로젝트 설정에서 확인하세요. 서버리스 실행 제한으로 먼저 종료되면 네트워크 오류로 표시될 수 있습니다.
6. 배포 주소에서 실제 분석, 출처, 오류 안내를 확인합니다. 환경변수 변경 후에는 재배포합니다.

이번 작업에서는 외부 배포를 수행하지 않았습니다.

## 지원 URL과 제한

- 공개 HTTP/HTTPS 상품 상세페이지·광고 랜딩 페이지·이벤트 페이지의 텍스트와 이미지가 대상입니다.
- 로컬 주소, 사설·예약 IP, 메타데이터 주소, 인증정보 포함 URL을 차단합니다. 허용 포트는 기본 포트와 80·443·8080·8443입니다.
- 로그인·유료 구독·접근 제한을 우회하지 않습니다. 동적 렌더링 전용 페이지, 봇 차단, 이미지 위주 페이지는 읽지 못할 수 있습니다.
- 서버 수집은 최대 15초, 최대 5회 리다이렉트, 본문 3 MiB까지이며 큰 본문은 일부만 분석합니다. 모델 호출도 단계별 시간 제한을 둡니다.
- 화면은 폭 1,200px, 최대 8장·높이 12,800px·JPEG 4 MiB까지 캡처합니다. 긴 페이지는 앞부분만 포함하며 안내를 표시합니다. 로그인·클릭·스크립트 실행 후 나타나는 내용과 동영상은 포함하지 않습니다.
- 캡처는 프로세스당 한 번에 1건, 최대 35초입니다. 다른 요청은 캡처 차례를 기다리며, 대기 중에는 안내를 표시합니다. 실제 캡처 실패 시에만 텍스트 분석으로 전환합니다. 이미지 글자 인식과 표시 위치에는 오차가 있을 수 있습니다.
- 전체 분석 대기는 최대 2분이며 한도가 차거나 시간이 지나면 `SERVER_BUSY`로 재시도를 안내합니다. 연결 취소 시 대기 요청을 제거하고, 처리 종료·오류 시 실행 자리를 반환합니다. 대기열은 단일 Node 프로세스 메모리에 있으며 여러 서버 간 공유되거나 재시작 후 복구되지는 않습니다. 서버 메모리·CPU와 Gemini 사용량 한도를 넘어서는 처리량을 보장하지 않습니다.
- 검색 출처가 없으면 근거 확인이나 사실 불일치로 확정하지 않습니다. 근거 부족이 곧 허위광고라는 의미는 아닙니다.
- 현재 검색 인용 메타데이터에서 출처별 발행일을 확보하지 않으므로 모델이 제안한 날짜는 표시하지 않습니다.
- 모델의 잘못된 추론이나 출처 해석 오류까지 제거할 수는 없습니다. 중요한 판단에는 연결된 원문을 직접 확인하세요.

## 보안과 개인정보

- 키는 서버 환경변수에만 보관하고 `.env.local`은 Git에서 제외합니다.
- 입력 URL·수집 본문·분석 결과를 앱 데이터베이스나 파일에 영구 저장하지 않습니다. 새로고침하면 결과가 사라집니다.
- 분석을 위해 Google에 URL·본문·공개 페이지 캡처 이미지·주장 문구를 전송합니다. `store: false`가 Google의 모든 데이터 처리·로그 정책을 비활성화하는 것은 아닙니다. `/privacy`에서 자세한 안내를 확인하세요.
- 브라우저에는 테마 선택만 저장합니다. IP별 요청 횟수는 서버 메모리에서 계산합니다.
- 서버리스 인스턴스별 제한은 서로 다르며 재시작 시 초기화됩니다. 전역 과금 한도를 보장하지 않습니다. 신뢰하는 프록시의 IP 헤더 설정과 Google 프로젝트 할당량을 함께 관리하세요.
- 외부 본문을 프롬프트의 데이터 영역으로 분리하고 HTML을 일반 텍스트로 렌더링합니다. 프롬프트 인젝션을 완전히 차단한다고 보장하지 않습니다.
- 취소 시 진행 중 호출과 후속 처리를 중단하도록 신호를 전달합니다. 이미 Google에서 처리한 요청의 비용 취소까지 보장하지는 않습니다.

공식 참고: [Interactions API](https://ai.google.dev/gemini-api/docs/interactions), [URL Context](https://ai.google.dev/gemini-api/docs/url-context), [Google Search Grounding](https://ai.google.dev/gemini-api/docs/google-search), [구조화 출력](https://ai.google.dev/gemini-api/docs/structured-output).
