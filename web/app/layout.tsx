import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "World Scale",
  description: "Your real-world credentials, turned into a fantasy character.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
