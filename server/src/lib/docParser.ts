/**
 * Document Parser Engine
 * Parses PRJ (企画書), REQ (要件定義書), DES (設計書) documents
 * and extracts structured data for WBS generation
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

// Types
export interface ParsedSection {
  level: number;
  title: string;
  content: string;
  children: ParsedSection[];
}

export interface PRJExtraction {
  title: string;
  phases: Array<{
    name: string;
    objectives: string[];
    components: string[];
  }>;
  milestones: string[];
}

export interface REQExtraction {
  title: string;
  requirements: Array<{
    id: string;
    title: string;
    description: string;
    priority: string;
    acceptance_criteria: string[];
  }>;
}

export interface DESExtraction {
  title: string;
  components: Array<{
    name: string;
    layer: string;
    description: string;
    endpoints: string[];
    tables: string[];
  }>;
}

export interface WBSSuggestion {
  code: string;
  title: string;
  type: "phase" | "milestone" | "task" | "subtask";
  description: string;
  estimated_duration?: number;
  parent_code?: string;
  source_doc: string;
  source_section: string;
}

export interface ParseResult {
  doc_type: "PRJ" | "REQ" | "DES" | "UNKNOWN";
  doc_path: string;
  doc_hash: string;
  title: string;
  parsed_structure: ParsedSection[];
  extraction: PRJExtraction | REQExtraction | DESExtraction | null;
  wbs_suggestions: WBSSuggestion[];
  parsed_at: string;
}

// Markdown Parser
function parseMarkdown(content: string): ParsedSection[] {
  const lines = content.split("\n");
  const root: ParsedSection[] = [];
  const stack: { level: number; section: ParsedSection }[] = [];

  let currentContent: string[] = [];

  const flushContent = () => {
    if (stack.length > 0 && currentContent.length > 0) {
      stack[stack.length - 1].section.content = currentContent.join("\n").trim();
    }
    currentContent = [];
  };

  for (const line of lines) {
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headerMatch) {
      flushContent();

      const level = headerMatch[1].length;
      const title = headerMatch[2].trim();

      const newSection: ParsedSection = {
        level,
        title,
        content: "",
        children: [],
      };

      // Find parent
      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }

      if (stack.length === 0) {
        root.push(newSection);
      } else {
        stack[stack.length - 1].section.children.push(newSection);
      }

      stack.push({ level, section: newSection });
    } else {
      currentContent.push(line);
    }
  }

  flushContent();

  return root;
}

// PRJ Parser
function parsePRJ(sections: ParsedSection[]): PRJExtraction {
  const extraction: PRJExtraction = {
    title: "",
    phases: [],
    milestones: [],
  };

  // Get title from first h1
  const titleSection = sections.find((s) => s.level === 1);
  if (titleSection) {
    extraction.title = titleSection.title.replace(/^企画書[：:]\s*/, "");
  }

  // Find phases (typically in "提案ソリューション" or similar sections)
  const findPhases = (section: ParsedSection): void => {
    const titleLower = section.title.toLowerCase();

    // Look for phase-related sections
    if (
      titleLower.includes("フェーズ") ||
      titleLower.includes("phase") ||
      titleLower.includes("ソリューション") ||
      titleLower.includes("コンポーネント")
    ) {
      const phase = {
        name: section.title,
        objectives: [] as string[],
        components: [] as string[],
      };

      // Extract bullet points
      const bullets = section.content.match(/^[-*]\s+(.+)$/gm);
      if (bullets) {
        phase.objectives = bullets.map((b) => b.replace(/^[-*]\s+/, ""));
      }

      // Extract from tables
      const tableRows = section.content.match(/\|([^|]+)\|/g);
      if (tableRows) {
        tableRows.forEach((row) => {
          const cleaned = row.replace(/\|/g, "").trim();
          if (cleaned && !cleaned.includes("---")) {
            phase.components.push(cleaned);
          }
        });
      }

      extraction.phases.push(phase);
    }

    // Recursively search children
    section.children.forEach(findPhases);
  };

  sections.forEach(findPhases);

  // Find milestones
  const findMilestones = (section: ParsedSection): void => {
    if (
      section.title.toLowerCase().includes("マイルストーン") ||
      section.title.toLowerCase().includes("milestone") ||
      section.title.toLowerCase().includes("スケジュール")
    ) {
      const bullets = section.content.match(/^[-*]\s+(.+)$/gm);
      if (bullets) {
        extraction.milestones.push(...bullets.map((b) => b.replace(/^[-*]\s+/, "")));
      }
    }
    section.children.forEach(findMilestones);
  };

  sections.forEach(findMilestones);

  return extraction;
}

