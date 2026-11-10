import { Analyzer } from "@/components/analyzer/analyzer";
import { Features } from "@/components/home/features";
import { HowItWorks } from "@/components/home/how-it-works";

export default function HomePage() {
  return (
    <Analyzer>
      <Features />
      <HowItWorks />
    </Analyzer>
  );
}
