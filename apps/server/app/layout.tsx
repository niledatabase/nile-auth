import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Nile region rest api",
};

export default function RootLayout({ children }: { children: JSX.Element }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
