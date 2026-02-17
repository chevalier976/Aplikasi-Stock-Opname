type BrandBLPProps = {
  className?: string;
  compact?: boolean;
};

export default function BrandBLP({ className = "", compact = false }: BrandBLPProps) {
  return (
    <div className={`inline-flex items-baseline gap-1.5 ${className}`}>
      <span className="font-black tracking-[0.16em] leading-none">BLP</span>
      {!compact && (
        <span className="text-[0.48em] font-semibold tracking-[0.22em] opacity-85 leading-none">
          STOCK
        </span>
      )}
    </div>
  );
}
