import { Hono } from "hono";
import { db } from "../lib/db";
import { nanoid } from "nanoid";
import { parseDocument, ParseResult, WBSSuggestion } from "../lib/docParser";
import * as fs from "fs";
import * as path from "path";

const app = new Hono();

interface ParsedDocument {
  id: number;
  doc_id: string;
  project_id: string;
  doc_type: string;
  doc_path: string;
  doc_hash: string;
  parsed_structure: string;
  wbs_mappings: string | null;
  parsed_at: string;
}

// POST /api/docs/parse - Parse a document and get WBS suggestions
app.post("/parse", async (c) => {
  const body = await c.req.json();
  const { project_id, doc_path } = body;

  if (!project_id || !doc_path) {
    return c.json({ error: "project_id and doc_path are required" }, 400);
  }

  // Verify project exists
  const project = db.query("SELECT * FROM projects WHERE project_id = ?").get(project_id);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  // Resolve path (support relative paths from project root)
  let fullPath = doc_path;
  if (!path.isAbsolute(doc_path)) {
    // Assume relative to current working directory
    fullPath = path.resolve(process.cwd(), "..", doc_path);
  }

  // Check if file exists
  if (!fs.existsSync(fullPath)) {
    return c.json({ error: `File not found: ${fullPath}` }, 404);
  }

  try {
    // Parse the document
    const result = parseDocument(fullPath);

    // Check if already parsed (by hash)
    const existing = db.query(
      "SELECT * FROM parsed_documents WHERE project_id = ? AND doc_hash = ?"
    ).get(project_id, result.doc_hash) as ParsedDocument | null;

    const docId = existing?.doc_id || `doc_${nanoid(12)}`;

    // Save or update parsed document
    if (existing) {
      db.query(`
        UPDATE parsed_documents
        SET doc_type = ?, doc_path = ?, parsed_structure = ?, parsed_at = ?
        WHERE doc_id = ?
      `).run(
        result.doc_type,
        result.doc_path,
        JSON.stringify({
          structure: result.parsed_structure,
          extraction: result.extraction,
        }),
        result.parsed_at,
        docId
      );
    } else {
      db.query(`
        INSERT INTO parsed_documents (doc_id, project_id, doc_type, doc_path, doc_hash, parsed_structure, parsed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        docId,
        project_id,
        result.doc_type,
        result.doc_path,
        result.doc_hash,
        JSON.stringify({
          structure: result.parsed_structure,
          extraction: result.extraction,
        }),
        result.parsed_at
      );
    }

    return c.json({
      doc_id: docId,
      doc_type: result.doc_type,
      title: result.title,
      doc_hash: result.doc_hash,
      is_update: !!existing,
      extraction_summary: {
        type: result.doc_type,
        item_count: result.doc_type === "PRJ"
          ? (result.extraction as any)?.phases?.length || 0
          : result.doc_type === "REQ"
          ? (result.extraction as any)?.requirements?.length || 0
          : (result.extraction as any)?.components?.length || 0,
      },
      suggested_wbs: result.wbs_suggestions,
    }, 201);
  } catch (error) {
    console.error("Failed to parse document:", error);
    return c.json({ error: "Failed to parse document", details: String(error) }, 500);
  }
});

// GET /api/docs/:id - Get parsed document details
app.get("/:id", async (c) => {
  const docId = c.req.param("id");

  const doc = db.query("SELECT * FROM parsed_documents WHERE doc_id = ?").get(docId) as ParsedDocument | null;

  if (!doc) {
    return c.json({ error: "Document not found" }, 404);
  }

  return c.json({
    ...doc,
    parsed_structure: JSON.parse(doc.parsed_structure),
    wbs_mappings: doc.wbs_mappings ? JSON.parse(doc.wbs_mappings) : null,
  });
});

// GET /api/docs/:id/wbs-preview - Preview WBS items that would be created
app.get("/:id/wbs-preview", async (c) => {
  const docId = c.req.param("id");

  const doc = db.query("SELECT * FROM parsed_documents WHERE doc_id = ?").get(docId) as ParsedDocument | null;

  if (!doc) {
    return c.json({ error: "Document not found" }, 404);
  }

  // Re-parse the document to get fresh suggestions
  try {
    const result = parseDocument(doc.doc_path);

    return c.json({
      doc_id: docId,
      doc_type: doc.doc_type,
      wbs_items: result.wbs_suggestions,
      mappings: result.wbs_suggestions.map((s) => ({
        code: s.code,
        source_section: s.source_section,
      })),
    });
  } catch (error) {
    return c.json({ error: "Failed to preview WBS", details: String(error) }, 500);
  }
});

// POST /api/docs/:id/apply - Apply WBS suggestions to project
app.post("/:id/apply", async (c) => {
  const docId = c.req.param("id");
  const body = await c.req.json();
  const { selected_items } = body; // Array of codes to create

  const doc = db.query("SELECT * FROM parsed_documents WHERE doc_id = ?").get(docId) as ParsedDocument | null;

  if (!doc) {
    return c.json({ error: "Document not found" }, 404);
  }

  try {
    // Re-parse to get suggestions
    const result = parseDocument(doc.doc_path);

    // Filter to selected items (or all if not specified)
    const itemsToCreate = selected_items
      ? result.wbs_suggestions.filter((s) => selected_items.includes(s.code))
      : result.wbs_suggestions;

    const createdItems: any[] = [];
    const codeToWbsId = new Map<string, string>();
    const now = new Date().toISOString();

    // Create WBS items in order (phases first, then children)
    const sorted = [...itemsToCreate].sort((a, b) => {
      const aDepth = a.code.split(".").length;
      const bDepth = b.code.split(".").length;
      return aDepth - bDepth;
    });

    for (const suggestion of sorted) {
      const wbsId = `wbs_${nanoid(12)}`;

      // Determine parent
      let parentId: string | null = null;
      if (suggestion.parent_code && codeToWbsId.has(suggestion.parent_code)) {
        parentId = codeToWbsId.get(suggestion.parent_code)!;
      }

      // Get max sort order
      const maxOrder = db.query(
        "SELECT MAX(sort_order) as max FROM wbs_items WHERE project_id = ? AND (parent_id = ? OR (parent_id IS NULL AND ? IS NULL))"
      ).get(doc.project_id, parentId, parentId) as { max: number | null };

      const sortOrder = (maxOrder.max || 0) + 1;

      db.query(`
        INSERT INTO wbs_items (
          wbs_id, project_id, parent_id, code, title, description, type, status,
          estimated_duration, auto_created, sort_order, metadata, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, 1, ?, ?, ?, ?)
      `).run(
        wbsId,
        doc.project_id,
        parentId,
        suggestion.code,
        suggestion.title,
        suggestion.description || null,
        suggestion.type,
        suggestion.estimated_duration || null,
        sortOrder,
        JSON.stringify({
          source_doc: suggestion.source_doc,
          source_section: suggestion.source_section,
        }),
        now,
        now
      );

      codeToWbsId.set(suggestion.code, wbsId);
      createdItems.push({
        wbs_id: wbsId,
        code: suggestion.code,
        title: suggestion.title,
        type: suggestion.type,
      });
    }

    // Update wbs_mappings in parsed_documents
    db.query("UPDATE parsed_documents SET wbs_mappings = ? WHERE doc_id = ?").run(
      JSON.stringify(createdItems.map((item) => ({
        wbs_id: item.wbs_id,
        code: item.code,
      }))),
      docId
    );

    return c.json({
      success: true,
      created_count: createdItems.length,
      created_wbs: createdItems,
    });
  } catch (error) {
    console.error("Failed to apply WBS:", error);
    return c.json({ error: "Failed to apply WBS", details: String(error) }, 500);
  }
});

// GET /api/docs/project/:project_id - List all parsed documents for a project
app.get("/project/:project_id", async (c) => {
  const projectId = c.req.param("project_id");

  const docs = db.query(
    "SELECT * FROM parsed_documents WHERE project_id = ? ORDER BY parsed_at DESC"
  ).all(projectId) as ParsedDocument[];

  return c.json({
    documents: docs.map((doc) => ({
      doc_id: doc.doc_id,
      doc_type: doc.doc_type,
      doc_path: doc.doc_path,
      doc_hash: doc.doc_hash,
      has_mappings: !!doc.wbs_mappings,
      parsed_at: doc.parsed_at,
    })),
  });
});

// DELETE /api/docs/:id - Delete a parsed document
app.delete("/:id", async (c) => {
  const docId = c.req.param("id");

  const doc = db.query("SELECT * FROM parsed_documents WHERE doc_id = ?").get(docId);

  if (!doc) {
    return c.json({ error: "Document not found" }, 404);
  }

  db.query("DELETE FROM parsed_documents WHERE doc_id = ?").run(docId);

  return c.json({ success: true });
});

// POST /api/docs/scan - Scan a directory for documents
app.post("/scan", async (c) => {
  const body = await c.req.json();
  const { project_id, directory } = body;

  if (!project_id || !directory) {
    return c.json({ error: "project_id and directory are required" }, 400);
  }

  // Resolve path
  let fullPath = directory;
  if (!path.isAbsolute(directory)) {
    fullPath = path.resolve(process.cwd(), "..", directory);
  }

  if (!fs.existsSync(fullPath)) {
    return c.json({ error: `Directory not found: ${fullPath}` }, 404);
  }

  // Find markdown files
  const files = fs.readdirSync(fullPath)
    .filter((f) => f.endsWith(".md"))
    .map((f) => path.join(fullPath, f));

  const results: Array<{
    path: string;
    type: string;
    title: string;
  }> = [];

  for (const file of files) {
    try {
      const result = parseDocument(file);
      results.push({
        path: file,
        type: result.doc_type,
        title: result.title,
      });
    } catch (error) {
      // Skip files that can't be parsed
      console.error(`Failed to scan ${file}:`, error);
    }
  }

  return c.json({
    directory: fullPath,
    found: results.length,
    documents: results,
  });
});

export default app;
