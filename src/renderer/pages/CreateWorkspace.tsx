import React, { useState } from "react";
import {
  LuArrowLeft,
  LuServer,
  LuBox,
  LuCode2,
  LuCheck,
  LuFolderOpen,
} from "react-icons/lu";
import { Button, Card, SectionLabel } from "../components";

interface CreateWorkspaceProps {
  onBack: () => void;
  onCreate: (config: {
    name: string;
    path: string;
    framework: string;
    mcVersion: string;
    build: string;
  }) => void;
}

type Framework = "paper" | "fabric" | "kubejs";

interface FrameworkOption {
  id: Framework;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const frameworks: FrameworkOption[] = [
  {
    id: "paper",
    name: "Paper",
    description: "Plugin development with the Paper API",
    icon: LuServer,
  },
  {
    id: "fabric",
    name: "Fabric",
    description: "Lightweight mod loader for modern mods",
    icon: LuBox,
  },
  {
    id: "kubejs",
    name: "KubeJS",
    description: "Script-based modding with hot reload",
    icon: LuCode2,
  },
];

const mcVersions = [
  "1.21.6",
  "1.21.5",
  "1.21.4",
  "1.21.3",
  "1.21.2",
  "1.21.1",
  "1.21",
  "1.20.6",
  "1.20.4",
];

const stepNames = ["Framework", "Version", "Details"];

export function CreateWorkspace({ onBack, onCreate }: CreateWorkspaceProps) {
  const [step, setStep] = useState(0);
  const [selectedFramework, setSelectedFramework] = useState<Framework | null>(
    null
  );
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspacePath, setWorkspacePath] = useState("~/blockdev-workspaces");
  const [build, setBuild] = useState("latest");

  const canNext =
    (step === 0 && selectedFramework !== null) ||
    (step === 1 && selectedVersion !== null) ||
    step === 2;

  function handleFrameworkSelect(fw: Framework) {
    setSelectedFramework(fw);
    if (!workspaceName || workspaceName === `${selectedFramework}-dev`) {
      setWorkspaceName(`${fw}-dev`);
    }
  }

  function handleNext() {
    if (step < 2) {
      setStep(step + 1);
    } else {
      onCreate({
        name: workspaceName || `${selectedFramework}-dev`,
        path: workspacePath,
        framework: selectedFramework!,
        mcVersion: selectedVersion!,
        build,
      });
    }
  }

  function handleBack() {
    if (step > 0) {
      setStep(step - 1);
    } else {
      onBack();
    }
  }

