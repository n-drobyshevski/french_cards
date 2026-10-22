import type { Metadata } from "next";
import { Suspense } from "react";
import { FolderRoute, FolderScreen } from "@/components/library/FolderScreen";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = { title: `Тема · ${APP_NAME}` };

/**
 * /library/[id] — a theme by id, or «Входящие» at /library/inbox. Data lives on the device, so the
 * id is read on the client (useParams): a client navigation renders the page in one frame, and the
 * static shell is the page's frame (header, reserved rows) rather than a blank.
 */
export default function FolderPage() {
  return (
    <Suspense fallback={<FolderScreen id={null} />}>
      <FolderRoute />
    </Suspense>
  );
}
