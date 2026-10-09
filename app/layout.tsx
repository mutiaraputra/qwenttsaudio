import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Qwen TTS Audio Studio",
  description:
    "Kloning suara & text-to-speech berbasis Qwen3-TTS dari Alibaba Cloud DashScope. Unggah audio referensi, kloning suara, lalu ubah teks menjadi suara.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
