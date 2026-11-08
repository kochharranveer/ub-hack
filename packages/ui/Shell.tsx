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
        <a className="brand" href={app === "care" ? "/care" : "/"}>
          ● panda<span>care</span>
        </a>
        <nav aria-label="Product">
          {app === "panda" ? (
            <>
              <a href="/">Talk to Panda</a>
              <a href="/rehab">Exercise</a>
            </>
          ) : app === "care" ? (
            <>
              <a href="/care">Care plan review</a>
              <a href="/care/portal">Doctor portal</a>
            </>
          ) : (
            <>
              <a href="/">Talk to Panda</a>
              <a href="/care">Care hub</a>
              <a href="/care/portal">Doctor portal</a>
              <a href="/rehab">Exercise</a>
            </>
          )}
        </nav>
        <small>
          {owner} · {app}
        </small>
      </header>
      <div className="notice">
        Synthetic-data starter · Demo identities · Not connected to a healthcare
        provider
      </div>
      <main>{children}</main>
      <footer>
        One product · Three independently runnable apps · Shared contract v2.0.0
      </footer>
    </>
  );
}
