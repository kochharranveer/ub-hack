export const dynamic = "force-dynamic";
import "@ui/theme.css";
import styles from "./care.module.css";
export const metadata = {
  title: "Panda · Care",
  description: "Your care plan and recovery companion",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={styles.root}>{children}</body>
    </html>
  );
}
