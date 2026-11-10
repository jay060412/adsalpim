# 현재 서버 배포 안내 — v0.3.0

원본 서버: http://play.wrd.kr:25860/

이번 업데이트는 여러 사용자가 동시에 분석할 때 이미지 캡처를 건너뛰던 문제를 수정합니다. **`adsalpim-node21-multiuser.zip`을 원본 서버에 올려야 합니다.** `adsalpim-node21-ready.zip`도 같은 v0.3.0입니다.

기본 분석 3건 동시 실행, 추가 12건 대기, 최대 대기 시간 2분입니다. 화면 캡처는 메모리를 보호하기 위해 순차 진행하며 대기 중 안내를 표시합니다. 대기 한도에 도달하면 재시도 안내를 표시합니다. 필요하면 `.env`의 `ANALYSIS_CONCURRENCY`, `ANALYSIS_QUEUE_LIMIT`로 조절하되 서버 사양과 Gemini 할당량에 맞춰야 합니다.

캡처 엔진이 기본 100MB `/tmp`를 넘는 문제를 피하도록 `/home/container/.adsalpim-runtime`을 사용합니다. 서버 디스크에 약 300MB 이상의 여유 공간을 두세요. 시작 시 `[adsalpim] Capture ready: Chromium ...` 로그가 표시되면 캡처 엔진 준비가 완료된 것입니다. `Capture unavailable`이면 뒤에 표시된 상태 코드를 확인하세요. API 키나 URL은 이 로그에 기록하지 않습니다.

공개 사이트 `https://adsalpim.pages.dev/`에 기존 연결용 프록시를 배포했다면 Cloudflare 파일은 바꿀 필요가 없습니다. 아직 연결하지 않았다면 [Pages 연결 배포 안내](docs/cloudflare-pages-deployment.md)를 따르세요.

| 서버 설정 | 값 |
| --- | --- |
| Node.js | 21.7.3 |
| 파일 위치 | `/home/container` |
| 실행 파일 (`MAIN_FILE`) | `index.js` |
| 추가 실행 인수 (`NODE_ARGS`) | 빈칸 |
| 할당 포트 | `25860` |
| API 키 파일 | 기존 `.env` 유지 (`.env.local`도 지원) |

1. 서버를 정지합니다.
2. `adsalpim-node21-ready.zip`을 `/home/container`에 풀어 기존 소스와 설정 파일을 덮어씁니다. `index.js`와 `package.json`이 이 폴더 바로 아래에 있어야 합니다.
3. 기존 `.env` 또는 `.env.local`은 그대로 둡니다. ZIP에는 실제 API 키가 없으며, `.env.example`은 예시 파일입니다.
4. 위 서버 설정을 유지하고 시작합니다. 패널이 의존성을 설치한 뒤 `index.js`가 빌드·타입 검사·서버 실행을 순서대로 수행합니다.
5. 아래 로그와 `Ready`를 확인한 뒤 사이트에 접속합니다.

```text
[adsalpim] Starting HTTP server on 0.0.0.0:25860
```

현재는 사양 증설로 빌드 정체가 해결된 구성을 사용합니다. 타입 검사는 계속 실행하며, 빌드가 끝나기 전에는 웹 요청을 받지 않습니다. `PORT` 또는 `SERVER_PORT`가 설정돼 있다면 값이 `25860`인지 확인하세요.

LG 이벤트 페이지로 로컬에서 실제 Gemini 보고서와 이미지 하이라이트를 확인했습니다. Linux·Node.js 21.7.3에서 캡처 엔진도 실행 확인했습니다. 새 버전을 원격 서버에 업로드하는 작업은 별도로 필요합니다.

운영 중 오류 코드별 확인 방법은 [상세 배포 안내](docs/nodejs-deployment.md)를 참고하세요.
