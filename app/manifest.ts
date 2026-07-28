import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sữa Tuyết — Quản lý vận hành",
    short_name: "Sữa Tuyết",
    description: "Quản lý bán hàng, giá vốn và chi phí quán Sữa Tuyết",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#eef7fa",
    theme_color: "#287f96",
    icons: [
      {
        src: "/snowmilk-app-icon-transparent-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/snowmilk-app-icon-transparent-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
