import { setRequestStatus } from "@/lib/requestActions";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  return setRequestStatus(params.id, "declined");
}
