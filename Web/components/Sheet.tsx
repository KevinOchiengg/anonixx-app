"use client";

export default function Sheet({
  title,
  onClose,
  children,
  tall = false,
}: {
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
  tall?: boolean;
}) {
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className={`sheet${tall ? " tall" : ""}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        {title ? <h3>{title}</h3> : null}
        {children}
      </div>
    </div>
  );
}
