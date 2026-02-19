"use client";

import { useState, useEffect, useRef } from "react";

export function calcExpr(expr: string): number | null {
  // Normalize: replace x/X/× with *, remove spaces
  const s = expr.replace(/[xX×]/g, "*").replace(/\s+/g, "");
  // Only allow digits, +, -, *, . — reject anything else
  if (!s || !/^[\d+\-*.]+$/.test(s)) return null;
  // Must start & end with digit
  if (!/^\d/.test(s) || !/\d$/.test(s)) return null;
  try {
    // Safe eval: only math operators
    const result = new Function("return (" + s + ")")() as number;
    if (typeof result !== "number" || !isFinite(result)) return null;
    return Math.max(0, Math.round(result));
  } catch { return null; }
}

interface QtyInputProps {
  value: number;
  onChange: (v: number) => void;
  className?: string;
  wide?: boolean;
  onExprCommit?: (expr: string) => void;
}

export default function QtyInput({ value, onChange, className, wide, onExprCommit }: QtyInputProps) {
  const [display, setDisplay] = useState(String(value));
  const [preview, setPreview] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const inputElRef = useState<HTMLInputElement | null>(null);
  // Track whether an expression was already committed (to prevent blur from clearing formula)
  const exprCommittedRef = useRef(false);
  const isExpr = /[+\-*xX×]/.test(display);

  useEffect(() => { setDisplay(String(value)); setPreview(null); }, [value]);

  const handleChange = (raw: string) => {
    // User is actively typing — reset the committed flag
    exprCommittedRef.current = false;
    setDisplay(raw);
    if (/[+\-*xX×]/.test(raw)) {
      const result = calcExpr(raw);
      setPreview(result);
    } else {
      setPreview(null);
      const num = parseInt(raw);
      if (!isNaN(num) && num >= 0) onChange(num);
    }
  };

  const insertOp = (op: string) => {
    // User is inserting operator — reset the committed flag
    exprCommittedRef.current = false;
    const next = display === "0" ? "" : display;
    // Don't add operator if last char is already an operator
    if (/[+\-*xX×]$/.test(next)) {
      const replaced = next.slice(0, -1) + op;
      handleChange(replaced);
    } else {
      handleChange(next + op);
    }
    inputElRef[0]?.focus();
  };

  const commit = () => {
    // If expression was already committed (e.g. via = button), don't process again on blur
    if (exprCommittedRef.current) {
      setFocused(false);
      return;
    }
    if (isExpr) {
      const result = calcExpr(display);
      if (result !== null) {
        // Save the expression before committing
        if (onExprCommit) onExprCommit(display + "=" + result);
        exprCommittedRef.current = true;
        onChange(result);
        setDisplay(String(result));
        setPreview(null);
        setFocused(false);
        return;
      }
    }
    if (display === "" || isNaN(parseInt(display))) {
      setDisplay("0");
      onChange(0);
      if (onExprCommit) onExprCommit("");
    } else {
      // Plain number — clear formula
      if (onExprCommit) onExprCommit("");
    }
    setPreview(null);
    setFocused(false);
  };

  const defaultCls = wide
    ? "w-full h-8 text-center border border-border rounded text-sm font-semibold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
    : "w-14 h-7 text-center border border-border rounded text-xs font-semibold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

  const opBtnCls = wide
    ? "w-10 h-9 rounded-lg bg-gray-100 border border-border text-text-primary text-base font-bold active:bg-primary active:text-white transition select-none"
    : "w-8 h-7 rounded bg-gray-100 text-text-primary text-sm font-bold active:bg-primary active:text-white transition select-none";

  return (
    <div className={`relative inline-flex flex-col items-center gap-0.5 ${wide ? "w-full" : ""}`}>
      <div className={`flex items-center gap-0.5 ${wide ? "w-full" : ""}`}>
        <input
          ref={(el) => { inputElRef[0] = el; }}
          type="text"
          inputMode="numeric"
          value={display}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={(e) => {
            if (display === "0") setDisplay("");
            setFocused(true);
            e.target.select();
          }}
          onBlur={() => { setTimeout(commit, 150); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); (e.target as HTMLInputElement).blur(); } }}
          className={className || defaultCls}
        />
        {wide && focused && (
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={commit}
            className="h-9 px-3 rounded-lg bg-primary text-white text-xs font-semibold whitespace-nowrap active:bg-primary-light transition select-none">=</button>
        )}
      </div>
      {wide && (focused || isExpr) && (
        <div className="flex gap-1 mt-1">
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insertOp("+")} className={opBtnCls}>+</button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insertOp("-")} className={opBtnCls}>−</button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insertOp("x")} className={opBtnCls}>×</button>
        </div>
      )}
      {isExpr && preview !== null && (
        <span className="text-[10px] font-semibold text-primary bg-primary-pale px-1.5 py-0.5 rounded mt-0.5">= {preview}</span>
      )}
    </div>
  );
}
