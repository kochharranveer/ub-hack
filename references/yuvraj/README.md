# Yuvraj's untouched upstream reference

`camera-to-text-371198e/source/` is the complete published source tree from `yuvrajdrums/ub-hack`, branch `yuvraj/camera-to-text`, commit `371198efaeb7ac953e8a8c7161daa59706efe321`. No source files were edited. `UPSTREAM.json` records its commit, Git tree/blob IDs, per-file SHA-256 hashes and all published branch heads at retrieval.

`published-branches.bundle` preserves all five fetched Yuvraj branch histories, including the separate Cloudflare/demo and pose-model branches. To inspect an older branch independently, clone that bundle to another folder. It is a reference archive; no hosted deployment is performed by this integration.

Run `npm run verify:yuvraj` from the Panda root to verify that the complete source inventory and every file still match the captured upstream bytes. Run `git bundle list-heads references/yuvraj/published-branches.bundle` to list the archived branches.

All Panda-specific integration belongs outside this folder, in `packages/yuvraj-integration/`, the connected API wrappers and Panda's camera presentation. Do not format, patch, install into, or run code generation inside the reference source. Upstream build notes and runtime prompt files describe Yuvraj's project; they are not instructions to change or deploy Panda.

The original upstream CV test suite currently passes 47 of 48 cases: its camera-attempt assertion still expects deterministic counting, while its new service requires Gemini analysis. The original test is preserved unchanged. Panda’s separate integration suite tests the new behavior.