// REQ Parser
function parseREQ(sections: ParsedSection[]): REQExtraction {
  const extraction: REQExtraction = {
    title: "",
    requirements: [],
  };

  // Get title
  const titleSection = sections.find((s) => s.level === 1);
  if (titleSection) {
    extraction.title = titleSection.title.replace(/^要件定義書[：:]\s*/, "");
  }

  // Find requirements (FR-xxx, NFR-xxx patterns)
  const findRequirements = (section: ParsedSection): void => {
    // Check for requirement ID in title (e.g., "FR-001: エージェント状態表示")
    const reqMatch = section.title.match(/^(FR|NFR|REQ)-(\d+)[-:]?\s*(.+)?$/i);
    if (reqMatch) {
      const req = {
        id: `${reqMatch[1].toUpperCase()}-${reqMatch[2]}`,
        title: reqMatch[3] || section.title,
        description: "",
        priority: "P1",
        acceptance_criteria: [] as string[],
      };

      // Extract description
      req.description = section.content.split("\n")[0] || "";

      // Extract priority from content
      const priorityMatch = section.content.match(/優先度[：:]\s*(P\d)/i) ||
        section.content.match(/\|(P\d)\|/);
      if (priorityMatch) {
        req.priority = priorityMatch[1];
      }

      // Extract acceptance criteria
      const criteriaSection = section.children.find(
        (c) => c.title.toLowerCase().includes("受入基準") || c.title.toLowerCase().includes("acceptance")
      );
      if (criteriaSection) {
        const bullets = criteriaSection.content.match(/^[-*\[\]x ]\s+(.+)$/gm);
        if (bullets) {
          req.acceptance_criteria = bullets.map((b) => b.replace(/^[-*\[\]x ]\s+/, ""));
        }
      }

      extraction.requirements.push(req);
    }

    // Also check tables for requirements
    const tableMatch = section.content.match(/\|(FR|NFR|REQ)-(\d+)[-\d]*\|([^|]+)\|([^|]+)\|/gi);
    if (tableMatch) {
      tableMatch.forEach((row) => {
        const parts = row.split("|").filter((p) => p.trim());
        if (parts.length >= 3) {
          const idMatch = parts[0].match(/(FR|NFR|REQ)-(\d+)/i);
          if (idMatch) {
            const existingReq = extraction.requirements.find((r) => r.id === `${idMatch[1].toUpperCase()}-${idMatch[2]}`);
            if (!existingReq) {
              extraction.requirements.push({
                id: `${idMatch[1].toUpperCase()}-${idMatch[2]}`,
                title: parts[1].trim(),
                description: parts[2]?.trim() || "",
                priority: parts[3]?.trim() || "P1",
                acceptance_criteria: [],
              });
            }
          }
        }
      });
    }

    section.children.forEach(findRequirements);
  };

  sections.forEach(findRequirements);

  return extraction;
}

