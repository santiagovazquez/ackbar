export function formatDuration(date: string) {
  const elapsed = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 1000));
  if (elapsed < 60) return "hace unos segundos";

  const units = [
    { seconds: 86400, name: "día" },
    { seconds: 3600, name: "hora" },
    { seconds: 60, name: "minuto" },
  ];
  const unit = units.find(({ seconds }) => elapsed >= seconds)!;
  const value = Math.floor(elapsed / unit.seconds);

  return `hace ${value} ${unit.name}${value === 1 ? "" : "s"}`;
}
