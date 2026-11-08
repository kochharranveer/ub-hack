export const dynamic="force-dynamic";
import "@ui/theme.css";
import { Shell } from "@ui/Shell";
export const metadata = {
  title: "Panda · Rehab",
  description: "Your care plan and recovery companion",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Shell owner="Yuvraj" app="rehab">
          {children}
        </Shell>
      </body>
    </html>
  );
}
