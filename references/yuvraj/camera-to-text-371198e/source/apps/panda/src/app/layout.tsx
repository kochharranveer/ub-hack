import "@ui/theme.css";
import { Shell } from "@ui/Shell";
export const metadata = {
  title: "Panda · Panda",
  description: "Synthetic-data three-app starter",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Shell owner="Ranveer" app="panda">
          {children}
        </Shell>
      </body>
    </html>
  );
}
