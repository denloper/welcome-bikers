export function asset(path: string): string {
  if (!path || path.startsWith("http") || path.startsWith("data:")) return path;
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`;
}
