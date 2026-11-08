export const dynamic="force-dynamic";
import "@ui/theme.css";
import { Shell } from "@ui/Shell";
export const metadata = {
  title: "Panda · Care",
  description: "Your care plan and recovery companion",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Shell owner="Asmita" app="care">
          {children}
        </Shell>
      </body>
    </html>
  );
}
