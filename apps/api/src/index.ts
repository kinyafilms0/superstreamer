import { Hono } from "hono";
import { openAPISpecs } from "hono-openapi";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { ApiError } from "./errors";
import { assetsApp } from "./routes/assets";
import { jobsApp } from "./routes/jobs";
import { storageApp } from "./routes/storage";
import { tokenApp } from "./routes/token";
import { userApp } from "./routes/user";

// Import workers and they'll start running immediately.
import "./workers";

// Run migrations on start.
import "./db/migrate";

const app = new Hono()
  .use(cors())
  .use(
    "/storage/upload",
    bodyLimit({
      maxSize: 500 * 1024 * 1024, // 500MB
      onError: (c) => {
        return c.json({ code: "ERR_FILE_TOO_LARGE" }, 413);
      },
    }),
  )
  .route("/token", tokenApp)
  .route("/user", userApp)
  .route("/storage", storageApp)
  .route("/jobs", jobsApp)
  .route("/assets", assetsApp);

app.get(
  "/openapi",
  openAPISpecs(app, {
    documentation: {
      info: {
        title: "Superstreamer API",
        version: "1.0.0",
        description:
          "The Superstreamer API is organized around REST, returns JSON-encoded responses " +
          "and uses standard HTTP response codes and verbs.",
      },
      tags: [
        {
          name: "Jobs",
          description:
            "Handle tasks related to jobs, including video processing and job status monitoring.",
        },
        {
          name: "Assets",
          description: "Inspect assets.",
        },
        {
          name: "Storage",
          description: "Anything related to your configured S3 bucket.",
        },
        {
          name: "User",
          description:
            "Methods related to user actions, including authentication and personal settings updates.",
        },
      ],
      components: {
        securitySchemes: {
          userToken: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
    },
  }),
);

app.onError((error, c) => {
  if (error instanceof ApiError) {
    return c.json(
      {
        code: error.code,
      },
      error.status,
    );
  }

  console.error(error);

  return c.json(
    {
      message:
        "Unexpected error, this is most likely a bug. Please, report it.",
    },
    500,
  );
});

export default app;

export type AppType = typeof app;
