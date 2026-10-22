import type { Metadata } from "next";
import { Suspense } from "react";
import { FolderScreen } from "@/components/library/FolderScreen";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = { title: `Тема · ${APP_NAME}` };

/** /library/[id] — a theme by id, or «Входящие» at /library/inbox. Data lives on the device. */
export default function FolderPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<main className="flex flex-1 flex-col" aria-busy="true" />}>
      <FolderRoute params={params} />
    </Suspense>
  );
}

async function FolderRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FolderScreen key={id} id={id} />;
}
