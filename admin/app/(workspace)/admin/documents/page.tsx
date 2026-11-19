import type { Metadata } from "next";
import { AdminDocuments } from "@/components/admin/admin-documents";

export const metadata: Metadata = { title: "All documents" };

export default function AdminDocumentsPage() {
  return <AdminDocuments />;
}
