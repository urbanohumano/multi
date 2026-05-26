import { Suspense } from "react";
import SearchExplorer from "@/components/SearchExplorer";

export default function HomePage() {
  return (
    <Suspense fallback={<div className="h-40 bg-gradient-to-br from-brand-500 to-brand-700" />}>
      <SearchExplorer />
    </Suspense>
  );
}
