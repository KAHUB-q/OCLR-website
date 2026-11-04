import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tmpdir } from "node:os";
import { randomUUID, createHash } from "node:crypto";
import {
  realpath,
  mkdtemp,
  mkdir,
  writeFile,
  open,
  rename,
  symlink,
  rm,
  readdir,
  stat,
  lstat,
  utimes,
} from "node:fs/promises";
import { join } from "node:path";
import {
  storeReplay,
  readReplay,
  cleanupReplayFiles,
  replayDirectory,
} from "../../src/lib/replay-storage";
import { REPLAY_STORAGE_MAX_BYTES } from "../../src/lib/replay-model";
import { syntheticReplay } from "../fixtures/replay";
vi.mock("node:fs/promises", async (original) => {
  const fs = await original<typeof import("node:fs/promises")>();
  return {
    ...fs,
    lstat: vi.fn(fs.lstat),
    open: vi.fn(fs.open),
    rename: vi.fn(fs.rename),
  };
});
let root: string;
beforeEach(async () => {
  root = await realpath(
    await mkdtemp(join(tmpdir(), "oclr-replay-storage-test-")),
  );
  vi.stubEnv("OCLR_MEDIA_DIR", root);
});
afterEach(async () => {
  const fs =
    await vi.importActual<typeof import("node:fs/promises")>(
      "node:fs/promises",
    );
  vi.mocked(open).mockImplementation(fs.open);
  vi.mocked(rename).mockImplementation(fs.rename);
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
describe("durable private replay storage", () => {
  it.each(["EIO", "EPERM"])(
    "removes only failed post-rename writes when directory sync returns %s",
    async (code) => {
      const bytes = syntheticReplay();
      const saved = randomUUID();
      await storeReplay(saved, bytes);
      const directory = await replayDirectory();
      const fs =
        await vi.importActual<typeof import("node:fs/promises")>(
          "node:fs/promises",
        );
      const failure = Object.assign(
        new Error("Synthetic parent sync failure"),
        { code },
      );
      vi.mocked(open).mockImplementation(async (path, flags, mode) => {
        const handle = await fs.open(path, flags, mode);
        if (path === directory)
          vi.spyOn(handle, "sync").mockRejectedValue(failure);
        return handle;
      });
      for (let attempt = 0; attempt < 2; attempt++)
        await expect(storeReplay(randomUUID(), bytes)).rejects.toBe(failure);
      expect(await readdir(directory)).toEqual([`${saved}.osr`]);
      expect(
        await readReplay(
          saved,
          bytes.length,
          createHash("sha256").update(bytes).digest("hex"),
        ),
      ).toEqual(bytes);
      vi.mocked(open).mockImplementation(fs.open);
      await storeReplay(randomUUID(), bytes);
      expect(await readdir(directory)).toHaveLength(2);
    },
  );

  it("cleans temporary writes and preserves an existing target when rename fails", async () => {
    const bytes = syntheticReplay();
    const saved = randomUUID();
    await storeReplay(saved, bytes);
    const failure = Object.assign(new Error("Synthetic rename failure"), {
      code: "EIO",
    });
    vi.mocked(rename).mockRejectedValueOnce(failure);
    await expect(storeReplay(saved, Buffer.from("replacement"))).rejects.toBe(
      failure,
    );
    expect(await readdir(await replayDirectory())).toEqual([`${saved}.osr`]);
    expect(
      await readReplay(
        saved,
        bytes.length,
        createHash("sha256").update(bytes).digest("hex"),
      ),
    ).toEqual(bytes);
  });
  it("allows an upload when a committed deletion removes a file during quota accounting", async () => {
    const directory = await replayDirectory();
    const deleted = join(directory, randomUUID() + ".osr");
    await writeFile(deleted, "deleted replay");
    const { lstat: actualLstat } =
      await vi.importActual<typeof import("node:fs/promises")>(
        "node:fs/promises",
      );
    vi.mocked(lstat)
      .mockImplementationOnce(actualLstat)
      .mockImplementationOnce(async (path) => {
        await rm(deleted);
        return actualLstat(path);
      });
    const bytes = Buffer.from("new replay"),
      id = randomUUID();
    await storeReplay(id, bytes);
    expect(
      await readReplay(
        id,
        bytes.length,
        createHash("sha256").update(bytes).digest("hex"),
      ),
    ).toEqual(bytes);
    expect(await readdir(directory)).toEqual([id + ".osr"]);
  });
  it("still rejects storage errors other than a concurrently removed file", async () => {
    const directory = await replayDirectory();
    await writeFile(join(directory, randomUUID() + ".osr"), "keep");
    const failure = Object.assign(new Error("Synthetic storage failure"), {
      code: "EACCES",
    });
    const { lstat: actualLstat } =
      await vi.importActual<typeof import("node:fs/promises")>(
        "node:fs/promises",
      );
    vi.mocked(lstat)
      .mockImplementationOnce(actualLstat)
      .mockRejectedValueOnce(failure);
    await expect(storeReplay(randomUUID(), Buffer.from("x"))).rejects.toBe(
      failure,
    );
    expect(await readdir(directory)).toHaveLength(1);
  });
  it("uses generated paths and private permissions, detects changed content and refuses symlink reads", async () => {
    const bytes = Buffer.from("synthetic byte equality fixture"),
      id = randomUUID(),
      sha = createHash("sha256").update(bytes).digest("hex");
    await storeReplay(id, bytes);
    const path = join(root, "replays", id + ".osr");
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect((await stat(join(root, "replays"))).mode & 0o777).toBe(0o700);
    expect(await readReplay(id, bytes.length, sha)).toEqual(bytes);
    await writeFile(path, Buffer.alloc(bytes.length));
    await expect(readReplay(id, bytes.length, sha)).rejects.toMatchObject({
      status: 503,
    });
    await rm(path);
    await writeFile(join(root, "outside.osr"), bytes);
    await symlink(join(root, "outside.osr"), path);
    await expect(readReplay(id, bytes.length, sha)).rejects.toMatchObject({
      status: 503,
    });
  });
  it("counts physical orphans against total capacity before writing a file", async () => {
    await mkdir(join(root, "replays"));
    const file = await open(join(root, "replays", randomUUID() + ".osr"), "w");
    await file.truncate(REPLAY_STORAGE_MAX_BYTES);
    await file.close();
    await expect(
      storeReplay(randomUUID(), Buffer.from("x")),
    ).rejects.toMatchObject({ status: 507 });
    expect(await readdir(join(root, "replays"))).toHaveLength(1);
  });
  it("refuses public/release/symlink roots and keeps referenced/fresh/unknown files during cleanup", async () => {
    vi.stubEnv("OCLR_MEDIA_DIR", join(root, "releases", "media"));
    await expect(replayDirectory()).rejects.toMatchObject({ status: 503 });
    await symlink(root, root + "-link");
    try {
      vi.stubEnv("OCLR_MEDIA_DIR", root + "-link");
      await expect(replayDirectory()).rejects.toMatchObject({ status: 503 });
    } finally {
      await rm(root + "-link");
      vi.stubEnv("OCLR_MEDIA_DIR", root);
    }
    const active = randomUUID(),
      old = randomUUID(),
      fresh = randomUUID();
    for (const id of [active, old, fresh])
      await storeReplay(id, Buffer.from("test"));
    for (const id of [active, old])
      await utimes(
        join(root, "replays", id + ".osr"),
        new Date(0),
        new Date(0),
      );
    await writeFile(join(root, "replays", "unknown.txt"), "keep");
    expect(await cleanupReplayFiles(new Set([active]))).toBe(1);
    expect(await readdir(join(root, "replays"))).toHaveLength(3);
  });
});
