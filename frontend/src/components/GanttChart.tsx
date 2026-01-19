"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { WBSItem, WBSDependency } from "@/lib/api";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useTheme } from "./ThemeProvider";

interface GanttChartProps {
  items: WBSItem[];
  dependencies: WBSDependency[];
  criticalChain: string[];
  onItemClick?: (item: WBSItem) => void;
  onScheduleChange?: (itemId: string, start: Date, end: Date) => void;
}

interface DragState {
  itemId: string;
  type: "move" | "resize-start" | "resize-end";
  startX: number;
  originalStart: Date;
  originalEnd: Date;
}

interface GanttItem {
  id: string;
  code: string;
  title: string;
  start: Date;
  end: Date;
  progress: number;
  status: string;
  isCritical: boolean;
  level: number;
  parentId: string | null;
  children: string[];
}

type ViewMode = "day" | "week" | "month";

const STATUS_COLORS: Record<string, string> = {
  pending: "#6b7280",
  in_progress: "#3b82f6",
  completed: "#22c55e",
  blocked: "#ef4444",
};

const CRITICAL_COLOR = "#f97316";

export function GanttChart({
  items,
  dependencies,
  criticalChain,
  onItemClick,
  onScheduleChange,
}: GanttChartProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  // Theme-aware colors
  const colors = useMemo(() => ({
    background: isDark ? "#0f172a" : "#ffffff",
    headerBg: isDark ? "#1e293b" : "#f1f5f9",
    labelBg: isDark ? "#111827" : "#f8fafc",
    weekendBg: isDark ? "#374151" : "#e2e8f0",
    gridLine: isDark ? "#374151" : "#cbd5e1",
    textPrimary: isDark ? "#f3f4f6" : "#1e293b",
    textSecondary: isDark ? "#9ca3af" : "#64748b",
    hoverBg: isDark ? "#374151" : "#e2e8f0",
    tooltipBg: isDark ? "#1f2937" : "#ffffff",
    tooltipBorder: isDark ? "#374151" : "#e2e8f0",
    selectBg: isDark ? "bg-gray-800" : "bg-white",
    selectBorder: isDark ? "border-gray-600" : "border-gray-300",
    selectText: isDark ? "text-gray-100" : "text-gray-900",
  }), [isDark]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [scrollOffset, setScrollOffset] = useState(0);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragPreview, setDragPreview] = useState<{ start: Date; end: Date } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Convert WBS items to Gantt format
  const ganttItems = useMemo(() => {
    const now = new Date();
    const itemMap = new Map<string, GanttItem>();

    // First pass: create all items
    items.forEach((item) => {
      const duration = item.estimated_duration || 8; // Default 8 hours = 1 day
      const start = item.planned_start
        ? new Date(item.planned_start)
        : new Date(now.getTime() + itemMap.size * 24 * 60 * 60 * 1000);
      const end = item.planned_end
        ? new Date(item.planned_end)
        : new Date(start.getTime() + (duration / 8) * 24 * 60 * 60 * 1000);

      let progress = 0;
      if (item.status === "completed") progress = 100;
      else if (item.status === "in_progress") progress = 50;

      const level = item.code.split(".").length - 1;

      itemMap.set(item.wbs_id, {
        id: item.wbs_id,
        code: item.code,
        title: item.title,
        start,
        end,
        progress,
        status: item.status,
        isCritical: criticalChain.includes(item.wbs_id),
        level,
        parentId: item.parent_id,
        children: [],
      });
    });

    // Second pass: build parent-child relationships
    itemMap.forEach((item) => {
      if (item.parentId && itemMap.has(item.parentId)) {
        itemMap.get(item.parentId)!.children.push(item.id);
      }
    });

    return itemMap;
  }, [items, criticalChain]);

  // Get visible items (considering expanded/collapsed state)
  const visibleItems = useMemo(() => {
    const result: GanttItem[] = [];
    const rootItems = Array.from(ganttItems.values()).filter(
      (item) => !item.parentId || !ganttItems.has(item.parentId)
    );

    const addItemAndChildren = (item: GanttItem) => {
      result.push(item);
      if (expandedItems.has(item.id) || item.children.length === 0) {
        item.children.forEach((childId) => {
          const child = ganttItems.get(childId);
          if (child) addItemAndChildren(child);
        });
      }
    };

    rootItems
      .sort((a, b) => a.code.localeCompare(b.code))
      .forEach(addItemAndChildren);

    return result;
  }, [ganttItems, expandedItems]);

  // Calculate date range
  const { minDate, maxDate, totalDays } = useMemo(() => {
    if (visibleItems.length === 0) {
      const now = new Date();
      return {
        minDate: now,
        maxDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        totalDays: 30,
      };
    }

    let min = visibleItems[0].start;
    let max = visibleItems[0].end;

    visibleItems.forEach((item) => {
      if (item.start < min) min = item.start;
      if (item.end > max) max = item.end;
    });

    // Add padding
    const padding = 7 * 24 * 60 * 60 * 1000; // 7 days
    min = new Date(min.getTime() - padding);
    max = new Date(max.getTime() + padding);

    const days = Math.ceil((max.getTime() - min.getTime()) / (24 * 60 * 60 * 1000));

    return { minDate: min, maxDate: max, totalDays: days };
  }, [visibleItems]);

  // Chart dimensions
  const rowHeight = 36;
  const headerHeight = 50;
  const labelWidth = 200;
  const dayWidth = viewMode === "day" ? 40 : viewMode === "week" ? 20 : 6;
  const chartWidth = totalDays * dayWidth;
  const chartHeight = visibleItems.length * rowHeight + headerHeight;

  // Date helpers
  const dateToX = useCallback(
    (date: Date) => {
      const diff = date.getTime() - minDate.getTime();
      const days = diff / (24 * 60 * 60 * 1000);
      return labelWidth + days * dayWidth - scrollOffset;
    },
    [minDate, dayWidth, scrollOffset]
  );

  const xToDate = useCallback(
    (x: number) => {
      const days = (x - labelWidth + scrollOffset) / dayWidth;
      return new Date(minDate.getTime() + days * 24 * 60 * 60 * 1000);
    },
    [minDate, dayWidth, scrollOffset]
  );

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
  };

  // Drag & Drop handlers
  const handleDragStart = useCallback(
    (e: React.MouseEvent, item: GanttItem, type: DragState["type"]) => {
      e.preventDefault();
      e.stopPropagation();
      setDragState({
        itemId: item.id,
        type,
        startX: e.clientX,
        originalStart: item.start,
        originalEnd: item.end,
      });
      setDragPreview({ start: item.start, end: item.end });
    },
    []
  );

  const handleDragMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragState) return;

      const deltaX = e.clientX - dragState.startX;
      const deltaDays = deltaX / dayWidth;
      const deltaMs = deltaDays * 24 * 60 * 60 * 1000;

      let newStart = dragState.originalStart;
      let newEnd = dragState.originalEnd;

      if (dragState.type === "move") {
        newStart = new Date(dragState.originalStart.getTime() + deltaMs);
        newEnd = new Date(dragState.originalEnd.getTime() + deltaMs);
      } else if (dragState.type === "resize-start") {
        newStart = new Date(dragState.originalStart.getTime() + deltaMs);
        if (newStart >= newEnd) {
          newStart = new Date(newEnd.getTime() - 24 * 60 * 60 * 1000);
        }
      } else if (dragState.type === "resize-end") {
        newEnd = new Date(dragState.originalEnd.getTime() + deltaMs);
        if (newEnd <= newStart) {
          newEnd = new Date(newStart.getTime() + 24 * 60 * 60 * 1000);
        }
      }

      setDragPreview({ start: newStart, end: newEnd });
    },
    [dragState, dayWidth]
  );

  const handleDragEnd = useCallback(() => {
    if (dragState && dragPreview && onScheduleChange) {
      onScheduleChange(dragState.itemId, dragPreview.start, dragPreview.end);
    }
    setDragState(null);
    setDragPreview(null);
  }, [dragState, dragPreview, onScheduleChange]);

  // Add global mouse event listeners for drag
  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragState.startX;
      const deltaDays = deltaX / dayWidth;
      const deltaMs = deltaDays * 24 * 60 * 60 * 1000;

      let newStart = dragState.originalStart;
      let newEnd = dragState.originalEnd;

      if (dragState.type === "move") {
        newStart = new Date(dragState.originalStart.getTime() + deltaMs);
        newEnd = new Date(dragState.originalEnd.getTime() + deltaMs);
      } else if (dragState.type === "resize-start") {
        newStart = new Date(dragState.originalStart.getTime() + deltaMs);
        if (newStart >= newEnd) {
          newStart = new Date(newEnd.getTime() - 24 * 60 * 60 * 1000);
        }
      } else if (dragState.type === "resize-end") {
        newEnd = new Date(dragState.originalEnd.getTime() + deltaMs);
        if (newEnd <= newStart) {
          newEnd = new Date(newStart.getTime() + 24 * 60 * 60 * 1000);
        }
      }

      setDragPreview({ start: newStart, end: newEnd });
    };

    const handleMouseUp = () => {
      if (dragState && dragPreview && onScheduleChange) {
        onScheduleChange(dragState.itemId, dragPreview.start, dragPreview.end);
      }
      setDragState(null);
      setDragPreview(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragState, dayWidth, onScheduleChange, dragPreview]);

  // Generate date headers
  const dateHeaders = useMemo(() => {
    const headers: { date: Date; label: string; isWeekend: boolean }[] = [];
    const current = new Date(minDate);

    while (current <= maxDate) {
      const isWeekend = current.getDay() === 0 || current.getDay() === 6;
      let label = "";

      if (viewMode === "day") {
        label = current.getDate().toString();
      } else if (viewMode === "week") {
        if (current.getDay() === 1 || current.getDate() === 1) {
          label = formatDate(current);
        }
      } else {
        if (current.getDate() === 1) {
          label = current.toLocaleDateString("ja-JP", { month: "short" });
        }
      }

      headers.push({ date: new Date(current), label, isWeekend });
      current.setDate(current.getDate() + 1);
    }

    return headers;
  }, [minDate, maxDate, viewMode]);

  // Toggle expand/collapse
  const toggleExpand = (itemId: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  // Scroll handlers
  const scrollLeft = () => setScrollOffset((prev) => Math.max(0, prev - 200));
  const scrollRight = () =>
    setScrollOffset((prev) => Math.min(chartWidth - 600, prev + 200));

  // Render dependency arrows
  const renderDependencies = () => {
    return dependencies.map((dep) => {
      const predItem = ganttItems.get(dep.predecessor_id);
      const succItem = ganttItems.get(dep.successor_id);

      if (!predItem || !succItem) return null;

      const predIndex = visibleItems.findIndex((i) => i.id === predItem.id);
      const succIndex = visibleItems.findIndex((i) => i.id === succItem.id);

      if (predIndex === -1 || succIndex === -1) return null;

      const x1 = dateToX(predItem.end);
      const y1 = headerHeight + predIndex * rowHeight + rowHeight / 2;
      const x2 = dateToX(succItem.start);
      const y2 = headerHeight + succIndex * rowHeight + rowHeight / 2;

      // Draw arrow path
      const midX = (x1 + x2) / 2;

      return (
        <g key={dep.dependency_id}>
          <path
            d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
            fill="none"
            stroke={predItem.isCritical && succItem.isCritical ? CRITICAL_COLOR : "#6b7280"}
            strokeWidth={1.5}
            strokeDasharray={predItem.isCritical && succItem.isCritical ? "none" : "4,2"}
            opacity={0.6}
          />
          <polygon
            points={`${x2},${y2} ${x2 - 6},${y2 - 4} ${x2 - 6},${y2 + 4}`}
            fill={predItem.isCritical && succItem.isCritical ? CRITICAL_COLOR : "#6b7280"}
            opacity={0.6}
          />
        </g>
      );
    });
  };

  return (
    <div className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-primary)]">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-3 border-b border-[var(--border-primary)]">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-blue-400" />
          <h3 className="font-semibold text-[var(--text-primary)]">Gantt Chart</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={scrollLeft}
            className="p-1.5 hover:bg-[var(--bg-tertiary)] rounded text-[var(--text-secondary)]"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={scrollRight}
            className="p-1.5 hover:bg-[var(--bg-tertiary)] rounded text-[var(--text-secondary)]"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <div className="h-4 w-px bg-[var(--border-primary)] mx-1" />
          <select
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as ViewMode)}
            className={`px-2 py-1 text-xs rounded border ${colors.selectBorder} ${colors.selectBg} ${colors.selectText}`}
          >
            <option value="day" className={`${colors.selectBg} ${colors.selectText}`}>Day</option>
            <option value="week" className={`${colors.selectBg} ${colors.selectText}`}>Week</option>
            <option value="month" className={`${colors.selectBg} ${colors.selectText}`}>Month</option>
          </select>
        </div>
      </div>

      {/* Chart Container */}
      <div
        ref={containerRef}
        className="overflow-hidden"
        style={{ maxHeight: "400px" }}
      >
        <svg
          ref={svgRef}
          width={labelWidth + chartWidth}
          height={chartHeight}
          className="select-none"
        >
          {/* Background */}
          <rect
            x={0}
            y={0}
            width={labelWidth + chartWidth}
            height={chartHeight}
            fill={colors.background}
          />

          {/* Date header background */}
          <rect
            x={labelWidth}
            y={0}
            width={chartWidth}
            height={headerHeight}
            fill={colors.headerBg}
          />

          {/* Weekend backgrounds */}
          {dateHeaders.map((header, i) => {
            if (!header.isWeekend) return null;
            const x = labelWidth + i * dayWidth - scrollOffset;
            if (x < labelWidth - dayWidth || x > labelWidth + 800) return null;
            return (
              <rect
                key={i}
                x={x}
                y={headerHeight}
                width={dayWidth}
                height={chartHeight - headerHeight}
                fill={colors.weekendBg}
                opacity={0.3}
              />
            );
          })}

          {/* Grid lines */}
          {dateHeaders.map((header, i) => {
            if (viewMode === "day" || (viewMode === "week" && i % 7 === 0) || (viewMode === "month" && header.date.getDate() === 1)) {
              const x = labelWidth + i * dayWidth - scrollOffset;
              if (x < labelWidth || x > labelWidth + 800) return null;
              return (
                <line
                  key={i}
                  x1={x}
                  y1={headerHeight}
                  x2={x}
                  y2={chartHeight}
                  stroke={colors.gridLine}
                  strokeWidth={0.5}
                />
              );
            }
            return null;
          })}

          {/* Row lines */}
          {visibleItems.map((_, i) => (
            <line
              key={i}
              x1={0}
              y1={headerHeight + (i + 1) * rowHeight}
              x2={labelWidth + chartWidth}
              y2={headerHeight + (i + 1) * rowHeight}
              stroke={colors.gridLine}
              strokeWidth={0.5}
            />
          ))}

          {/* Date labels */}
          {dateHeaders.map((header, i) => {
            if (!header.label) return null;
            const x = labelWidth + i * dayWidth - scrollOffset;
            if (x < labelWidth || x > labelWidth + 800) return null;
            return (
              <text
                key={i}
                x={x + dayWidth / 2}
                y={headerHeight - 10}
                textAnchor="middle"
                fontSize={10}
                fill={colors.textSecondary}
              >
                {header.label}
              </text>
            );
          })}

          {/* Today line */}
          {(() => {
            const todayX = dateToX(new Date());
            if (todayX >= labelWidth && todayX <= labelWidth + 800) {
              return (
                <line
                  x1={todayX}
                  y1={headerHeight}
                  x2={todayX}
                  y2={chartHeight}
                  stroke="#ef4444"
                  strokeWidth={2}
                  strokeDasharray="4,2"
                />
              );
            }
            return null;
          })()}

          {/* Label column background */}
          <rect
            x={0}
            y={0}
            width={labelWidth}
            height={chartHeight}
            fill={colors.labelBg}
          />
          <line
            x1={labelWidth}
            y1={0}
            x2={labelWidth}
            y2={chartHeight}
            stroke={colors.gridLine}
            strokeWidth={1}
          />

          {/* Labels */}
          {visibleItems.map((item, i) => {
            const hasChildren = item.children.length > 0;
            const isExpanded = expandedItems.has(item.id);

            return (
              <g key={item.id}>
                {/* Row hover background */}
                {hoveredItem === item.id && (
                  <rect
                    x={0}
                    y={headerHeight + i * rowHeight}
                    width={labelWidth + chartWidth}
                    height={rowHeight}
                    fill={colors.hoverBg}
                    opacity={0.5}
                  />
                )}

                {/* Expand/collapse button */}
                {hasChildren && (
                  <g
                    onClick={() => toggleExpand(item.id)}
                    style={{ cursor: "pointer" }}
                  >
                    <rect
                      x={4 + item.level * 12}
                      y={headerHeight + i * rowHeight + rowHeight / 2 - 6}
                      width={12}
                      height={12}
                      fill="transparent"
                    />
                    <text
                      x={10 + item.level * 12}
                      y={headerHeight + i * rowHeight + rowHeight / 2 + 4}
                      fontSize={10}
                      fill={colors.textSecondary}
                    >
                      {isExpanded ? "▼" : "▶"}
                    </text>
                  </g>
                )}

                {/* Label text */}
                <text
                  x={20 + item.level * 12 + (hasChildren ? 12 : 0)}
                  y={headerHeight + i * rowHeight + rowHeight / 2 + 4}
                  fontSize={11}
                  fill={item.isCritical ? CRITICAL_COLOR : colors.textPrimary}
                  fontWeight={item.isCritical ? "bold" : "normal"}
                  style={{ cursor: "pointer" }}
                  onClick={() => onItemClick?.(items.find((it) => it.wbs_id === item.id)!)}
                  onMouseEnter={() => setHoveredItem(item.id)}
                  onMouseLeave={() => setHoveredItem(null)}
                >
                  {item.code} {item.title.length > 15 ? item.title.slice(0, 15) + "..." : item.title}
                </text>
              </g>
            );
          })}

          {/* Dependency arrows */}
          {renderDependencies()}

          {/* Bars */}
          {visibleItems.map((item, i) => {
            const isDragging = dragState?.itemId === item.id;
            const displayStart = isDragging && dragPreview ? dragPreview.start : item.start;
            const displayEnd = isDragging && dragPreview ? dragPreview.end : item.end;

            const x = dateToX(displayStart);
            const width = Math.max(
              8,
              ((displayEnd.getTime() - displayStart.getTime()) / (24 * 60 * 60 * 1000)) * dayWidth
            );
            const y = headerHeight + i * rowHeight + 8;
            const height = rowHeight - 16;

            if (x + width < labelWidth || x > labelWidth + 800) return null;

            const barColor = item.isCritical ? CRITICAL_COLOR : STATUS_COLORS[item.status] || "#6b7280";
            const isHovered = hoveredItem === item.id;
            const handleWidth = 6;

            return (
              <g
                key={item.id}
                onMouseEnter={() => !dragState && setHoveredItem(item.id)}
                onMouseLeave={() => !dragState && setHoveredItem(null)}
              >
                {/* Bar background */}
                <rect
                  x={Math.max(labelWidth, x)}
                  y={y}
                  width={Math.min(width, x + width - labelWidth)}
                  height={height}
                  rx={4}
                  fill={barColor}
                  opacity={isDragging ? 0.6 : 0.7}
                />

                {/* Progress fill */}
                <rect
                  x={Math.max(labelWidth, x)}
                  y={y}
                  width={Math.min(width * (item.progress / 100), x + width - labelWidth)}
                  height={height}
                  rx={4}
                  fill={barColor}
                  opacity={1}
                />

                {/* Main bar (draggable area for move) */}
                <rect
                  x={Math.max(labelWidth, x) + handleWidth}
                  y={y}
                  width={Math.max(0, Math.min(width - handleWidth * 2, x + width - labelWidth - handleWidth * 2))}
                  height={height}
                  fill="transparent"
                  style={{ cursor: onScheduleChange ? "move" : "pointer" }}
                  onMouseDown={(e) => onScheduleChange && handleDragStart(e, item, "move")}
                  onClick={() => !dragState && onItemClick?.(items.find((it) => it.wbs_id === item.id)!)}
                />

                {/* Left resize handle */}
                {onScheduleChange && x >= labelWidth && (
                  <rect
                    x={Math.max(labelWidth, x)}
                    y={y}
                    width={handleWidth}
                    height={height}
                    fill={isHovered || isDragging ? barColor : "transparent"}
                    opacity={0.6}
                    rx={4}
                    style={{ cursor: "ew-resize" }}
                    onMouseDown={(e) => handleDragStart(e, item, "resize-start")}
                  />
                )}

                {/* Right resize handle */}
                {onScheduleChange && (
                  <rect
                    x={Math.max(labelWidth, x + width - handleWidth)}
                    y={y}
                    width={handleWidth}
                    height={height}
                    fill={isHovered || isDragging ? barColor : "transparent"}
                    opacity={0.6}
                    rx={4}
                    style={{ cursor: "ew-resize" }}
                    onMouseDown={(e) => handleDragStart(e, item, "resize-end")}
                  />
                )}

                {/* Border for critical items */}
                {item.isCritical && (
                  <rect
                    x={Math.max(labelWidth, x)}
                    y={y}
                    width={Math.min(width, x + width - labelWidth)}
                    height={height}
                    rx={4}
                    fill="none"
                    stroke={CRITICAL_COLOR}
                    strokeWidth={2}
                    pointerEvents="none"
                  />
                )}

                {/* Drag indicator lines on hover */}
                {(isHovered || isDragging) && onScheduleChange && (
                  <>
                    <line
                      x1={Math.max(labelWidth, x) + 2}
                      y1={y + height / 2 - 3}
                      x2={Math.max(labelWidth, x) + 2}
                      y2={y + height / 2 + 3}
                      stroke="white"
                      strokeWidth={1}
                      pointerEvents="none"
                    />
                    <line
                      x1={Math.max(labelWidth, x + width - 3)}
                      y1={y + height / 2 - 3}
                      x2={Math.max(labelWidth, x + width - 3)}
                      y2={y + height / 2 + 3}
                      stroke="white"
                      strokeWidth={1}
                      pointerEvents="none"
                    />
                  </>
                )}

                {/* Tooltip on hover */}
                {(isHovered || isDragging) && (
                  <g>
                    <rect
                      x={x + width / 2 - 60}
                      y={y - 30}
                      width={120}
                      height={24}
                      rx={4}
                      fill={colors.tooltipBg}
                      stroke={isDragging ? barColor : colors.tooltipBorder}
                      strokeWidth={isDragging ? 2 : 1}
                      pointerEvents="none"
                    />
                    <text
                      x={x + width / 2}
                      y={y - 13}
                      textAnchor="middle"
                      fontSize={10}
                      fill={colors.textPrimary}
                      pointerEvents="none"
                    >
                      {formatDate(displayStart)} - {formatDate(displayEnd)}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 p-2 border-t border-[var(--border-primary)] text-xs">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: CRITICAL_COLOR }} />
          <span className="text-[var(--text-secondary)]">Critical</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-green-500" />
          <span className="text-[var(--text-secondary)]">Completed</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-blue-500" />
          <span className="text-[var(--text-secondary)]">In Progress</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-gray-500" />
          <span className="text-[var(--text-secondary)]">Pending</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-0.5 h-3 bg-red-500" />
          <span className="text-[var(--text-secondary)]">Today</span>
        </div>
      </div>
    </div>
  );
}
