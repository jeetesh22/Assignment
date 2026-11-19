import type { Metadata } from "next";
import { SearchInterface } from "@/components/workspace/search-interface";
import { PageHeader } from "@/components/workspace/page-header";

export const metadata: Metadata = { title: "Semantic search" };

export default function SearchPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Explore"
        title="Search by meaning"
        description="Find relevant passages across your documents with a natural-language query."
      />
      <div className="mx-auto max-w-4xl">
        <SearchInterface />
      </div>
    </div>
  );
}
