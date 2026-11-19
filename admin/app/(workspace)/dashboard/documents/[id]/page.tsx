import type { Metadata } from "next";
import { DocumentDetails } from "@/components/documents/document-details";

export const metadata: Metadata = { title: "Document details" };

export default async function DocumentDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <DocumentDetails id={id} />;
}
