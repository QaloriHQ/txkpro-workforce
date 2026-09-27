import { permanentRedirect } from "next/navigation";

export default function AdminDemoRedirect() {
  permanentRedirect("/platform");
}
