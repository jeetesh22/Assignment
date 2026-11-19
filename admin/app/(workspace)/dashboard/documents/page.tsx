import type { Metadata } from "next";
import { DocumentsDashboard } from "@/components/documents/documents-dashboard";

export const metadata: Metadata = { title: "Documents" };

export default function DocumentsPage() {
  return <DocumentsDashboard />;
}
