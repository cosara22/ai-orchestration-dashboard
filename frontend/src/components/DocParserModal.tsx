"use client";

import React, { useState, useCallback } from "react";
import { api, ParseResult, WBSSuggestion } from "@/lib/api";

interface DocParserModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  onWbsItemsAdded?: () => void;
}

interface ParsedFile {
  path: string;
  result: ParseResult | null;
  loading: boolean;
  error: string | null;
}

export function DocParserModal({ isOpen, onClose, projectId, onWbsItemsAdded }: DocParserModalProps) {
  const [files, setFiles] = useState<ParsedFile[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanPath, setScanPath] = useState("");
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);

  const [manualPath, setManualPath] = useState("");

  const handleParseFile = useCallback(async () => {
    if (!manualPath.trim()) return;

    const filePath = manualPath.trim();
    const parsedFile: ParsedFile = {
      path: filePath,
      result: null,
      loading: true,
      error: null,
    };

    setFiles((prev) => [...prev, parsedFile]);
    setManualPath("");

    try {
      const result = await api.parseDocument(projectId, filePath);
      setFiles((prev) =>
        prev.map((f) =>
          f.path === filePath ? { ...f, result, loading: false } : f
        )
      );
    } catch (error) {
      setFiles((prev) =>
        prev.map((f) =>
          f.path === filePath
            ? { ...f, loading: false, error: String(error) }
            : f
        )
      );
    }
  }, [manualPath, projectId]);

  const handleScanDirectory = useCallback(async () => {
    if (!scanPath.trim()) return;
    setScanning(true);

    try {
      const scanResult = await api.scanDocuments(projectId, scanPath);

      // Parse each found document
      for (const doc of scanResult.documents) {
        const parsedFile: ParsedFile = {
          path: doc.path,
          result: null,
          loading: true,
          error: null,
        };
        setFiles((prev) => [...prev, parsedFile]);

        try {
          const parseResult = await api.parseDocument(projectId, doc.path);
          setFiles((prev) =>
            prev.map((f) =>
              f.path === doc.path ? { ...f, result: parseResult, loading: false } : f
            )
          );
        } catch (error) {
          setFiles((prev) =>
            prev.map((f) =>
              f.path === doc.path
                ? { ...f, loading: false, error: String(error) }
                : f
            )
          );
        }
      }
    } catch (error) {
      console.error("Scan error:", error);
    } finally {
      setScanning(false);
    }
  }, [scanPath, projectId]);

  const toggleSuggestion = useCallback((id: string) => {
    setSelectedSuggestions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAllSuggestions = useCallback(() => {
    const allIds = new Set<string>();
    files.forEach((f) => {
      f.result?.suggestions?.forEach((s) => {
        allIds.add(`${f.path}-${s.title}`);
      });
    });
    setSelectedSuggestions(allIds);
  }, [files]);

  const clearSelection = useCallback(() => {
    setSelectedSuggestions(new Set());
  }, []);

  const handleApply = useCallback(async () => {
    if (selectedSuggestions.size === 0) return;
    setApplying(true);

    try {
      // Collect selected suggestions
      const suggestionsToApply: WBSSuggestion[] = [];
      files.forEach((f) => {
        f.result?.suggestions?.forEach((s) => {
          if (selectedSuggestions.has(`${f.path}-${s.title}`)) {
            suggestionsToApply.push(s);
          }
        });
      });

      // Apply via API
      const docId = files.find((f) => f.result?.document?.id)?.result?.document?.id;
      if (docId) {
        await api.applyWbsSuggestions(docId, suggestionsToApply, projectId);
      }

      onWbsItemsAdded?.();
      onClose();
    } catch (error) {
      console.error("Apply error:", error);
    } finally {
      setApplying(false);
    }
  }, [selectedSuggestions, files, projectId, onWbsItemsAdded, onClose]);

  const getDocTypeLabel = (type: string) => {
    switch (type) {
      case "PRJ":
        return "企画書";
      case "REQ":
        return "要件定義書";
      case "DES":
        return "設計書";
      default:
        return type;
    }
  };

  const getDocTypeColor = (type: string) => {
    switch (type) {
      case "PRJ":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
      case "REQ":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
      case "DES":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300";
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            ドキュメント解析 - WBS自動生成
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* File Input Section */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              ドキュメントパスを指定
            </h3>

            {/* Single File Path */}
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={manualPath}
                onChange={(e) => setManualPath(e.target.value)}
                placeholder="ファイルパスを入力 (例: ./docs/PRJ_計画書.md)"
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              />
              <button
                onClick={handleParseFile}
                disabled={!manualPath.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                解析
              </button>
            </div>

            {/* Directory Scan */}
            <div className="mt-4 flex gap-2">
              <input
                type="text"
                value={scanPath}
                onChange={(e) => setScanPath(e.target.value)}
                placeholder="ディレクトリパスを入力 (例: ./docs)"
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              />
              <button
                onClick={handleScanDirectory}
                disabled={scanning || !scanPath.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {scanning ? "スキャン中..." : "スキャン"}
              </button>
            </div>
          </div>

          {/* Parsed Files */}
          {files.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  解析結果 ({files.length}件)
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={selectAllSuggestions}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    すべて選択
                  </button>
                  <button
                    onClick={clearSelection}
                    className="text-xs text-gray-600 dark:text-gray-400 hover:underline"
                  >
                    選択解除
                  </button>
                </div>
              </div>

              {files.map((file, idx) => (
                <div
                  key={idx}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                >
                  {/* File Header */}
                  <div className="bg-gray-50 dark:bg-gray-700/50 px-4 py-2 flex items-center gap-2">
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {file.path}
                    </span>
                    {file.loading && (
                      <span className="text-xs text-blue-600 dark:text-blue-400">解析中...</span>
                    )}
                    {file.result?.document?.doc_type && (
                      <span className={`text-xs px-2 py-0.5 rounded ${getDocTypeColor(file.result.document.doc_type)}`}>
                        {getDocTypeLabel(file.result.document.doc_type)}
                      </span>
                    )}
                  </div>

                  {/* Error */}
                  {file.error && (
                    <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
                      {file.error}
                    </div>
                  )}

                  {/* Suggestions */}
                  {file.result?.suggestions && file.result.suggestions.length > 0 && (
                    <div className="p-4">
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                        {file.result.suggestions.length}件のWBS項目を検出
                      </div>
                      <div className="space-y-2">
                        {file.result.suggestions.map((suggestion, sIdx) => {
                          const id = `${file.path}-${suggestion.title}`;
                          const isSelected = selectedSuggestions.has(id);
                          return (
                            <label
                              key={sIdx}
                              className={`flex items-start gap-3 p-2 rounded cursor-pointer transition-colors ${
                                isSelected
                                  ? "bg-blue-50 dark:bg-blue-900/20"
                                  : "hover:bg-gray-50 dark:hover:bg-gray-700/50"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSuggestion(id)}
                                className="mt-1"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                                    {suggestion.title}
                                  </span>
                                  <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
                                    {suggestion.item_type}
                                  </span>
                                </div>
                                {suggestion.description && (
                                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">
                                    {suggestion.description}
                                  </p>
                                )}
                                <div className="flex items-center gap-4 mt-1 text-xs text-gray-500 dark:text-gray-500">
                                  {suggestion.estimated_hours && (
                                    <span>見積: {suggestion.estimated_hours}h</span>
                                  )}
                                  <span>信頼度: {Math.round(suggestion.confidence * 100)}%</span>
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* No Suggestions */}
                  {file.result && (!file.result.suggestions || file.result.suggestions.length === 0) && (
                    <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      WBS項目が検出されませんでした
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Empty State */}
          {files.length === 0 && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <svg className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p>企画書・要件定義書・設計書のMarkdownファイルを選択してください</p>
              <p className="text-xs mt-2">対応形式: PRJ_*.md, REQ_*.md, DES_*.md</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {selectedSuggestions.size}件選択中
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              キャンセル
            </button>
            <button
              onClick={handleApply}
              disabled={selectedSuggestions.size === 0 || applying}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {applying ? "適用中..." : `${selectedSuggestions.size}件をWBSに追加`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
