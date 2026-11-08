export const dynamic = "force-dynamic";
import "@ui/theme.css";
export const metadata = {
  title: "Panda · Rehab",
  description: "Your care plan and recovery companion",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
