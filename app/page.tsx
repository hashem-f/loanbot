import { redirect } from "next/navigation";

// Real traffic arrives at /c/<token> from the outbound email. A bare visit
// starts a session with a placeholder ref so the flow is testable directly.
export default function HomePage() {
  redirect("/c/direct");
}
