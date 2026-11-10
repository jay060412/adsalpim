import type { Metadata } from "next";
import { ProsePage, ProseSection } from "@/components/prose-page";

export const metadata: Metadata = {
  title: "개인정보 처리 안내",
  description: "광고살핌이 입력된 링크와 분석 내용을 어떻게 처리하는지 안내합니다.",
};

export default function PrivacyPage() {
  return (
    <ProsePage
      title="개인정보 처리 안내"
      lead="광고살핌은 회원가입 없이 이용할 수 있으며, 분석에 꼭 필요한 정보만 일시적으로 처리합니다."
    >
      <ProseSection title="처리하는 정보">
        <ul>
          <li>사용자가 입력한 광고 링크(URL)</li>
          <li>해당 링크에서 가져온 공개 웹페이지의 본문 텍스트와 이미지, 분석 당시 화면 캡처</li>
          <li>과도한 요청을 막기 위한 접속 IP 주소 (요청 횟수 계산 용도)</li>
        </ul>
      </ProseSection>

      <ProseSection title="저장하지 않는 정보">
        <p>
          입력한 링크, 수집한 광고 본문과 화면 캡처, 분석 결과는 광고살핌 서버에 영구 저장하지 않습니다. 분석
          결과는 사용자의 브라우저 화면에만 표시되며, 페이지를 닫거나 새로고침하면 사라집니다.
        </p>
        <p>
          요청 횟수 제한을 위한 IP 주소는 서버 메모리에만 잠시 보관되며, 데이터베이스나 파일로 기록하지
          않습니다. 서버 오류 로그에는 오류 종류만 남기고 링크나 광고 내용은 남기지 않습니다.
        </p>
      </ProseSection>

      <ProseSection title="외부 서비스로 전송되는 정보">
        <p>분석을 위해 아래 정보가 Google의 Gemini API로 전송됩니다.</p>
        <ul>
          <li>입력한 광고 링크와 본문 텍스트, 이미지 문구가 포함된 화면 캡처 (광고 주장 추출 및 위치 확인 용도)</li>
          <li>광고에서 추출한 주장 문구 (Google 검색을 통한 근거 확인 용도)</li>
        </ul>
        <p>
          광고살핌은 Gemini API를 호출할 때 대화 기록이 저장되지 않도록 설정(store=false)합니다. 다만
          전송된 데이터는 Google의 Gemini API 이용약관과 개인정보처리방침에 따라 처리되며, 이용 중인
          요금제에 따라 Google의 서비스 개선에 활용될 수 있습니다.
        </p>
        <p>
          또한 광고 페이지를 가져오기 위해 광고살핌 서버가 입력된 링크의 웹사이트에 접속합니다. 이때
          해당 웹사이트에는 광고살핌 서버의 접속 기록이 남을 수 있습니다.
        </p>
      </ProseSection>

      <ProseSection title="이용 시 유의사항">
        <ul>
          <li>
            링크 주소 안에 개인정보(이름, 주문번호, 로그인 토큰 등)가 포함되어 있다면 해당 부분을 지운
            뒤 입력해 주세요.
          </li>
          <li>로그인이 필요한 페이지나 비공개 페이지는 분석하지 않습니다.</li>
        </ul>
      </ProseSection>

      <ProseSection title="브라우저에 저장되는 정보">
        <p>
          다크 모드 선택값 하나만 브라우저의 로컬 저장소에 보관합니다. 광고 분석과 관련된 정보나 추적용
          쿠키는 저장하지 않습니다.
        </p>
      </ProseSection>
    </ProsePage>
  );
}
