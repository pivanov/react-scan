'use client';

import { createContext, useContext, useState, useCallback } from 'react';

// Create Context with a meaningful name
const CounterContext = createContext<{
  count: number;
  increment: () => void;
  decrement: () => void;
} | null>(null);

// CounterContext.displayName = 'CounterContext';  // Set the display name

// Provider Component
function CounterProvider({ children }: { children: React.ReactNode }) {
  const [count, setCount] = useState(0);

  const value = {
    count,
    increment: useCallback(() => setCount(c => c + 1), []),
    decrement: useCallback(() => setCount(c => c - 1), [])
  };

  return (
    <CounterContext.Provider value={value}>
      {children}
    </CounterContext.Provider>
  );
}

// Counter Display Component - Split to force context usage
function CounterValue() {
  const counterContext = useContext(CounterContext);
  if (!counterContext) throw new Error('Must be used within CounterProvider');

  return <span>{counterContext.count}</span>;
}

function CounterDisplay() {
  return (
    <div className="text-2xl font-bold">
      Count: <CounterValue />
    </div>
  );
}

// Counter Buttons Component - Split for better context tracking
function DecrementButton() {
  const context = useContext(CounterContext);
  if (!context) throw new Error('Must be used within CounterProvider');

  return (
    <button
      onClick={context.decrement}
      className="rounded bg-red-500 px-4 py-2 text-white"
    >
      -
    </button>
  );
}

function IncrementButton() {
  const context = useContext(CounterContext);
  if (!context) throw new Error('Must be used within CounterProvider');

  return (
    <button
      onClick={context.increment}
      className="rounded bg-green-500 px-4 py-2 text-white"
    >
      +
    </button>
  );
}

function CounterButtons() {
  return (
    <div className="flex gap-4">
      <DecrementButton />
      <IncrementButton />
    </div>
  );
}

// Main Demo Component
export default function ContextDemo() {
  return (
    <CounterProvider>
      <div className="flex flex-col items-center gap-4">
        <CounterDisplay />
        <CounterButtons />
      </div>
    </CounterProvider>
  );
}
