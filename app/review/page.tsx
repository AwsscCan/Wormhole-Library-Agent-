import { redirect } from "next/navigation";

export default function ReviewPage() {
  redirect("/writing?template=literature_review");
}
