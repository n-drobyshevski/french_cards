import { Suspense } from "react";
import { ReviewFolderParam } from "@/components/review/ReviewFolderParam";
import { ReviewScreen } from "@/components/review/ReviewScreen";

export default function ReviewPage() {
  return (
    <>
      <Suspense fallback={null}>
        <ReviewFolderParam />
      </Suspense>
      <ReviewScreen />
    </>
  );
}
