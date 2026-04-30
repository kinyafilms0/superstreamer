import { Button, Card, CardBody, CardHeader, Progress } from "@heroui/react";
import type { Job } from "@superstreamer/api/client";
import { Copy } from "lucide-react";
import { useMemo } from "react";
import { Format } from "./Format";
import { Logs } from "./Logs";
import { ObjView } from "./ObjView";

interface JobPageProps {
  job: Job;
  logs: string[];
}

export function JobPage({ job, logs }: JobPageProps) {
  return (
    <>
      {job.failedReason ? (
        <Card className="p-4 mx-4 mt-4 text-danger">{job.failedReason}</Card>
      ) : null}
      <div className="flex flex-col w-full p-4 gap-4">
        {job.state === "running" && job.progress ? (
          <div className="flex flex-col gap-4 mb-2">
            {job.progress.transcode !== undefined && (
              <div>
                <span className="text-[10px] font-bold uppercase opacity-50 mb-1 block">
                  Transcoding Progress
                </span>
                <Progress
                  aria-label="Transcoding..."
                  size="md"
                  value={job.progress.transcode}
                  color="primary"
                  showValueLabel={true}
                  className="w-full"
                />
              </div>
            )}
            {job.progress.upload !== undefined && (
              <div>
                <span className="text-[10px] font-bold uppercase opacity-50 mb-1 block">
                  R2 Upload Progress
                </span>
                <Progress
                  aria-label="Uploading to R2..."
                  size="md"
                  value={job.progress.upload}
                  color="success"
                  showValueLabel={true}
                  className="w-full"
                />
              </div>
            )}
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-sm font-medium">Created</span>
            <Format className="block" format="date" value={job.createdAt} />
          </div>
          <div>
            <span className="text-sm font-medium">Duration</span>
            <Format className="block" format="duration" value={job.duration} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-4">
            <Card className="p-0">
              <CardHeader className="p-4">Input</CardHeader>
              <CardBody className="p-4 pt-0">
                <ObjView data={job.inputData} />
              </CardBody>
            </Card>
            <Card className="p-0">
              <CardHeader className="p-4">Output</CardHeader>
              <CardBody className="p-4 pt-0">
                <PlaybackLink job={job} />
                {job.outputData ? <ObjView data={job.outputData} /> : null}
              </CardBody>
            </Card>
          </div>
          <div>
            <Card className="p-0">
              <CardHeader className="p-4">Logs</CardHeader>
              <CardBody className="p-4 pt-0">
                <Logs lines={logs} />
              </CardBody>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}

function PlaybackLink({ job }: { job: Job }) {
  const assetId = useMemo(() => {
    try {
      const input = JSON.parse(job.inputData);
      if (input.assetId) return input.assetId as string;
      const output = job.outputData ? JSON.parse(job.outputData) : {};
      if (output.assetId) return output.assetId as string;
    } catch {
      return undefined;
    }
  }, [job.inputData, job.outputData]);

  if (!assetId) return null;

  const endpoint = (
    window.__ENV__?.PUBLIC_S3_ENDPOINT ??
    import.meta.env.VITE_PUBLIC_S3_ENDPOINT ??
    "https://pub-1f40055d0d024e10aab8d8d5fedf23bc.r2.dev"
  ).replace(/\/$/, "");
  const hlsUrl = `${endpoint}/package/${assetId}/hls/master.m3u8`;

  const copy = () => {
    navigator.clipboard.writeText(hlsUrl);
    alert("HLS URL copied to clipboard!");
  };

  return (
    <div className="mb-4 p-3 bg-primary-50 border border-primary-100 rounded-lg flex items-center justify-between gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-bold uppercase opacity-50">
          Playback URL
        </span>
        <code className="text-xs break-all">{hlsUrl}</code>
      </div>
      <Button size="sm" isIconOnly variant="flat" onClick={copy}>
        <Copy className="w-4 h-4" />
      </Button>
    </div>
  );
}
