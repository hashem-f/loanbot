import ConversationApp from "./ConversationApp";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const pick = (key: string) => {
    const v = params[key];
    return typeof v === "string" ? v : undefined;
  };

  return (
    <ConversationApp
      trackingParams={{
        brand: pick("brand"),
        campaign: pick("campaign"),
        src: pick("src"),
        click_id: pick("click_id"),
      }}
    />
  );
}