  return (
    <div className="min-h-screen flex flex-col p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={onBack}
          className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-card transition-all duration-300 cursor-pointer"
        >
          <LuArrowLeft className="text-xl" />
        </button>
        <h1 className="text-2xl font-bold">Create Workspace</h1>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2 mb-10">
        {stepNames.map((name, i) => (
          <React.Fragment key={name}>
            {i > 0 && (
              <div
                className={`flex-1 h-px transition-colors duration-500 ${
                  i <= step ? "bg-accent" : "bg-border-subtle"
                }`}
              />
            )}
            <div className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-500 ${
                  i < step
                    ? "bg-accent text-black"
                    : i === step
                    ? "bg-accent text-black"
                    : "bg-card text-text-dim border border-border-subtle"
                }`}
              >
                {i < step ? <LuCheck className="text-sm" /> : i + 1}
              </div>
              <span
                className={`text-xs font-medium transition-colors duration-500 ${
                  i <= step ? "text-text-primary" : "text-text-dim"
                }`}
              >
                {name}
              </span>
            </div>
          </React.Fragment>
        ))}
      </div>

      {/* Step Content */}
      <div className="flex-1">
        {/* Step 1: Select Framework */}
        <div
          className={`transition-all duration-500 ${
            step === 0
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-4 absolute pointer-events-none"
          }`}
        >
          {step === 0 && (
            <>
              <SectionLabel>Select Framework</SectionLabel>
              <div className="grid grid-cols-3 gap-4 mt-4">
                {frameworks.map((fw) => {
                  const isSelected = selectedFramework === fw.id;
                  const Icon = fw.icon;
                  return (
                    <Card
                      key={fw.id}
                      hoverable
                      onClick={() => handleFrameworkSelect(fw.id)}
                      className={`${
                        isSelected
                          ? "!border-accent border-2"
                          : "border border-transparent"
                      }`}
                    >
                      <div className="flex flex-col items-center text-center gap-3">
                        <div
                          className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors duration-300 ${
                            isSelected
                              ? "bg-accent/10 text-accent"
                              : "bg-[#1a1a1a] text-text-muted"
                          }`}
                        >
                          <Icon className="text-2xl" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{fw.name}</p>
                          <p className="text-xs text-text-muted mt-1 leading-relaxed">
                            {fw.description}
                          </p>
                        </div>
                        {isSelected && (
                          <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                            <LuCheck className="text-black text-xs" />
                          </div>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Step 2: Select Version */}
        <div
          className={`transition-all duration-500 ${
            step === 1
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-4 absolute pointer-events-none"
          }`}
        >
          {step === 1 && (
            <>
              <SectionLabel>Minecraft Version</SectionLabel>
              <div className="flex flex-col gap-1 mt-4">
                {mcVersions.map((version, i) => {
                  const isSelected = selectedVersion === version;
                  return (
                    <button
                      key={version}
                      onClick={() => setSelectedVersion(version)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 cursor-pointer ${
                        isSelected
                          ? "bg-card-hover text-text-primary"
                          : "text-text-muted hover:bg-card hover:text-text-primary"
                      }`}
                    >
                      {/* Radio indicator */}
                      <div
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
                          isSelected
                            ? "border-accent"
                            : "border-border-prominent"
                        }`}
                      >
                        <div
                          className={`w-2 h-2 rounded-full transition-all duration-300 ${
                            isSelected
                              ? "bg-accent scale-100"
                              : "bg-transparent scale-0"
                          }`}
                        />
                      </div>

                      {/* Version text */}
                      <span className="text-sm font-medium font-mono">
                        {version}
                      </span>

                      {/* Latest badge */}
                      {i === 0 && (
                        <span className="text-[10px] font-bold tracking-wide uppercase bg-accent/15 text-accent px-2 py-0.5 rounded-full">
                          latest
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Step 3: Name + Path */}
        <div
          className={`transition-all duration-500 ${
            step === 2
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-4 absolute pointer-events-none"
          }`}
        >
          {step === 2 && (
            <div className="flex flex-col gap-6">
              {/* Workspace Name */}
              <div>
                <SectionLabel>Workspace Name</SectionLabel>
                <input
                  type="text"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  placeholder={`${selectedFramework}-dev`}
                  className="w-full mt-3 px-4 py-3 rounded-xl bg-card border border-border-subtle text-text-primary text-sm font-inter placeholder:text-text-disabled focus:outline-none focus:border-accent transition-colors duration-300"
                />
              </div>

              {/* Directory */}
              <div>
                <SectionLabel>Directory</SectionLabel>
                <div className="flex gap-2 mt-3">
                  <input
                    type="text"
                    value={workspacePath}
                    onChange={(e) => setWorkspacePath(e.target.value)}
                    className="flex-1 px-4 py-3 rounded-xl bg-card border border-border-subtle text-text-primary text-sm font-mono placeholder:text-text-disabled focus:outline-none focus:border-accent transition-colors duration-300"
                  />
                  <button
                    className="px-4 py-3 rounded-xl bg-card border border-border-subtle text-text-muted hover:text-text-primary hover:border-border-prominent transition-all duration-300 cursor-pointer"
                    onClick={() => {
                      /* Directory picker will be wired via RPC later */
                    }}
                  >
                    <LuFolderOpen className="text-lg" />
                  </button>
                </div>
              </div>

              {/* Build Selection */}
              <div>
                <SectionLabel>Build</SectionLabel>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => setBuild("latest")}
                    className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 cursor-pointer ${
                      build === "latest"
                        ? "bg-accent text-black"
                        : "bg-card border border-border-subtle text-text-muted hover:text-text-primary"
                    }`}
                  >
                    Latest (recommended)
                  </button>
                  <button
                    onClick={() => setBuild("specific")}
                    className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 cursor-pointer ${
                      build === "specific"
                        ? "bg-accent text-black"
                        : "bg-card border border-border-subtle text-text-muted hover:text-text-primary"
                    }`}
                  >
                    Specific Build
                  </button>
                </div>
              </div>

              {/* Summary */}
              <Card hoverable={false} className="mt-2">
                <SectionLabel>Summary</SectionLabel>
                <div className="grid grid-cols-2 gap-y-3 gap-x-6 mt-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-text-dim">
                      Framework
                    </p>
                    <p className="text-sm text-text-primary capitalize mt-0.5">
                      {selectedFramework}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-text-dim">
                      Version
                    </p>
                    <p className="text-sm text-text-primary font-mono mt-0.5">
                      {selectedVersion}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-text-dim">
                      Name
                    </p>
                    <p className="text-sm text-text-primary mt-0.5">
                      {workspaceName || `${selectedFramework}-dev`}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-text-dim">
                      Build
                    </p>
                    <p className="text-sm text-text-primary mt-0.5">{build}</p>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="flex justify-between items-center mt-10 pt-6 border-t border-border-subtle">
        <div>
          {step > 0 && (
            <Button variant="ghost" icon={LuArrowLeft} onClick={handleBack}>
              Back
            </Button>
          )}
        </div>
        <Button
          variant="primary"
          onClick={handleNext}
          disabled={!canNext}
          icon={step === 2 ? LuCheck : undefined}
        >
          {step === 2 ? "Create Workspace" : "Next"}
        </Button>
      </div>
    </div>
  );
}
