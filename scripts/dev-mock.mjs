// 개발용 모의 분석 모드로 개발 서버를 띄운다 (포트 3100).
// Gemini API 키 없이 진행 화면과 결과 화면을 확인할 때만 사용한다.
// 이 모드의 분석 결과는 모두 가상의 데이터이며 화면에 "테스트용 모의 데이터"로 표시된다.
import { spawn } from "node:child_process";

const child = spawn("npx", ["next", "dev", "--port", "3100"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, ADSALPIM_MOCK: "1" },
});
child.on("exit", (code) => process.exit(code ?? 0));