// DES Parser
function parseDES(sections: ParsedSection[]): DESExtraction {
  const extraction: DESExtraction = {
    title: "",
    components: [],
  };

  // Get title
  const titleSection = sections.find((s) => s.level === 1);
  if (titleSection) {
    extraction.title = titleSection.title.replace(/^設計書[：:]\s*/, "");
  }

  // Find components
  const findComponents = (section: ParsedSection, parentLayer?: string): void => {
    const titleLower = section.title.toLowerCase();

    // Detect layer
    let layer = parentLayer || "Other";
    if (titleLower.includes("frontend") || titleLower.includes("フロントエンド") || titleLower.includes("client")) {
      layer = "Frontend";
    } else if (titleLower.includes("backend") || titleLower.includes("バックエンド") || titleLower.includes("api") || titleLower.includes("server")) {
      layer = "Backend";
    } else if (titleLower.includes("database") || titleLower.includes("データ") || titleLower.includes("db")) {
      layer = "Data";
    } else if (titleLower.includes("infrastructure") || titleLower.includes("インフラ")) {
      layer = "Infrastructure";
    }

    // Check for component patterns
    if (
      section.level >= 3 &&
      (titleLower.includes("コンポーネント") ||
        titleLower.includes("component") ||
        titleLower.includes("モジュール") ||
        titleLower.includes("service") ||
        titleLower.includes("panel") ||
        section.title.match(/^[A-Z][a-zA-Z]+(?:Panel|Service|Component|Handler|Router)$/))
    ) {
      const component = {
        name: section.title,
        layer,
        description: section.content.split("\n")[0] || "",
        endpoints: [] as string[],
        tables: [] as string[],
      };

      // Extract API endpoints
      const endpointMatches = section.content.match(/(?:GET|POST|PUT|PATCH|DELETE)\s+\/[^\s]+/g);
      if (endpointMatches) {
        component.endpoints = endpointMatches;
      }

      // Extract table names
      const tableMatches = section.content.match(/(?:CREATE TABLE|table:?)\s+(\w+)/gi);
      if (tableMatches) {
        component.tables = tableMatches.map((t) => t.replace(/(?:CREATE TABLE|table:?)\s+/i, ""));
      }

      extraction.components.push(component);
    }

    // Also look for API endpoint tables
    if (titleLower.includes("api") || titleLower.includes("endpoint")) {
      const rows = section.content.match(/\|(GET|POST|PUT|PATCH|DELETE)\|([^|]+)\|([^|]+)\|/gi);
      if (rows) {
        rows.forEach((row) => {
          const parts = row.split("|").filter((p) => p.trim());
          if (parts.length >= 2) {
            const existingComponent = extraction.components.find((c) => c.name === "API Endpoints");
            if (existingComponent) {
              existingComponent.endpoints.push(`${parts[0]} ${parts[1]}`);
            } else {
              extraction.components.push({
                name: "API Endpoints",
                layer: "Backend",
                description: "REST API endpoints",
                endpoints: [`${parts[0]} ${parts[1]}`],
                tables: [],
              });
            }
          }
        });
      }
    }

    section.children.forEach((child) => findComponents(child, layer));
  };

  sections.forEach((s) => findComponents(s));

  return extraction;
}

// Generate WBS suggestions from parsed data
function generateWBSSuggestions(
  docType: string,
  docPath: string,
  extraction: PRJExtraction | REQExtraction | DESExtraction
): WBSSuggestion[] {
  const suggestions: WBSSuggestion[] = [];
  let phaseCounter = 1;

  if (docType === "PRJ") {
    const prj = extraction as PRJExtraction;

    // Create phase-level items
    prj.phases.forEach((phase) => {
      const phaseCode = String(phaseCounter++);
      suggestions.push({
        code: phaseCode,
        title: phase.name,
        type: "phase",
        description: phase.objectives.join("; "),
        estimated_duration: 40, // Default 1 week
        source_doc: docPath,
        source_section: phase.name,
      });

      // Create tasks from objectives/components
      let taskCounter = 1;
      phase.objectives.forEach((obj) => {
        suggestions.push({
          code: `${phaseCode}.${taskCounter++}`,
          title: obj,
          type: "task",
          description: "",
          estimated_duration: 8,
          parent_code: phaseCode,
          source_doc: docPath,
          source_section: phase.name,
        });
      });
    });

    // Create milestones
    prj.milestones.forEach((ms, i) => {
      suggestions.push({
        code: `M${i + 1}`,
        title: ms,
        type: "milestone",
        description: "",
        source_doc: docPath,
        source_section: "Milestones",
      });
    });
  } else if (docType === "REQ") {
    const req = extraction as REQExtraction;

    // Group requirements by priority
    const p0Reqs = req.requirements.filter((r) => r.priority === "P0");
    const p1Reqs = req.requirements.filter((r) => r.priority === "P1");
    const p2Reqs = req.requirements.filter((r) => r.priority === "P2");

    // Create phase for each priority level
    if (p0Reqs.length > 0) {
      suggestions.push({
        code: "1",
        title: "P0 Requirements (Must Have)",
        type: "phase",
        description: "Critical requirements",
        estimated_duration: p0Reqs.length * 8,
        source_doc: docPath,
        source_section: "Requirements",
      });

      p0Reqs.forEach((r, i) => {
        suggestions.push({
          code: `1.${i + 1}`,
          title: `${r.id}: ${r.title}`,
          type: "task",
          description: r.description,
          estimated_duration: 8,
          parent_code: "1",
          source_doc: docPath,
          source_section: r.id,
        });
      });
    }

    if (p1Reqs.length > 0) {
      suggestions.push({
        code: "2",
        title: "P1 Requirements (Should Have)",
        type: "phase",
        description: "Important requirements",
        estimated_duration: p1Reqs.length * 8,
        source_doc: docPath,
        source_section: "Requirements",
      });

      p1Reqs.forEach((r, i) => {
        suggestions.push({
          code: `2.${i + 1}`,
          title: `${r.id}: ${r.title}`,
          type: "task",
          description: r.description,
          estimated_duration: 8,
          parent_code: "2",
          source_doc: docPath,
          source_section: r.id,
        });
      });
    }

    if (p2Reqs.length > 0) {
      suggestions.push({
        code: "3",
        title: "P2 Requirements (Nice to Have)",
        type: "phase",
        description: "Optional requirements",
        estimated_duration: p2Reqs.length * 4,
        source_doc: docPath,
        source_section: "Requirements",
      });

      p2Reqs.forEach((r, i) => {
        suggestions.push({
          code: `3.${i + 1}`,
          title: `${r.id}: ${r.title}`,
          type: "task",
          description: r.description,
          estimated_duration: 4,
          parent_code: "3",
          source_doc: docPath,
          source_section: r.id,
        });
      });
    }
  } else if (docType === "DES") {
    const des = extraction as DESExtraction;

    // Group components by layer
    const layers = new Map<string, typeof des.components>();
    des.components.forEach((c) => {
      if (!layers.has(c.layer)) {
        layers.set(c.layer, []);
      }
      layers.get(c.layer)!.push(c);
    });

    let layerCounter = 1;
    layers.forEach((components, layer) => {
      const layerCode = String(layerCounter++);

      suggestions.push({
        code: layerCode,
        title: `${layer} Implementation`,
        type: "phase",
        description: `Implement ${layer} layer components`,
        estimated_duration: components.length * 8,
        source_doc: docPath,
        source_section: layer,
      });

      components.forEach((c, i) => {
        suggestions.push({
          code: `${layerCode}.${i + 1}`,
          title: c.name,
          type: "task",
          description: c.description,
          estimated_duration: 8,
          parent_code: layerCode,
          source_doc: docPath,
          source_section: c.name,
        });
      });
    });
  }

  return suggestions;
}

