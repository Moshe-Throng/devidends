export function DevidendsLogo({
  variant = "dark",
}: {
  variant?: "dark" | "light";
}) {
  const idColor = variant === "dark" ? "#212121" : "#FFFFFF";
  return (
    <span className="inline-flex items-baseline text-[1.65rem] font-bold tracking-tight leading-none select-none">
      <span className="relative">
        <span style={{ color: "#27ABD2" }}>D</span>
        <span style={{ color: "#27ABD2" }}>e</span>
        <span className="relative inline-block" style={{ color: "#27ABD2" }}>
          v
          <svg
            className="absolute -top-[5px] left-1/2 -translate-x-1/2"
            width="6"
            height="6"
            viewBox="0 0 6 6"
            fill="none"
          >
            <circle cx="3" cy="3" r="2.5" fill="#27ABD2" />
          </svg>
        </span>
      </span>
      <span style={{ color: idColor }}>idends</span>
    </span>
  );
}
