import {
  GetObjectCommand,
  ListObjectsCommand,
  PutObjectCommand,
  S3,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../env";

export type StorageFolderItem =
  | {
      type: "file";
      path: string;
      size: number;
    }
  | {
      type: "folder";
      path: string;
    };

export interface StorageFolder {
  cursor?: string;
  items: StorageFolderItem[];
}

const client = new S3({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
});

export async function getStorageFolder(
  path: string,
  take: number,
  cursor?: string,
): Promise<StorageFolder> {
  const trimPath = path.substring(1);
  const response = await client.send(
    new ListObjectsCommand({
      Bucket: env.S3_BUCKET,
      Delimiter: "/",
      Prefix: trimPath,
      MaxKeys: take,
      Marker: cursor,
    }),
  );

  const items: StorageFolderItem[] = [];

  const commonPrefixes = response.CommonPrefixes ?? [];
  for (const prefix of commonPrefixes) {
    if (!prefix.Prefix) {
      continue;
    }
    items.push({
      type: "folder",
      path: `/${prefix.Prefix}`,
    });
  }

  const contents = response.Contents ?? [];
  for (const content of contents) {
    if (!content.Key || content.Key === path) {
      continue;
    }

    items.push({
      type: "file",
      path: `/${content.Key}`,
      size: content.Size ?? 0,
    });
  }

  return {
    cursor: response.IsTruncated ? response.NextMarker : undefined,
    items,
  };
}

export async function getStorageFileUrl(path: string) {
  const trimPath = path.substring(1);
  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: trimPath,
  });
  const url = await getSignedUrl(client, command, {
    expiresIn: 60 * 15,
  });
  return url;
}

export async function getStorageFilePayload(path: string) {
  const trimPath = path.substring(1);
  const command = await client.send(
    new GetObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: trimPath,
    }),
  );
  if (!command.Body) {
    throw new Error("Missing body");
  }
  return await command.Body.transformToString("utf-8");
}

export async function putStorageFile(
  path: string,
  body: Buffer | Blob | Uint8Array,
) {
  const trimPath = path.substring(1);
  await client.putObject({
    Bucket: env.S3_BUCKET,
    Key: trimPath,
    Body: body,
  });
}

export async function getStorageUploadUrl(path: string) {
  const trimPath = path.substring(1);
  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: trimPath,
  });
  return await getSignedUrl(client, command, {
    expiresIn: 3600, // 1 hour for large uploads
  });
}
