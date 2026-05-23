import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface SaveJsonParams {
  baseDir: string;
  relativeDir: string;
  baseName: string;
  timestamp: string;
  data: unknown;
}

export function resolveOutputRoot(outputDir: string | undefined): string {
  if (outputDir && outputDir.trim().length > 0) {
    return path.resolve(outputDir);
  }

  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(moduleDir, "../../..");
  return path.join(repoRoot, "data", "gsc");
}

export async function saveJson(params: SaveJsonParams): Promise<string> {
  const targetDir = path.join(params.baseDir, params.relativeDir);
  await mkdir(targetDir, { recursive: true });

  const safeTimestamp = params.timestamp.replace(/[:.]/g, "-");
  const fileName = `${params.baseName}-${safeTimestamp}.json`;
  const filePath = path.join(targetDir, fileName);

  await writeFile(filePath, JSON.stringify(params.data, null, 2), "utf-8");
  return filePath;
}
