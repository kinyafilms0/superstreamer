import * as fs from "node:fs/promises";
import type { PartialInput, Stream } from "bolt";
import { getS3SignedUrl } from "./s3";

export async function getBinaryPath(name: string) {
  const isWindows = process.platform === "win32";
  const binaryName = isWindows ? `${name}.exe` : name;

  const direct = `${process.cwd()}/bin/${binaryName}`;
  const directExists = await Bun.file(direct).exists();
  if (directExists) {
    return direct;
  }

  const packagesDir = `${import.meta.path.substring(0, import.meta.path.indexOf("/artisan"))}`;
  const local = `${packagesDir}/artisan/bin/${binaryName}`;
  const localExists = await Bun.file(local).exists();
  if (localExists) {
    return local;
  }

  // Fallback to system PATH
  return name;
}

export async function mapInputToPublicUrl(input: PartialInput) {
  if (input.path.startsWith("s3://")) {
    const path = input.path.substring(5);
    return await getS3SignedUrl(path, 60 * 60 * 24);
  }

  if (input.path.startsWith("/")) {
    return await getS3SignedUrl(input.path.substring(1), 60 * 60 * 24);
  }

  if (input.path.startsWith("http://") || input.path.startsWith("https://")) {
    return input.path;
  }

  throw new Error(`Failed to map input to public URL: "${input.path}"`);
}

export interface MetaStruct {
  version: number;
  streams: Record<string, Stream>;
  segmentSize: number;
}

/**
 * Will fetch meta file when meta.json is found in path.
 * @param path S3 dir
 * @returns
 */
export async function getMetaStruct(path: string): Promise<MetaStruct> {
  const text = await fs.readFile(`${path}/meta.json`, "utf8");
  return JSON.parse(text.toString());
}
