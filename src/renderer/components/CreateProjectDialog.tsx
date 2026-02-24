import React, { useState } from "react";
import { LuX, LuCode } from "react-icons/lu";
import type { ProjectTemplate, ProjectLanguage } from "../../shared/types";

interface CreateProjectDialogProps {
  serverFramework?: string;
  mcVersion?: string;
  onSubmit: (template: ProjectTemplate, name: string, mcVersion: string, packageName?: string, language?: ProjectLanguage) => void;
  onCancel: () => void;
}

const TEMPLATES: { value: ProjectTemplate; label: string; description: string; needsPackage: boolean }[] = [
  { value: "paper-plugin", label: "Paper Plugin", description: "Gradle + Java plugin for Paper servers", needsPackage: true },
  { value: "fabric-mod", label: "Fabric Mod", description: "Gradle + Fabric Loom mod", needsPackage: true },
  { value: "kubejs-scripts", label: "KubeJS Scripts", description: "Script-based modding with hot reload", needsPackage: false },
];

function defaultTemplateForFramework(framework?: string): ProjectTemplate {
  switch (framework) {
    case "paper": return "paper-plugin";
    case "fabric": return "fabric-mod";
    case "kubejs": return "kubejs-scripts";
    default: return "paper-plugin";
  }
}

export function CreateProjectDialog({ serverFramework, mcVersion: defaultMcVersion, onSubmit, onCancel }: CreateProjectDialogProps) {
  const [template, setTemplate] = useState<ProjectTemplate>(defaultTemplateForFramework(serverFramework));
  const [name, setName] = useState("");
  const [mcVersion, setMcVersion] = useState(defaultMcVersion || "1.21.4");
  const [packageName, setPackageName] = useState("");
  const [language, setLanguage] = useState<ProjectLanguage>("java");

  const selectedTemplate = TEMPLATES.find((t) => t.value === template)!;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const lang = template === "kubejs-scripts" ? undefined : language;
    onSubmit(template, trimmedName, mcVersion, packageName.trim() || undefined, lang);
  };

  const isValid = name.trim().length > 0;

  return (
    <div className="bg-[#0f0f0f] border border-border-subtle rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
          <LuCode className="text-accent" />
          New Project
        </div>
        <button
          onClick={onCancel}
          className="p-1 rounded text-text-dim hover:text-text-primary hover:bg-white/5 transition-all cursor-pointer"
        >
          <LuX className="text-sm" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {/* Template */}
        <div>
          <label className="text-[10px] uppercase tracking-widest text-text-dim font-medium">
            Template
          </label>
          <select
            value={template}
            onChange={(e) => setTemplate(e.target.value as ProjectTemplate)}
            className="w-full mt-1 px-3 py-2 rounded-lg bg-card border border-border-subtle text-text-primary text-sm focus:outline-none focus:border-accent transition-colors cursor-pointer"
          >
            {TEMPLATES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label} — {t.description}
              </option>
            ))}
          </select>
        </div>

        {/* Language Toggle (hidden for KubeJS) */}
        {template !== "kubejs-scripts" && (
          <div>
            <label className="text-[10px] uppercase tracking-widest text-text-dim font-medium">
              Language
            </label>
            <div className="flex gap-2 mt-1">
              {(["java", "kotlin"] as const).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setLanguage(lang)}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                    language === lang
                      ? "bg-accent text-black"
                      : "bg-card border border-border-subtle text-text-muted hover:text-text-primary hover:border-accent/50"
                  }`}
                >
                  {lang === "java" ? "Java" : "Kotlin"}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Project Name */}
        <div>
          <label className="text-[10px] uppercase tracking-widest text-text-dim font-medium">
            Project Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-plugin"
            className="w-full mt-1 px-3 py-2 rounded-lg bg-card border border-border-subtle text-text-primary text-sm font-mono placeholder:text-text-disabled focus:outline-none focus:border-accent transition-colors"
            autoFocus
          />
        </div>

        {/* MC Version */}
        <div>
          <label className="text-[10px] uppercase tracking-widest text-text-dim font-medium">
            Minecraft Version
          </label>
          <input
            type="text"
            value={mcVersion}
            onChange={(e) => setMcVersion(e.target.value)}
            placeholder="1.21.4"
            className="w-full mt-1 px-3 py-2 rounded-lg bg-card border border-border-subtle text-text-primary text-sm font-mono placeholder:text-text-disabled focus:outline-none focus:border-accent transition-colors"
          />
        </div>

        {/* Package Name (Java templates only) */}
        {selectedTemplate.needsPackage && (
          <div>
            <label className="text-[10px] uppercase tracking-widest text-text-dim font-medium">
              Package Name
              <span className="text-text-disabled ml-1">(optional)</span>
            </label>
            <input
              type="text"
              value={packageName}
              onChange={(e) => setPackageName(e.target.value)}
              placeholder="com.example.myplugin"
              className="w-full mt-1 px-3 py-2 rounded-lg bg-card border border-border-subtle text-text-primary text-sm font-mono placeholder:text-text-disabled focus:outline-none focus:border-accent transition-colors"
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-1">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-xs text-text-muted hover:text-text-primary hover:bg-white/5 transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!isValid}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent text-black hover:bg-accent/90 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Create Project
          </button>
        </div>
      </form>
    </div>
  );
}
