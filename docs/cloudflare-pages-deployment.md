# adsalpim.pages.dev와 Node.js 서버 연결

공개 사이트 주소는 **https://adsalpim.pages.dev/**, 사이트와 분석 API를 실행하는 원본 서버는 **http://play.wrd.kr:25860/** 입니다.

Cloudflare Pages에 중계 Worker를 올리면 다음 순서로 요청을 전달합니다.

```text
방문자 → HTTPS adsalpim.pages.dev → Cloudflare Pages Worker
                                      ↓
                         HTTP play.wrd.kr:25860
                           Next.js 화면 + 분석 API
                                      ↓
                           Gemini (서버의 API 키)
```

브라우저의 `/api/analyze` 요청과 화면·정적 파일을 모두 같은 Node.js 서버로 전달합니다. 브라우저에 HTTP 서버 주소를 직접 넣지 않아 HTTPS 혼합 콘텐츠 및 브라우저 CORS 문제가 생기지 않습니다. Node.js 서버의 사이트 소스를 갱신하면 Pages에서도 같은 화면을 제공합니다.

## Cloudflare 대시보드에서 업로드

1. **Workers 및 Pages → 기존 `adsalpim` 프로젝트**를 엽니다.
2. **설정 → Functions → 호환성 날짜(Compatibility date)**에서 **Production을 `2026-07-01`**로 설정합니다. Preview도 사용할 경우 같은 값으로 맞춥니다. 이미 이 날짜 이후라면 그대로 사용할 수 있습니다.
   - `25860` 사용자 지정 포트가 실제로 사용되어야 합니다. `2024-09-02` 이전의 호환성 날짜를 유지해야 한다면 대신 **Compatibility flags에 `allow_custom_ports`**를 추가합니다.
   - `ignore_custom_ports`가 있으면 제거합니다. 포트가 무시되면 원본 서버와 연결되지 않습니다.
3. **새 배포 만들기 → Production**에서 `artifacts/adsalpim-cloudflare-connect.zip`을 업로드하고 배포합니다.
4. https://adsalpim.pages.dev/ 를 새로고침합니다. 광고살핌 화면이 나오고, 주소창에는 `adsalpim.pages.dev`가 유지되어야 합니다.

ZIP 루트에는 `_worker.js`, `_routes.json`, `index.html` 세 파일만 있습니다. 압축을 풀어 폴더로 올릴 때도 이 파일들이 업로드 루트에 있어야 합니다. `_worker.js`는 Pages Advanced Mode 서버 코드이며, 일반 브라우저 스크립트가 아닙니다.

**이번 연결에는 Node.js 서버 파일 재업로드, 서버 재시작, API 키 재입력이 필요하지 않습니다.** 현재 실행 중인 서버와 `.env`를 유지하세요. Cloudflare ZIP에는 API 키와 `.env`가 없습니다. API 키는 Node.js 서버에서만 사용합니다.

기존 Node.js 서버는 계속 켜져 있어야 합니다. 브라우저와 Cloudflare 구간은 HTTPS이며, 현재 제공된 원본 서버 주소에 맞춰 Cloudflare와 원본 서버 구간은 HTTP입니다.

## 연결 확인과 오류

- 홈, `/privacy`, `/legal`, `/_next/static/...`가 같은 사이트 주소에서 열려야 합니다.
- 정상적으로 중계된 응답에는 `X-Adsalpim-Proxy: node21-v1` 헤더가 있습니다.
- 서버 연결이 실패하면 API는 HTTP 502와 `NETWORK` 오류를 반환합니다.
- HTTP 522가 계속되면 호환성 날짜/포트 설정, Production 배포 성공 여부, `http://play.wrd.kr:25860/`의 접속 상태를 확인합니다.
- 페이지를 열 수 있어도 실제 Gemini 분석 성공까지 보장되는 것은 아닙니다. 공개 광고 링크 분석으로 키·모델 설정을 별도로 확인해야 합니다.

## 개발자용

중계 원본은 `deployment/cloudflare-pages/upload/_worker.js`, CLI 설정은 같은 상위 폴더의 `wrangler.jsonc`입니다. 중계 대상 주소는 Worker 상단에 고정되어 있으며, 방문자의 URL이나 쿼리로 바뀌지 않습니다. 원본 서버 주소/포트를 변경할 때만 수정하고 Pages에 다시 배포합니다.

프로젝트 루트에서:

```powershell
node --test deployment/cloudflare-pages/proxy.test.mjs
powershell -NoProfile -File scripts/package-cloudflare.ps1
```

CLI를 사용할 경우 **로컬 Node.js 22.12 이상**에서 Wrangler 4.159.0을 사용합니다. 호스팅 서버의 Node.js 21 버전과는 별개입니다. 기존 프로젝트의 Production branch 이름을 확인한 뒤 그 이름으로 배포합니다.

```powershell
cd deployment/cloudflare-pages
npx wrangler@4.159.0 login
npx wrangler@4.159.0 pages project list
# 아래 값은 실제 Production branch 이름으로 바꾸세요.
npx wrangler@4.159.0 pages deploy upload --project-name adsalpim --branch YOUR_PRODUCTION_BRANCH
```

설정 파일은 CLI 배포 시 적용됩니다. **대시보드 ZIP 업로드는 로컬 `wrangler.jsonc`를 읽지 않으므로 위의 호환성 설정을 대시보드에서 확인해야 합니다.**

공식 문서:

- [Pages 직접 업로드 — `_worker.js`는 대시보드 업로드 지원](https://developers.cloudflare.com/pages/get-started/direct-upload/#functions)
- [Pages Advanced Mode](https://developers.cloudflare.com/pages/functions/advanced-mode/)
- [사용자 지정 포트 호환성 설정](https://developers.cloudflare.com/workers/configuration/compatibility-flags/#allow-specifying-a-custom-port-when-making-a-subrequest-with-the-fetch-api)
- [Pages Functions 실행 환경 설정](https://developers.cloudflare.com/pages/functions/get-started/#runtime-features)

## 검증 기록 — 2026-11-10

- 변경 전 공개 Pages 주소: HTTP 522. 원본 Node.js 서버: HTTP 200.
- Worker 회귀 검사 **11개 통과**: 고정 원본 주소, 전달 헤더 교체, 외부 Origin 차단, 허용 메서드, 진행 이벤트 스트리밍, 취소 전달, 리다이렉트, 캐시, 요청 제한·연결 오류 처리.
- 새 Worker 및 테스트 파일 ESLint: 경고·오류 없이 통과.
- Wrangler 4.159.0의 로컬 Cloudflare 실행 환경에서 실제 `play.wrd.kr:25860`으로 중계: 홈·개인정보·법적 고지 HTTP 200, 정적 파일 12개 HTTP 200.
- 로컬 중계 주소의 분석 API에서 NDJSON 시작 이벤트와 `BLOCKED_URL` 응답 수신. 브라우저에서도 분석 버튼을 눌러 같은 서버 응답이 표시됨을 확인.
- 실제 Gemini 호출이나 유료 분석은 실행하지 않았으며, 모델·키의 유효성은 이번 연결 검사 범위에 포함되지 않음.
- ZIP은 루트 파일 3개, 3,262바이트. 검증한 원본과 일치하며 실제 API 키가 없음을 확인.
- **공개 Pages 배포는 아직 실행하지 않음**: CLI는 Cloudflare 미로그인 상태이고, 연결된 Chrome 관리 탭 접근은 자동화 도구 오류로 실패. ZIP 업로드 및 호환성 설정 후 공개 주소에서 재확인 필요.
