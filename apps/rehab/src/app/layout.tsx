import "@ui/theme.css";
import { Shell } from "@ui/Shell";
export const metadata = {
  title: "Panda · Rehab",
  description: "Synthetic-data three-app starter",
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
