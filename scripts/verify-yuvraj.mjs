import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
const root = new URL(
  "../references/yuvraj/camera-to-text-371198e/",
  import.meta.url,
);
const manifest = JSON.parse(
  await readFile(new URL("UPSTREAM.json", root), "utf8"),
);
let found = [];
async function walk(dir, prefix = "") {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const name = prefix + item.name;
    if (item.isDirectory())
      await walk(new URL(item.name + "/", dir), name + "/");
    else {
      if (!item.isFile())
        throw Error("Unexpected non-file in reference: " + name);
      found.push(name);
    }
  }
}
await walk(new URL("source/", root));
const expected = new Set(manifest.files.map((item) => item.path));
if (found.length !== expected.size || found.some((name) => !expected.has(name)))
  throw Error("Upstream reference file inventory changed");
for (const item of manifest.files) {
  const bytes = await readFile(new URL("source/" + item.path, root));
  if (createHash("sha256").update(bytes).digest("hex") !== item.sha256)
    throw Error("Upstream reference changed: " + item.path);
}
console.log(
  `Verified ${manifest.files.length} untouched upstream files at ${manifest.commit}.`,
);

const bundle = JSON.parse(
  await readFile(new URL("../BUNDLE.json", root), "utf8"),
);
const archive = await readFile(new URL("../" + bundle.file, root));
if (createHash("sha256").update(archive).digest("hex") !== bundle.sha256)
  throw Error("Archived branch bundle changed");
console.log("Verified untouched published-branch archive.");
