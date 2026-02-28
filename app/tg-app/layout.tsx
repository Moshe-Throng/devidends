import type { Metadata, Viewport } from "next";
import { TelegramProvider } from "@/components/TelegramProvider";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#27ABD2",
};

export const metadata: Metadata = {
  title: "Devidends",
  description: "Browse opportunities, score your CV, and manage your profile.",
};

export default function TgAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TelegramProvider>
      <div
        className="min-h-screen"
        style={{
          background: "var(--tg-theme-bg-color, #ffffff)",
          color: "var(--tg-theme-text-color, #212121)",
        }}
      >
        {children}
      </div>
    </TelegramProvider>
  );
}
