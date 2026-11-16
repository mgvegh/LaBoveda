"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Calculator, X, Delete, Copy, Check } from "lucide-react";
import clsx from "clsx";

interface FloatingCalculatorProps {
  isOpen?: boolean;
  onToggle?: (open: boolean) => void;
}

export default function FloatingCalculator({
  isOpen: controlledOpen,
  onToggle: controlledToggle,
}: FloatingCalculatorProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;

  const setOpen = useCallback(
    (val: boolean) => {
      if (isControlled && controlledToggle) {
        controlledToggle(val);
      } else {
        setInternalOpen(val);
      }
    },
    [isControlled, controlledToggle]
  );

  const [display, setDisplay] = useState<string>("0");
  const [equation, setEquation] = useState<string>("");
  const [prevValue, setPrevValue] = useState<number | null>(null);
  const [operation, setOperation] = useState<string | null>(null);
  const [waitingForNewOperand, setWaitingForNewOperand] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const calcRef = useRef<HTMLDivElement>(null);

  // Formatter for display
  const formatDisplay = (numStr: string) => {
    if (numStr === "Error" || numStr === "NaN" || numStr === "Infinity") return "Error";
    const parts = numStr.split(".");
    const integerPart = parts[0];
    const decimalPart = parts.length > 1 ? `.${parts[1]}` : "";

    const parsedInt = parseFloat(integerPart);
    if (isNaN(parsedInt)) return numStr;

    const formattedInt = new Intl.NumberFormat("es-AR", {
      maximumFractionDigits: 0,
    }).format(parsedInt);

    return `${formattedInt}${decimalPart}`;
  };

  const handleDigit = (digit: string) => {
    if (waitingForNewOperand) {
      setDisplay(digit);
      setWaitingForNewOperand(false);
    } else {
      if (display === "0" && digit !== ".") {
        setDisplay(digit);
      } else if (digit === "." && display.includes(".")) {
        return;
      } else {
        if (display.length < 14) {
          setDisplay(display + digit);
        }
      }
    }
  };

  const calculate = (a: number, b: number, op: string): number => {
    switch (op) {
      case "+":
        return a + b;
      case "-":
        return a - b;
      case "×":
      case "*":
        return a * b;
      case "÷":
      case "/":
        return b === 0 ? 0 : a / b;
      default:
        return b;
    }
  };

  const handleOperator = (nextOp: string) => {
    const currentNum = parseFloat(display);

    if (prevValue === null) {
      setPrevValue(currentNum);
      setEquation(`${formatDisplay(display)} ${nextOp}`);
    } else if (operation) {
      if (waitingForNewOperand) {
        // Just change operator
        setOperation(nextOp);
        setEquation(`${formatDisplay(String(prevValue))} ${nextOp}`);
        return;
      }
      const result = calculate(prevValue, currentNum, operation);
      const rounded = Math.round(result * 1000000) / 1000000;
      setPrevValue(rounded);
      setDisplay(String(rounded));
      setEquation(`${formatDisplay(String(rounded))} ${nextOp}`);
    }

    setWaitingForNewOperand(true);
    setOperation(nextOp);
  };

  const handleEquals = () => {
    if (operation === null || prevValue === null) return;

    const currentNum = parseFloat(display);
    const result = calculate(prevValue, currentNum, operation);
    const rounded = Math.round(result * 1000000) / 1000000;

    setEquation(`${formatDisplay(String(prevValue))} ${operation} ${formatDisplay(display)} =`);
    setDisplay(String(rounded));
    setPrevValue(null);
    setOperation(null);
    setWaitingForNewOperand(true);
  };

  const handleClear = () => {
    setDisplay("0");
    setEquation("");
    setPrevValue(null);
    setOperation(null);
    setWaitingForNewOperand(false);
  };

  const handleBackspace = () => {
    if (waitingForNewOperand) return;
    if (display.length === 1 || (display.length === 2 && display.startsWith("-"))) {
      setDisplay("0");
    } else {
      setDisplay(display.slice(0, -1));
    }
  };

  const handlePercentage = () => {
    const currentNum = parseFloat(display);
    if (prevValue !== null && operation) {
      const pctValue = (prevValue * currentNum) / 100;
      setDisplay(String(pctValue));
    } else {
      const val = currentNum / 100;
      setDisplay(String(val));
    }
  };

  const handleToggleSign = () => {
    const currentNum = parseFloat(display);
    if (currentNum !== 0) {
      setDisplay(String(-currentNum));
    }
  };

  const handleCopy = async () => {
    const num = parseFloat(display);
    if (!isNaN(num)) {
      try {
        await navigator.clipboard.writeText(String(num));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error("Clipboard copy error:", err);
      }
    }
  };

  // Keyboard shortcut support
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid intercepting if user is focused on an input outside the calculator
      const activeEl = document.activeElement;
      if (activeEl && activeEl.tagName === "INPUT" && !calcRef.current?.contains(activeEl)) {
        return;
      }

      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === "." || e.key === ",") {
        e.preventDefault();
        handleDigit(".");
      } else if (e.key === "+") {
        e.preventDefault();
        handleOperator("+");
      } else if (e.key === "-") {
        e.preventDefault();
        handleOperator("-");
      } else if (e.key === "*") {
        e.preventDefault();
        handleOperator("×");
      } else if (e.key === "/") {
        e.preventDefault();
        handleOperator("÷");
      } else if (e.key === "Enter" || e.key === "=") {
        e.preventDefault();
        handleEquals();
      } else if (e.key === "Backspace") {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, display, prevValue, operation, waitingForNewOperand, setOpen]); // eslint-disable-line

  return (
    <>
      {/* Floating Toggle Button (Always visible on bottom right) */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 h-10 bg-[#232325] hover:bg-[#2a2a2d] text-[#ededed] px-4 rounded-xl border border-[rgba(237,237,237,0.12)] transition-colors duration-150 cursor-pointer"
          title="Abrir calculadora"
        >
          <Calculator className="w-4 h-4 text-[#d99b43]" strokeWidth={1.5} />
          <span className="text-xs font-medium hidden sm:inline">Calculadora</span>
        </button>
      )}

      {/* Calculator Window */}
      {isOpen && (
        <div
          ref={calcRef}
          className="fixed bottom-6 right-6 z-50 w-[308px] bg-[#19191b] border border-[rgba(237,237,237,0.14)] rounded-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(237,237,237,0.08)] bg-[#141415]">
            <div className="flex items-center gap-2">
              <Calculator className="w-4 h-4 text-[#d99b43]" strokeWidth={1.5} />
              <span className="text-xs font-medium text-[#ededed]">Calculadora</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleCopy}
                className="p-1.5 text-[#85858b] hover:text-[#ededed] rounded-md hover:bg-[#232325] transition-colors cursor-pointer"
                title="Copiar resultado"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-[#4cc38a]" strokeWidth={1.5} /> : <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 text-[#85858b] hover:text-[#ededed] rounded-md hover:bg-[#232325] transition-colors cursor-pointer"
                title="Cerrar calculadora"
              >
                <X className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            </div>
          </div>

          {/* Screen / Display */}
          <div className="p-4 bg-[#0f0f10] border-b border-[rgba(237,237,237,0.08)] flex flex-col justify-end min-h-[88px] select-none">
            <div className="text-xs text-[#85858b] font-mono text-right min-h-[16px] overflow-hidden truncate tabular">
              {equation || "\u00A0"}
            </div>
            <div className="text-3xl font-mono font-medium text-[#ededed] text-right tabular overflow-hidden whitespace-nowrap mt-1">
              {formatDisplay(display)}
            </div>
          </div>

          {/* Keypad */}
          <div className="p-3 grid grid-cols-4 gap-2 bg-[#141415] text-sm">
            {/* Row 1 */}
            <button
              type="button"
              onClick={handleClear}
              className="h-10 rounded-lg bg-[#e5484d]/15 hover:bg-[#e5484d]/25 text-[#e5484d] font-medium transition-colors duration-150 text-xs cursor-pointer"
            >
              AC
            </button>
            <button
              type="button"
              onClick={handleToggleSign}
              className="h-10 rounded-lg bg-[#232325] hover:bg-[#2c2c2f] text-[#a1a1a6] font-medium transition-colors duration-150 cursor-pointer"
            >
              +/-
            </button>
            <button
              type="button"
              onClick={handlePercentage}
              className="h-10 rounded-lg bg-[#232325] hover:bg-[#2c2c2f] text-[#a1a1a6] font-medium transition-colors duration-150 cursor-pointer"
            >
              %
            </button>
            <button
              type="button"
              onClick={() => handleOperator("÷")}
              className={clsx(
                "h-10 rounded-lg font-medium transition-colors duration-150 text-base cursor-pointer",
                operation === "÷" ? "bg-[#d99b43] text-[#141415]" : "bg-[#232325] hover:bg-[#2c2c2f] text-[#d99b43]"
              )}
            >
              ÷
            </button>

            {/* Row 2 */}
            <button type="button" onClick={() => handleDigit("7")} className="h-10 rounded-lg bg-[#19191b] hover:bg-[#232325] border border-[rgba(237,237,237,0.06)] text-[#ededed] font-mono transition-colors duration-150 cursor-pointer">7</button>
            <button type="button" onClick={() => handleDigit("8")} className="h-10 rounded-lg bg-[#19191b] hover:bg-[#232325] border border-[rgba(237,237,237,0.06)] text-[#ededed] font-mono transition-colors duration-150 cursor-pointer">8</button>
            <button type="button" onClick={() => handleDigit("9")} className="h-10 rounded-lg bg-[#19191b] hover:bg-[#232325] border border-[rgba(237,237,237,0.06)] text-[#ededed] font-mono transition-colors duration-150 cursor-pointer">9</button>
            <button
              type="button"
              onClick={() => handleOperator("×")}
              className={clsx(
                "h-10 rounded-lg font-medium transition-colors duration-150 text-base cursor-pointer",
                operation === "×" ? "bg-[#d99b43] text-[#141415]" : "bg-[#232325] hover:bg-[#2c2c2f] text-[#d99b43]"
              )}
            >
              ×
            </button>

            {/* Row 3 */}
            <button type="button" onClick={() => handleDigit("4")} className="h-10 rounded-lg bg-[#19191b] hover:bg-[#232325] border border-[rgba(237,237,237,0.06)] text-[#ededed] font-mono transition-colors duration-150 cursor-pointer">4</button>
            <button type="button" onClick={() => handleDigit("5")} className="h-10 rounded-lg bg-[#19191b] hover:bg-[#232325] border border-[rgba(237,237,237,0.06)] text-[#ededed] font-mono transition-colors duration-150 cursor-pointer">5</button>
            <button type="button" onClick={() => handleDigit("6")} className="h-10 rounded-lg bg-[#19191b] hover:bg-[#232325] border border-[rgba(237,237,237,0.06)] text-[#ededed] font-mono transition-colors duration-150 cursor-pointer">6</button>
            <button
              type="button"
              onClick={() => handleOperator("-")}
              className={clsx(
                "h-10 rounded-lg font-medium transition-colors duration-150 text-base cursor-pointer",
                operation === "-" ? "bg-[#d99b43] text-[#141415]" : "bg-[#232325] hover:bg-[#2c2c2f] text-[#d99b43]"
              )}
            >
              -
            </button>

            {/* Row 4 */}
            <button type="button" onClick={() => handleDigit("1")} className="h-10 rounded-lg bg-[#19191b] hover:bg-[#232325] border border-[rgba(237,237,237,0.06)] text-[#ededed] font-mono transition-colors duration-150 cursor-pointer">1</button>
            <button type="button" onClick={() => handleDigit("2")} className="h-10 rounded-lg bg-[#19191b] hover:bg-[#232325] border border-[rgba(237,237,237,0.06)] text-[#ededed] font-mono transition-colors duration-150 cursor-pointer">2</button>
            <button type="button" onClick={() => handleDigit("3")} className="h-10 rounded-lg bg-[#19191b] hover:bg-[#232325] border border-[rgba(237,237,237,0.06)] text-[#ededed] font-mono transition-colors duration-150 cursor-pointer">3</button>
            <button
              type="button"
              onClick={() => handleOperator("+")}
              className={clsx(
                "h-10 rounded-lg font-medium transition-colors duration-150 text-base cursor-pointer",
                operation === "+" ? "bg-[#d99b43] text-[#141415]" : "bg-[#232325] hover:bg-[#2c2c2f] text-[#d99b43]"
              )}
            >
              +
            </button>

            {/* Row 5 */}
            <button type="button" onClick={() => handleDigit("0")} className="h-10 rounded-lg bg-[#19191b] hover:bg-[#232325] border border-[rgba(237,237,237,0.06)] text-[#ededed] font-mono transition-colors duration-150 cursor-pointer">0</button>
            <button type="button" onClick={() => handleDigit(".")} className="h-10 rounded-lg bg-[#19191b] hover:bg-[#232325] border border-[rgba(237,237,237,0.06)] text-[#ededed] font-mono transition-colors duration-150 cursor-pointer">.</button>
            <button
              type="button"
              onClick={handleBackspace}
              className="h-10 rounded-lg bg-[#19191b] hover:bg-[#232325] border border-[rgba(237,237,237,0.06)] text-[#85858b] hover:text-[#ededed] flex items-center justify-center transition-colors duration-150 cursor-pointer"
              title="Borrar último dígito"
            >
              <Delete className="w-4 h-4" strokeWidth={1.5} />
            </button>
            <button
              type="button"
              onClick={handleEquals}
              className="h-10 rounded-lg bg-[#d99b43] hover:bg-[#e3a852] text-[#141415] font-medium transition-colors duration-150 text-base cursor-pointer"
            >
              =
            </button>
          </div>
        </div>
      )}
    </>
  );
}
