# Cloudflare Pages 연결 코드

공개 사이트 `https://adsalpim.pages.dev/`의 요청을 Node.js 원본 서버 `http://play.wrd.kr:25860/`로 전달합니다. 실제 화면과 AI 분석은 저장소 루트의 Node.js 애플리케이션에서 실행됩니다.

## 파일

- `upload/_worker.js`: Pages Advanced Mode 프록시. HTML·정적 자산·분석 API를 전달하고 NDJSON 응답을 스트리밍합니다.
- `upload/_routes.json`: 모든 요청에 Worker를 적용합니다.
- `upload/index.html`: 배포용 기본 HTML.
- `wrangler.jsonc`: 프로젝트명, 출력 폴더, 사용자 지정 포트 호환성 설정.
- `proxy.test.mjs`: 프록시의 경로·메서드·헤더·Origin·스트리밍 동작 검사.

## 패키징

저장소 루트에서 실행합니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package-cloudflare.ps1
```

생성된 `artifacts/adsalpim-cloudflare-connect.zip`을 Cloudflare Pages에 직접 업로드합니다. 업로드 루트에는 `upload` 폴더 자체가 아니라 그 안의 파일 3개가 있어야 합니다. 상세 설정은 [Pages 연결 배포 안내](../../docs/cloudflare-pages-deployment.md)를 확인하세요.

```sh
node --test deployment/cloudflare-pages/proxy.test.mjs
```

API 키는 Node.js 서버의 `.env`에만 설정합니다. 이 프록시에 API 키를 넣지 않습니다. 원본 서버 주소를 바꾸면 `_worker.js`의 `UPSTREAM_ORIGIN`을 수정한 뒤 Pages를 다시 배포합니다.
