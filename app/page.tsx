import PurchasingApp from "./components/PurchasingApp";
import { requireChatGPTUser } from "./chatgpt-auth";
import SessionGuard from "./components/SessionGuard";
export const dynamic = "force-dynamic";
export default async function Home() {
  await requireChatGPTUser("/");
  return <SessionGuard><PurchasingApp /></SessionGuard>;
}
