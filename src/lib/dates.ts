function localIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateFromToday(offsetDays = 0): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return localIso(date);
}

export function validDateRange(from: string, to: string): boolean {
  const start = Date.parse(`${from}T12:00:00`);
  const end = Date.parse(`${to}T12:00:00`);
  return Number.isFinite(start) && Number.isFinite(end) && start < end && from >= dateFromToday();
}
