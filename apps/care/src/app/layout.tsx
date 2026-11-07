import "@ui/theme.css";
import { Shell } from "@ui/Shell";
export const metadata = {
  title: "Panda · Care",
  description: "Synthetic-data three-app starter",
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
