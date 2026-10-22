import type { MetadataRoute } from "next";
import { SHARE_TARGET_ACCEPT, SHARE_TARGET_ACTION, SHARE_TARGET_FIELD } from "@/components/pwa/share-target";

// Paper token from app/globals.css (light theme); also the launch screen background.
const PAPER = "#f1f1ee";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Карточки",
    short_name: "Карточки",
    description: "Французские слова на карточках, с подсказками и уровнем сленга.",
    lang: "ru",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: PAPER,
    theme_color: PAPER,
    categories: ["education", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Android: share screenshots straight into the import flow. The service worker (app/sw.ts) handles the POST.
    share_target: {
      action: SHARE_TARGET_ACTION,
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        files: [{ name: SHARE_TARGET_FIELD, accept: [...SHARE_TARGET_ACCEPT] }],
      },
    },
  };
}
