import type { Metadata } from "next";
import { ProsePage, ProseSection } from "@/components/prose-page";

export const metadata: Metadata = {
  title: "법적 고지",
  description: "광고살핌 분석 결과의 성격과 이용 시 유의사항을 안내합니다.",
};

export default function LegalPage() {
  return (
    <ProsePage
      title="법적 고지"
      lead="본 서비스는 AI 기반 정보 분석 도구이며, 법적인 허위·과장광고 판정을 대신하지 않습니다."
    >
      <ProseSection title="분석 결과의 성격">
        <p>
          광고살핌의 분석 결과는 소비자가 광고를 합리적으로 판단할 수 있도록 돕는 참고 정보입니다. 특정
          광고가 「표시·광고의 공정화에 관한 법률」, 「식품 등의 표시·광고에 관한 법률」 등 관련 법령을
          위반했는지 여부는 공정거래위원회, 식품의약품안전처 등 소관 기관과 법원만이 판단할 수 있습니다.
        </p>
        <p>
          ‘근거 확인’, ‘검증 필요’, ‘근거 부족’, ‘사실 불일치’, ‘판단 불가’는 분석 시점에 검색으로 확인한
          공개 자료를 기준으로 한 검증 상태이며, 광고의 적법성이나 제품의 품질에 대한 평가가 아닙니다.
        </p>
      </ProseSection>

      <ProseSection title="AI 분석의 한계">
        <ul>
          <li>AI는 내용을 잘못 이해하거나 중요한 주장을 놓칠 수 있습니다.</li>
          <li>검색으로 찾지 못한 근거가 실제로는 존재할 수 있으며, 그 반대도 가능합니다.</li>
          <li>이미지 속 글자, 동영상, 로그인 후에만 보이는 내용은 분석하지 못합니다.</li>
          <li>광고 페이지와 참고 자료는 분석 이후에 바뀔 수 있습니다.</li>
        </ul>
        <p>중요한 구매 결정을 내리기 전에는 반드시 출처 링크의 원문을 직접 확인해 주세요.</p>
      </ProseSection>

      <ProseSection title="광고주·판매자에 대하여">
        <p>
          분석 결과는 특정 사업자를 비방하거나 그 광고가 위법하다고 단정하려는 목적이 아닙니다. 분석
          결과를 인용하거나 공유할 때에는 이 고지의 내용을 함께 전달해 주세요.
        </p>
      </ProseSection>

      <ProseSection title="피해가 의심될 때">
        <p>
          허위·과장광고로 인한 피해가 의심된다면 1372 소비자상담센터, 한국소비자원, 공정거래위원회,
          식품의약품안전처(식품·의약품 관련) 등 공식 기관에 상담하거나 신고할 수 있습니다.
        </p>
      </ProseSection>

      <ProseSection title="책임의 제한">
        <p>
          광고살핌은 분석 결과의 정확성과 완전성을 보증하지 않으며, 분석 결과를 이용해 내린 판단과 그
          결과에 대한 책임은 이용자에게 있습니다.
        </p>
      </ProseSection>
    </ProsePage>
  );
}