// Detect document type from content
function detectDocType(content: string, filePath: string): "PRJ" | "REQ" | "DES" | "UNKNOWN" {
  const fileName = path.basename(filePath).toLowerCase();

  if (fileName.includes("prj") || fileName.includes("企画")) return "PRJ";
  if (fileName.includes("req") || fileName.includes("要件")) return "REQ";
  if (fileName.includes("des") || fileName.includes("設計")) return "DES";

  // Check content
  if (content.includes("エグゼクティブサマリー") || content.includes("提案ソリューション")) return "PRJ";
  if (content.includes("機能要件") || content.includes("FR-")) return "REQ";
  if (content.includes("システムアーキテクチャ") || content.includes("API設計")) return "DES";

  return "UNKNOWN";
}

// Main parse function
export function parseDocument(filePath: string): ParseResult {
  const content = fs.readFileSync(filePath, "utf-8");
  const hash = crypto.createHash("md5").update(content).digest("hex");
  const docType = detectDocType(content, filePath);

  const parsedStructure = parseMarkdown(content);

  let extraction: PRJExtraction | REQExtraction | DESExtraction | null = null;

  if (docType === "PRJ") {
    extraction = parsePRJ(parsedStructure);
  } else if (docType === "REQ") {
    extraction = parseREQ(parsedStructure);
  } else if (docType === "DES") {
    extraction = parseDES(parsedStructure);
  }

  const title =
    extraction?.title ||
    parsedStructure.find((s) => s.level === 1)?.title ||
    path.basename(filePath, ".md");

  const wbsSuggestions = extraction
    ? generateWBSSuggestions(docType, filePath, extraction)
    : [];

  return {
    doc_type: docType,
    doc_path: filePath,
    doc_hash: hash,
    title,
    parsed_structure: parsedStructure,
    extraction,
    wbs_suggestions: wbsSuggestions,
    parsed_at: new Date().toISOString(),
  };
}

// Parse multiple documents
export function parseDocuments(filePaths: string[]): ParseResult[] {
  return filePaths.map(parseDocument);
}
