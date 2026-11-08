# Product ownership diagram

![Panda ownership](PANDA_PRODUCT_DIAGRAM.svg)

```mermaid
flowchart TD
  subgraph R["Ranveer · Panda web app"]
    RV["Voice, text, AI routing and audio"]
    RT["Proposals and confirmed tools"]
    RV --> RT
  end
  subgraph A["Asmita · Care web app"]
    AP["Source review and approved plans"]
    AT["Tasks, help and clinician acknowledgement"]
    AP --> AT
  end
  subgraph Y["Yuvraj · Rehab web app"]
    YC["Camera, pose and confident rep counting"]
    YS["Sessions and saved reports"]
    YC --> YS
  end
  AP -->|"Approved context"| RV
  AP -->|"Plan and version"| YC
  RT -->|"Task confirmation or help"| AT
  YS -->|"Saved report"| AT
```

Each app owns its UI, API, records and tests. Ranveer also wires the shared public gateway; Asmita maintains shared design tokens. The same-origin product paths are `/`, `/care`, `/rehab`. See OWNERSHIP.md for exact source paths, contracts and remaining workflows.
