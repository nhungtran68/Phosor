import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Phosor Studio — Tạo video từ ảnh",
  description:
    "Không gian tạo video cá nhân từ ảnh, lời thoại tiếng Việt và giọng đọc của bạn.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
