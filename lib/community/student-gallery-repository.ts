import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type StudentEventGalleryItem = {
  id: string;
  title: string;
  description: string;
  coverUrl: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  locationType: "physical" | "online";
  venueName: string | null;
  address: string | null;
  organizerName: string;
  status: "draft" | "published" | "cancelled" | "completed";
  viewerRsvp: "interested" | "going" | "not_going" | null;
  isOwn: boolean;
  counts: { interested: number; going: number };
};

export type StudentPollGalleryItem = {
  id: string;
  question: string;
  selectionMode: "single" | "multiple";
  maxSelections: number;
  status: "open" | "closed" | "cancelled";
  closesAt: string;
  viewerVoted: boolean;
  totalBallots: number;
  isOwn: boolean;
  options: { id: string; label: string; votes: number | null }[];
};

async function galleryRpc<T>(name: string): Promise<T[]> {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc(name);
  if (error) throw new Error("Community discovery is temporarily unavailable.");
  return (Array.isArray(data) ? data : []) as T[];
}

export const listStudentEventGallery = () => galleryRpc<StudentEventGalleryItem>("community_student_event_gallery");
export const listStudentPollGallery = () => galleryRpc<StudentPollGalleryItem>("community_student_poll_gallery");
