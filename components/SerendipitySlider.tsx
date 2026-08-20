"use client";

const LABELS: Array<{ max: number; label: string }> = [
  { max: 20, label: "旁边的书架" },
  { max: 40, label: "隔壁过道" },
  { max: 60, label: "穿过楼层" },
  { max: 80, label: "另一栋楼" },
  { max: 100, label: "把我扔进太空" },
];

export function sliderLabel(value: number): string {
  return LABELS.find((l) => value <= l.max)?.label ?? "";
}

export function SerendipitySlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="slider-wrap">
      <div className="slider-label">
        <span>意外度</span>
        <span>{value}</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Serendipity slider"
      />
      <div className="slider-label">
        <span>旁边的书架</span>
        <span>把我扔进太空</span>
      </div>
      <div className="slider-current">当前：{sliderLabel(value)}</div>
    </div>
  );
}
