import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { resolver, validator } from "hono-openapi/zod";
import { z } from "zod";
import { apiError } from "../errors";
import { auth } from "../middleware";
import {
  storageFileSchema,
  storageItemsPaginatedSchema,
} from "../schemas/storage";
import {
  getStorageFilePayload,
  getStorageFileUrl,
  getStorageFolder,
  getStorageUploadUrl,
  putStorageFile,
} from "../utils/s3";

export const storageApp = new Hono()
  .use(auth())

  /**
   * Get a list of S3 items.
   */
  .get(
    "/items",
    describeRoute({
      summary: "Get items from storage",
      description:
        "Get items for a path from your S3 storage with all files and subfolders.",
      security: [{ userToken: [] }],
      tags: ["Storage"],
      responses: {
        200: {
          description: "Successful response",
          content: {
            "application/json": {
              schema: resolver(storageItemsPaginatedSchema),
            },
          },
        },
      },
    }),
    validator(
      "query",
      z.object({
        path: z.string(),
        take: z.coerce.number().default(10),
        cursor: z.string().optional(),
      }),
    ),
    async (c) => {
      const { path, take, cursor } = c.req.valid("query");
      const folder = await getStorageFolder(path, take, cursor);
      return c.json(folder, 200);
    },
  )

  /**
   * Get an S3 file.
   */
  .get(
    "/file",
    describeRoute({
      summary: "Get a file",
      description: "Get a file from your S3 storage by path.",
      security: [{ userToken: [] }],
      tags: ["Storage"],
      responses: {
        200: {
          description: "Successful response",
          content: {
            "application/json": {
              schema: resolver(storageFileSchema),
            },
          },
        },
      },
    }),
    validator(
      "query",
      z.object({
        path: z.string(),
      }),
    ),
    async (c) => {
      const { path } = c.req.valid("query");
      const ext = path.split(".").pop();
      switch (ext) {
        case "m4v":
        case "mp4":
        case "mkv":
          return c.json(
            {
              mode: "url",
              url: await getStorageFileUrl(path),
              type: "video",
            },
            200,
          );
        case "m4a":
        case "mp3":
          return c.json(
            {
              mode: "url",
              url: await getStorageFileUrl(path),
              type: "audio",
            },
            200,
          );
        case "m3u8":
        case "json":
        case "vtt":
          return c.json(
            {
              mode: "payload",
              payload: await getStorageFilePayload(path),
            },
            200,
          );
        default:
          throw apiError("ERR_STORAGE_NO_FILE_PREVIEW");
      }
    },
  )
 
  /**
   * Upload a file to S3.
   */
  .post(
    "/upload",
    describeRoute({
      summary: "Upload a file",
      description: "Upload a file directly to your S3 storage.",
      security: [{ userToken: [] }],
      tags: ["Storage"],
    }),
    async (c) => {
      const body = await c.req.formData();
      const file = body.get("file");

      if (!(file instanceof File)) {
        throw apiError("ERR_STORAGE_INVALID_FILE");
      }

      const path = `/uploads/${Date.now()}-${file.name}`;
      const buffer = await file.arrayBuffer();

      await putStorageFile(path, new Uint8Array(buffer));

      return c.json({ path }, 200);
    },
  )

  /**
   * Get a pre-signed URL for direct upload to S3.
   */
  .get(
    "/upload-url",
    describeRoute({
      summary: "Get an upload URL",
      description: "Get a pre-signed URL for direct upload to your S3 storage.",
      security: [{ userToken: [] }],
      tags: ["Storage"],
    }),
    validator(
      "query",
      z.object({
        name: z.string(),
      }),
    ),
    async (c) => {
      const { name } = c.req.valid("query");
      const path = `/uploads/${Date.now()}-${name}`;
      const url = await getStorageUploadUrl(path);

      return c.json({ url, path }, 200);
    },
  );
