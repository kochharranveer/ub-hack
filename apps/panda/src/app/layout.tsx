import "@ui/theme.css";
import styles from "./panda.module.css";
export const metadata = {
  title: "Panda · Your care companion",
  description: "Talk to Panda, see today's reviewed plan, and choose your next step. Synthetic demonstration.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><main className={styles.root}>{children}</main></body></html>;
}
