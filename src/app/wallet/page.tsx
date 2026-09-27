import { requireProfile } from "@/lib/profile";
import { loadWallet } from "@/lib/wallet";
import WalletView from "@/components/wallet/WalletView";

export const dynamic = "force-dynamic";

export default async function WalletPage() {
  const me = await requireProfile();
  const wallet = await loadWallet(me.id);
  return <WalletView initial={wallet} />;
}
