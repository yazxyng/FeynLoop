import type { Metadata } from "next";
import "./globals.css";
import { WorkspaceProvider } from "@/components/workspace-provider";
import BottomNavigation from "@/components/bottom-navigation";
export const metadata: Metadata = {
  title: "FeynLoop",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <WorkspaceProvider>
          {children}
          <BottomNavigation />
        </WorkspaceProvider>
      </body>
    </html>
  );
}
