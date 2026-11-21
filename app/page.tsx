import PurchasingApp from "./components/PurchasingApp";
import { requireChatGPTUser } from "./chatgpt-auth";
export const dynamic = "force-dynamic";
export default async function Home() {
  await requireChatGPTUser("/");
  return <PurchasingApp />;
}
