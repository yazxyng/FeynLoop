import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "FeynLoop · 설명할수록 선명해지는 배움",
  description: "PDF에서 시작해 나만의 설명으로 완성하는 AI 파인만 학습실",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
