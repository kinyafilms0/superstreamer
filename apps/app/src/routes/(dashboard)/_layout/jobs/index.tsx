import {
  Button,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  Progress,
  Tab,
  Tabs,
} from "@heroui/react";
import { toParams } from "@superstreamer/api/client";
import {
  Link,
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { zodSearchValidator } from "@tanstack/router-zod-adapter";
import { Plus, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { z } from "zod";
import { useApi } from "../../../../api";
import { AutoRefresh } from "../../../../components/AutoRefresh";
import { Form } from "../../../../components/Form";
import { Format } from "../../../../components/Format";
import { FullTable } from "../../../../components/FullTable";
import { JobState } from "../../../../components/JobState";

export const Route = createFileRoute("/(dashboard)/_layout/jobs/")({
  component: RouteComponent,
  validateSearch: zodSearchValidator(
    z.object({
      page: z.coerce.number().default(1),
      perPage: z.coerce.number().default(20),
      sortKey: z.enum(["name", "duration", "createdAt"]).default("createdAt"),
      sortDir: z.enum(["asc", "desc"]).default("desc"),
      query: z.string().default(""),
    }),
  ),
  loaderDeps: ({ search }) => ({ ...search }),
  loader: async ({ deps, context }) => {
    const { api } = context.api;
    const response = await api.jobs.$get({ query: toParams(deps) });
    return {
      jobs: await response.json(),
    };
  },
});

function RouteComponent() {
  const navigate = useNavigate({ from: Route.fullPath });
  const { jobs } = Route.useLoaderData();
  const [isNewJobOpen, setIsNewJobOpen] = useState(false);

  return (
    <div className="p-8">
      <div className="mb-4 flex items-center gap-4">
        <h2 className="font-medium">Jobs</h2>
        <AutoRefresh interval={5} defaultEnabled />
        <Button
          size="sm"
          color="primary"
          startContent={<Plus className="w-4 h-4" />}
          onClick={() => setIsNewJobOpen(true)}
        >
          New Job
        </Button>
      </div>
      <FullTable
        columns={[
          {
            id: "state",
            label: "",
            className: "w-4",
          },
          {
            id: "name",
            label: "Name",
            allowsSorting: true,
          },

          {
            id: "duration",
            label: "Duration",
            allowsSorting: true,
          },
          {
            id: "createdAt",
            label: "Created",
            allowsSorting: true,
          },
        ]}
        totalPages={jobs.totalPages}
        items={jobs.items}
        filter={jobs.filter}
        onFilterChange={(search) => {
          navigate({ search });
        }}
        mapRow={(item) => ({
          key: item.id,
          cells: [
            <JobState key="1" job={item} />,
            <Link key="2" to="/jobs/$id" params={{ id: item.id }}>
              <div className="font-medium">{item.name}</div>
              <Format className="text-xs" format="short-id" value={item.id} />
            </Link>,
            <div key="3" className="flex flex-col gap-1">
              {item.state === "running" && item.progress ? (
                <div className="flex items-center gap-2">
                  <div className="w-20 bg-default-100 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-500 ${item.progress.upload !== undefined ? 'bg-success' : 'bg-primary'}`}
                      style={{ width: `${item.progress.upload ?? item.progress.transcode ?? 0}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-bold">
                    {Math.round(item.progress.upload ?? item.progress.transcode ?? 0)}%
                    {item.progress.upload !== undefined ? ' (UP)' : ''}
                  </span>
                </div>
              ) : (
                <Format format="duration" value={item.duration} />
              )}
            </div>,
            <Format key="4" format="date" value={item.createdAt} />,
          ],
        })}
      />
      <NewJobDrawer
        isOpen={isNewJobOpen}
        onClose={() => setIsNewJobOpen(false)}
      />
    </div>
  );
}

function NewJobDrawer({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { api } = useApi();
  const [activeTab, setActiveTab] = useState("transcode");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");

  const onFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(0);
    try {
      // 1. Get the pre-signed URL from our API
      const apiEndpoint =
        window.__ENV__?.PUBLIC_API_ENDPOINT ?? "http://localhost:3000";
      const token = localStorage.getItem("token")?.replace(/"/g, "");

      const ticketResponse = await fetch(
        `${apiEndpoint}/storage/upload-url?name=${encodeURIComponent(file.name)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const { url: uploadUrl, path: s3Path } = await ticketResponse.json();

      // 2. Upload directly to R2 using XMLHttpRequest for progress tracking
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", file.type || "video/mp4");

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percentComplete = Math.round(
              (event.loaded / event.total) * 100,
            );
            setUploadProgress(percentComplete);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(xhr.response);
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        };

        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.send(file);
      });

      setUrl(s3Path);
    } catch (error) {
      console.error("Direct upload failed", error);
      alert("Direct upload failed. Check R2 CORS settings.");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <Drawer isOpen={isOpen} onClose={onClose} size="lg">
      <DrawerContent>
        <DrawerHeader>New Job</DrawerHeader>
        <DrawerBody>
          <Tabs
            selectedKey={activeTab}
            onSelectionChange={(key) => setActiveTab(key.toString())}
            className="mb-4"
          >
            <Tab key="transcode" title="Full Transcode" />
            <Tab key="package" title="Fast Package" />
          </Tabs>

          <div className="mb-6 p-4 border-2 border-dashed border-default-200 rounded-xl flex flex-col items-center gap-3">
            <Upload className="w-8 h-8 opacity-20" />
            <div className="text-center">
              <p className="text-sm font-medium">Upload MP4 from your computer</p>
              <p className="text-xs opacity-50">File will be saved to R2 /uploads/</p>
            </div>
            <input
              type="file"
              accept="video/mp4"
              className="hidden"
              ref={fileInputRef}
              onChange={onFileUpload}
            />
            <Button
              size="sm"
              variant="flat"
              isLoading={isUploading}
              onClick={() => fileInputRef.current?.click()}
            >
              Select File
            </Button>
            {isUploading && (
              <Progress
                aria-label="Uploading..."
                size="sm"
                value={uploadProgress}
                color="primary"
                showValueLabel={true}
                className="max-w-md mt-2"
              />
            )}
          </div>

          <p className="text-xs opacity-60 mb-4">
            {activeTab === "transcode"
              ? "Multi-quality (1080p, 720p, 480p). Takes longer but ensures smooth playback for all users."
              : "Single stream (1080p). Very fast, perfect if your input is already high quality."}
          </p>

          <Form
            fields={{
              name: {
                type: "string",
                label: "Job Name",
                value: `Job ${new Date().toLocaleString()}`,
              },
              url: {
                type: "string",
                label: "Video URL",
                value: url,
              },
            }}
            onSubmit={async (values) => {
              const streams =
                activeTab === "transcode"
                  ? [
                      {
                        type: "video" as const,
                        codec: "h264" as const,
                        height: 1080,
                      },
                      {
                        type: "video" as const,
                        codec: "h264" as const,
                        height: 720,
                      },
                      {
                        type: "video" as const,
                        codec: "h264" as const,
                        height: 480,
                      },
                      { type: "audio" as const, codec: "aac" as const },
                    ]
                  : [
                      {
                        type: "video" as const,
                        codec: "copy" as any,
                        height: -1,
                      },
                      { type: "audio" as const, codec: "copy" as any },
                    ];

              await api.jobs.pipeline.$post({
                json: {
                  inputs: [{ type: "video", path: values.url }],
                  streams,
                },
              });
              await router.invalidate();
              onClose();
              setUrl(""); // Reset for next time
            }}
            submit={
              activeTab === "transcode" ? "Start Transcode" : "Start Package"
            }
          />
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
