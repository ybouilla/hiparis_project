export function handleIntersection({
  entry,
  hasMore,
  isLoading,
  cooldown,
  firstPage,
  loadPage,
}) {
  if (!entry.isIntersecting) return;
  if (!hasMore) return;
  if (isLoading) return;
  if (cooldown) return;
  if (!firstPage || firstPage <= 1) return;

  loadPage(firstPage - 1);
}