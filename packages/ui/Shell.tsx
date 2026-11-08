import { productionEnabled } from "../platform/production/config";
import { AccountMenu } from "../account-ui/AccountMenu";
export function Shell({
  owner,
  app,
  children,
}: {
  owner: string;
  app: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <header>
        <a className="brand" href="/">
          ● panda<span>care</span>
        </a>
        <nav aria-label="Product">
          <a href="/">Talk to Panda</a>
          <a href="/care">Care hub</a>
          <a href="/rehab">Exercise</a>
        </nav>
        <small>
          {productionEnabled()?<AccountMenu/>:<>{owner} · {app}</>}
        </small>
      </header>
      <div className="notice">
        {productionEnabled()?"Your care plan and reports · Doctor booking is pending":"Synthetic-data starter · Demo identities · Not connected to a healthcare provider"}
      </div>
      <main>{children}</main>
      <footer>
        One product · Three independently runnable apps · Shared contract v{productionEnabled()?"2.1.0":"2.0.0"}
      </footer>
    </>
  );
}
