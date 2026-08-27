export type LivestreamStatus = {
  state: "live" | "offline" | "unconfigured";
  recording: boolean;
  checkedAt: string;
  detail: string;
};

export function deriveLivestreamStatus(
  configured: boolean,
  recording: boolean,
  checkedAt = new Date().toISOString(),
): LivestreamStatus {
  if (!configured) {
    return { state: "unconfigured", recording: false, checkedAt, detail: "IDN Live belum dikonfigurasi." };
  }

  return recording
    ? { state: "live", recording: true, checkedAt, detail: "Proses perekaman Theater sedang berjalan." }
    : {
        state: "offline",
        recording: false,
        checkedAt,
        detail: "Tidak ada proses perekaman Theater yang sedang berjalan.",
      };
}
