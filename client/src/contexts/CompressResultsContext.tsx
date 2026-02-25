import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";
import type { FileCompressionEntry } from "../hooks/useCompressor";

interface CompressResultsContextValue {
  resultsData: FileCompressionEntry[];
  setResultsData: (entries: FileCompressionEntry[]) => void;
  clearResultsData: () => void;
}

const CompressResultsContext = createContext<CompressResultsContextValue | null>(null);

export function CompressResultsProvider({ children }: { children: ReactNode }) {
  const [resultsData, setResultsDataRaw] = useState<FileCompressionEntry[]>([]);

  const setResultsData = useCallback((entries: FileCompressionEntry[]) => {
    setResultsDataRaw(entries);
  }, []);

  const clearResultsData = useCallback(() => {
    setResultsDataRaw([]);
  }, []);

  return (
    <CompressResultsContext.Provider value={{ resultsData, setResultsData, clearResultsData }}>
      {children}
    </CompressResultsContext.Provider>
  );
}

export function useCompressResults() {
  const ctx = useContext(CompressResultsContext);
  if (!ctx) throw new Error("useCompressResults must be used inside CompressResultsProvider");
  return ctx;
}
