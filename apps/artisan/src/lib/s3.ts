import { exists, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  S3,
  paginateListObjectsV2,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ConfiguredRetryStrategy } from "@smithy/util-retry";
import { Glob } from "bun";
import { lookup } from "mime-types";
import { assert } from "../assert";
import { env } from "../env";

const retryStrategy = new ConfiguredRetryStrategy(
  5,
  (attempt) => attempt ** 2 * 1000,
);

const client = new S3({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
  retryStrategy,
});

export async function s3UploadFile(
  localPath: string,
  remotePath: string,
  options: {
    public: boolean;
    onProgress?: (progress: number) => void;
  },
) {
  const upload = new Upload({
    client,
    params: {
      Body: Bun.file(localPath).stream(),
      ContentType: lookup(localPath) || "binary/octet-stream",
      Bucket: env.S3_BUCKET,
      Key: remotePath,
    },
  });

  if (options.onProgress) {
    upload.on("httpUploadProgress", (progress) => {
      if (progress.loaded && progress.total) {
        options.onProgress?.(
          Math.round((progress.loaded / progress.total) * 100),
        );
      }
    });
  }

  await upload.done();
}

async function s3DownloadFile(remotePath: string, localPath: string) {
  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: remotePath,
  });

  const { Body } = await client.send(command);
  assert(Body);

  await writeFile(localPath, Body.transformToWebStream());
}

export async function s3DownloadFolder(
  remotePath: string,
  localPath: string,
  // @ts-expect-error We do not use this for now
  options: {
    concurrency: number;
  },
) {
  const paginatedListObjects = paginateListObjectsV2(
    { client },
    {
      Bucket: env.S3_BUCKET,
      Prefix: remotePath,
    },
  );

  const filePaths: string[] = [];

  for await (const data of paginatedListObjects) {
    const contents = data.Contents ?? [];
    for (const content of contents) {
      if (content.Key) {
        filePaths.push(content.Key);
      }
    }
  }

  for (const filePath of filePaths) {
    const localFilePath = join(
      localPath,
      filePath.substring(remotePath.length + 1),
    );

    const localFilePathDir = dirname(localFilePath);
    const folderExists = await exists(localFilePathDir);
    if (!folderExists) {
      await mkdir(localFilePathDir, { recursive: true });
    }

    await s3DownloadFile(filePath, localFilePath);
  }
}

export async function s3UploadFolder(
  localPath: string,
  remotePath: string,
  options: {
    public: boolean;
    concurrency: number;
    onProgress?: (progress: number) => void;
  },
) {
  await s3DeleteFolder(remotePath);

  const glob = new Glob("**/*");

  const files: string[] = [];
  for await (const file of glob.scan(localPath)) {
    files.push(file);
  }

  let uploaded = 0;
  const concurrency = options.concurrency ?? 10;
  const chunks = [];

  for (let i = 0; i < files.length; i += concurrency) {
    chunks.push(files.slice(i, i + concurrency));
  }

  for (const chunk of chunks) {
    await Promise.all(
      chunk.map(async (file) => {
        await s3UploadFile(`${localPath}/${file}`, `${remotePath}/${file}`, {
          public: options.public,
        });
        uploaded++;
        options.onProgress?.(Math.round((uploaded / files.length) * 100));
      }),
    );
  }
}

export async function s3UploadJson(data: object, remotePath: string) {
  const upload = new Upload({
    client,
    params: {
      Body: JSON.stringify(data, null, 2),
      ContentType: "application/json",
      Bucket: env.S3_BUCKET,
      Key: remotePath,
    },
  });
  await upload.done();
}

async function s3DeleteFolder(remotePath: string) {
  const paginatedListObjects = paginateListObjectsV2(
    { client },
    {
      Bucket: env.S3_BUCKET,
      Prefix: remotePath,
    },
  );

  const filePaths: string[] = [];

  for await (const data of paginatedListObjects) {
    const contents = data.Contents ?? [];
    for (const content of contents) {
      if (content.Key) {
        filePaths.push(content.Key);
      }
    }
  }

  const concurrency = 20;
  const chunks = [];
  for (let i = 0; i < filePaths.length; i += concurrency) {
    chunks.push(filePaths.slice(i, i + concurrency));
  }

  for (const chunk of chunks) {
    await Promise.all(
      chunk.map(async (filePath) => {
        const command = new DeleteObjectCommand({
          Bucket: env.S3_BUCKET,
          Key: filePath,
        });
        await client.send(command);
      }),
    );
  }
}

export async function getS3SignedUrl(
  remoteFilePath: string,
  expiresIn: number,
) {
  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: remoteFilePath,
  });
  const url = await getSignedUrl(client, command, {
    expiresIn,
  });
  return url;
}
