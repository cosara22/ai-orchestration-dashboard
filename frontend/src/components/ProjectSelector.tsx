"use client";

import { useEffect, useState } from "react";
import { api, Project } from "@/lib/api";
import { FolderOpen, ChevronDown } from "lucide-react";

interface ProjectSelectorProps {
  selectedProject: string | null;
  onProjectChange: (project: string | null) => void;
}

export function ProjectSelector({ selectedProject, onProjectChange }: ProjectSelectorProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const res = await api.getProjects();
        setProjects(res.projects || []);
      } catch (error) {
        console.error("Failed to fetch projects:", error);
      }
    };
    fetchProjects();
  }, []);

  const selectedProjectData = projects.find((p) => p.name === selectedProject);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-theme-primary border border-theme rounded-md text-theme-primary hover:bg-theme-card transition-colors"
      >
        <FolderOpen className="h-4 w-4 text-blue-400" />
        <span className="max-w-[150px] truncate">
          {selectedProject || "All Projects"}
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-1 w-64 bg-theme-card border border-theme rounded-md shadow-lg z-20 overflow-hidden">
            <div className="max-h-[300px] overflow-y-auto">
              <button
                onClick={() => {
                  onProjectChange(null);
                  setIsOpen(false);
                }}
                className={`w-full px-4 py-2 text-left text-sm hover:bg-theme-primary transition-colors flex items-center justify-between ${
                  !selectedProject ? "bg-blue-900/30 text-blue-400" : "text-theme-primary"
                }`}
              >
                <span>All Projects</span>
                {!selectedProject && (
                  <span className="text-xs text-blue-400">Selected</span>
                )}
              </button>
              {projects.length === 0 ? (
                <div className="px-4 py-3 text-sm text-theme-secondary text-center">
                  No projects found
                </div>
              ) : (
                projects.map((project) => (
                  <button
                    key={project.name}
                    onClick={() => {
                      onProjectChange(project.name);
                      setIsOpen(false);
                    }}
                    className={`w-full px-4 py-2 text-left text-sm hover:bg-theme-primary transition-colors ${
                      selectedProject === project.name
                        ? "bg-blue-900/30 text-blue-400"
                        : "text-theme-primary"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="truncate">{project.name}</span>
                      {selectedProject === project.name && (
                        <span className="text-xs text-blue-400">Selected</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-theme-secondary">
                      <span>{project.event_count} events</span>
                      <span>{project.session_count} sessions</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
