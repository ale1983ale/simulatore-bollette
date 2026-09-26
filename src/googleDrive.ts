import { getAdminSessionToken } from "./adminSecurity";
import { supabaseAnonKey, supabaseUrl } from "./supabase";
import { startGoogleCalendarConnection } from "./googleCalendar";

const GOOGLE_WORKSPACE_ENDPOINT =
  `${supabaseUrl}/functions/v1/google-calendar-oauth`;

export type GoogleDriveArchiveConfig = {
  configured: boolean;
  connected: boolean;
  drive_ready: boolean;
  folder_id?: string | null;
  folder_name?: string | null;
};

export type GoogleDriveItem = {
  id: string;
  name: string;
  mime_type: string;
  is_folder: boolean;
  modified_time: string;
  size: number | null;
  web_view_link: string;
  web_content_link: string;
  icon_link: string;
  thumbnail_link: string;
  can_download: boolean;
  parents: string[];
};

export type GoogleDriveFolderResult = {
  folder: {
    id: string;
    name: string;
    parents: string[];
    web_view_link: string;
  };
  configured_folder: {
    folder_id: string;
    folder_name: string;
  };
  items: GoogleDriveItem[];
};

async function callGoogleDrive(
  action: string,
  payload: Record<string, unknown> = {}
) {
  const sessionToken = await getAdminSessionToken();

  const response = await fetch(GOOGLE_WORKSPACE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify({
      action,
      session_token: sessionToken,
      ...payload,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data?.error ||
        "Errore durante la comunicazione con Google Drive."
    );
  }

  return data;
}

export async function getGoogleDriveArchiveConfig(): Promise<GoogleDriveArchiveConfig> {
  return (await callGoogleDrive("drive_config")) as GoogleDriveArchiveConfig;
}

export async function listGoogleDriveFolder(
  folderId = ""
): Promise<GoogleDriveFolderResult> {
  return (await callGoogleDrive("drive_list_folder", {
    folder_id: folderId,
  })) as GoogleDriveFolderResult;
}

export async function setGoogleDriveArchiveFolder(folderId: string) {
  return callGoogleDrive("drive_set_folder", {
    folder_id: folderId,
  }) as Promise<{ folder_id: string; folder_name: string }>;
}

export async function startGoogleDriveConnection() {
  const returnUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${window.location.pathname}?tab=driveArchive`
      : "";

  return startGoogleCalendarConnection(returnUrl);
}

export async function downloadGoogleDriveFile(
  fileId: string,
  fileName: string
) {
  const sessionToken = await getAdminSessionToken();

  const response = await fetch(GOOGLE_WORKSPACE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify({
      action: "drive_download",
      session_token: sessionToken,
      file_id: fileId,
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      data?.error ||
        "Download Google Drive non riuscito."
    );
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName || "download";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
}
