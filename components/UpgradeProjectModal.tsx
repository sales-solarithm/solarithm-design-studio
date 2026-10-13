"use client";

import React, { useState } from "react";
import { doc, getDoc, updateDoc, addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { COLLECTIONS, PROJECT_FIELDS, STATUS_LABELS } from "@/src/config/schema";
import { sanitizeFirestorePayload } from "@/lib/firestoreSanitizer";
import {
  ArrowUpRight,
  X,
  Lock,
  Plus,
  Trash2,
  AlertCircle,
  Loader2
} from "lucide-react";

export interface Project {
  id: string;
  projectName?: string;
  projectNumber?: string;
  srNumber?: string;
  srNo?: number;
  clientName?: string;
  clientId?: string;
  scopeOfWork?: string;
  subService?: string;
  plantCapacity?: number;
  capacityUnit?: string;
  location?: string;
  status?: string;
  designerEmail?: string;
  assignedScopes?: Record<string, any> | Array<any>;
  [key: string]: any;
}

export interface UpgradeProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project | null;
  lockedEmail: string;
  userRole?: string;
  allAssigneesList: { email: string; name?: string; role?: string }[];
  scopesData?: { name: string; subServices?: string[] }[];
  pricingRules?: any[];
  onSuccess?: () => void;
  formatScopeDisplay?: (scope: string, scopes?: any, rules?: any) => string;
  getScopeKey?: (scopeName: string) => string;
  formatDesignerOption?: (designer: { email: string; name?: string; role?: string }) => string;
  toTitleCase?: (str: string) => string;
}

export function UpgradeProjectModal({
  isOpen,
  onClose,
  project,
  lockedEmail,
  userRole,
  allAssigneesList,
  scopesData = [],
  pricingRules = [],
  onSuccess,
  formatScopeDisplay,
  getScopeKey,
  formatDesignerOption,
  toTitleCase
}: UpgradeProjectModalProps) {
  const [newScopesList, setNewScopesList] = useState<{
    scope: string;
    designerEmail: string;
    subService?: string;
  }[]>([]);
  const [selectedScopeToAdd, setSelectedScopeToAdd] = useState("");
  const [customScopeName, setCustomScopeName] = useState("");
  const [selectedDesignerForScope, setSelectedDesignerForScope] = useState("");
  const [selectedSubServiceForScope, setSelectedSubServiceForScope] = useState("");
  const [revisedCapacity, setRevisedCapacity] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  const [prevProjectId, setPrevProjectId] = useState<string | null>(null);

  // DATA-01: Synchronize form state on project change without cascading effect renders
  if (project && project.id !== prevProjectId) {
    setPrevProjectId(project.id);
    setNewScopesList([]);
    setSelectedScopeToAdd("");
    setCustomScopeName("");
    setSelectedDesignerForScope(auth.currentUser?.email || lockedEmail || "");
    setSelectedSubServiceForScope("");
    if (project.plantCapacity !== undefined && project.plantCapacity !== null) {
      setRevisedCapacity(String(project.plantCapacity));
    } else {
      setRevisedCapacity("");
    }
    setErrorNotice(null);
  }

  if (!isOpen || !project) return null;

  // Resolve scope display helper
  const renderScopeTitle = (scope: string): string => {
    if (formatScopeDisplay) return formatScopeDisplay(scope, scopesData, pricingRules);
    return scope;
  };

  // Resolve key helper
  const resolveKey = (name: string): string => {
    if (getScopeKey) return getScopeKey(name);
    return (name || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, '_') || "scope";
  };

  // Resolve designer label helper (Directive 4: Full Name (Partner / Designer))
  const renderDesignerLabel = (designer: { email: string; name?: string; role?: string }) => {
    if (formatDesignerOption) return formatDesignerOption(designer);
    const roleUpper = (designer.role || "").toUpperCase();
    if (roleUpper === "OWNER" || roleUpper.includes("PARTNER")) {
      return `${designer.name || designer.email} (Partner / Designer)`;
    }
    return designer.name ? `${designer.name} (${designer.email})` : designer.email;
  };

  // Helper to extract historical scopes
  const historicalScopesList = (): string[] => {
    const list: string[] = [];
    if (project.assignedScopes && typeof project.assignedScopes === "object") {
      if (Array.isArray(project.assignedScopes)) {
        project.assignedScopes.forEach((s) => {
          if (typeof s === "string") list.push(s);
          else if (s && typeof s === "object") list.push(s.scope || s.name || s.title || "Scope");
        });
      } else {
        Object.keys(project.assignedScopes).forEach((k) => list.push(k));
      }
    }
    if (list.length === 0 && project.scopeOfWork) {
      project.scopeOfWork.split(",").forEach((s) => list.push(s.trim()));
    }
    return list.filter(Boolean);
  };

  const handleAddScope = () => {
    setErrorNotice(null);
    const scopeName = selectedScopeToAdd === "CUSTOM" ? customScopeName.trim() : selectedScopeToAdd.trim();
    if (!scopeName) {
      setErrorNotice("Please select or enter a scope name.");
      return;
    }
    const designer = selectedDesignerForScope || auth.currentUser?.email || lockedEmail;
    if (!designer) {
      setErrorNotice("Please assign a designer to this scope.");
      return;
    }

    const proposed = renderScopeTitle(scopeName);
    const hist = historicalScopesList().map((s) => renderScopeTitle(s).toLowerCase());
    if (hist.includes(proposed.toLowerCase())) {
      setErrorNotice(`The scope "${proposed}" is already an assigned historical scope.`);
      return;
    }

    if (newScopesList.some((s) => renderScopeTitle(s.scope).toLowerCase() === proposed.toLowerCase())) {
      setErrorNotice(`The scope "${proposed}" is already added in this upgrade session.`);
      return;
    }

    setNewScopesList((prev) => [
      ...prev,
      {
        scope: proposed,
        designerEmail: designer.trim().toLowerCase(),
        subService: selectedSubServiceForScope ? selectedSubServiceForScope.trim() : undefined
      }
    ]);

    setSelectedScopeToAdd("");
    setCustomScopeName("");
    setSelectedSubServiceForScope("");
  };

  const handleRemoveScope = (idx: number) => {
    setNewScopesList((prev) => prev.filter((_, i) => i !== idx));
  };

  // DIRECTIVE 3 (DATA-01): Support numeric zero capacity values
  const isCapacitySpecified =
    revisedCapacity !== null &&
    revisedCapacity !== undefined &&
    revisedCapacity !== "" &&
    !isNaN(Number(revisedCapacity));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorNotice(null);

    if (newScopesList.length === 0 && !isCapacitySpecified) {
      setErrorNotice("Please add at least one new scope or specify a valid revised capacity.");
      return;
    }

    setIsSaving(true);

    try {
      const updatePayload: Record<string, any> = {
        [PROJECT_FIELDS.UPDATED_AT]: serverTimestamp()
      };

      // 1. DATA-01: Update capacity if valid (strictly preserving 0 as a valid number)
      if (isCapacitySpecified) {
        const numericCapacity = Number(revisedCapacity);
        updatePayload[PROJECT_FIELDS.PLANT_CAPACITY] = numericCapacity;
      }

      // 2. Preserve historical scopes for projects without assignedScopes map
      if (!project.assignedScopes && newScopesList.length > 0) {
        const historicalKey = resolveKey(project.scopeOfWork || "preDesign");
        const historicalDesigner = project.designerEmail || lockedEmail;
        updatePayload[`assignedScopes.${historicalKey}`] = historicalDesigner;
      }

      // 3. Dot-notation merge for newly staged scopes
      const newScopeTitles: string[] = [];
      for (const item of newScopesList) {
        const scopeKey = resolveKey(item.scope);
        updatePayload[`assignedScopes.${scopeKey}`] = item.designerEmail;
        newScopeTitles.push(renderScopeTitle(item.scope));
      }

      // 4. Update top-level scopeOfWork summary string
      if (newScopeTitles.length > 0) {
        const currentScopesStr = project.scopeOfWork || "";
        const currentScopesArr = currentScopesStr
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const mergedScopes = Array.from(new Set([...currentScopesArr, ...newScopeTitles]));
        updatePayload[PROJECT_FIELDS.SCOPE_OF_WORK] = mergedScopes.join(", ");
      }

      // 5. Verification & Firestore mutation with universal payload sanitizer (DATA-02)
      const projRef = doc(db, COLLECTIONS.PROJECTS, project.id);
      const projSnap = await getDoc(projRef);
      if (!projSnap.exists()) {
        setErrorNotice("Error: Project document does not exist in the database.");
        setIsSaving(false);
        return;
      }

      const sanitizedPayload = sanitizeFirestorePayload(updatePayload);
      await updateDoc(projRef, sanitizedPayload);

      // Audit Log
      try {
        await addDoc(
          collection(db, COLLECTIONS.AUDIT_LOGS),
          sanitizeFirestorePayload({
            action: "PROJECT_SCOPE_UPGRADE",
            actor: auth.currentUser?.email || lockedEmail,
            timestamp: serverTimestamp(),
            details: {
              projectId: project.id,
              projectNumber: project.projectNumber || project.srNumber || "N/A",
              clientName: project.clientName || "N/A",
              revisedCapacity: isCapacitySpecified ? Number(revisedCapacity) : undefined,
              addedScopes: newScopesList.map((s) => ({
                scope: s.scope,
                scopeKey: resolveKey(s.scope),
                designerEmail: s.designerEmail,
                subService: s.subService || null
              }))
            }
          })
        );
      } catch (logErr) {
        console.warn("Could not write audit log for upgrade:", logErr);
      }

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      console.error("Error saving project upgrade:", err);
      setErrorNotice(err.message || "Failed to update project. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const titleHelper = toTitleCase || ((s: string) => s);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50">
      <div className="bg-white dark:bg-[#121212] rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden border-2 border-[#D4AF37] max-h-[92vh] flex flex-col transition-colors">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-[#2A2A2A] flex justify-between items-center bg-gray-50 dark:bg-[#1A1A1A] flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37]">
              <ArrowUpRight className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                Upgrade Project Scope &amp; Capacity
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {project.projectNumber || project.srNumber || "Historical Project"} • {titleHelper(project.projectName || "")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors p-1 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error banner */}
        {errorNotice && (
          <div className="mx-5 mt-4 p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-lg flex items-center gap-2 text-rose-700 dark:text-rose-400 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorNotice}</span>
          </div>
        )}

        {/* Form Content */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          {/* 1. Pre-populated Historical Project Summary */}
          <div className="bg-gray-50 dark:bg-[#1A1A1A] p-3.5 rounded-xl border border-gray-200 dark:border-[#2A2A2A]">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-gray-500 dark:text-gray-400 block font-medium">Client</span>
                <span className="font-bold text-gray-900 dark:text-white truncate block mt-0.5">
                  {titleHelper(project.clientName || "Unknown")}
                </span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400 block font-medium">Site Address</span>
                <span className="font-bold text-gray-900 dark:text-white truncate block mt-0.5">
                  {titleHelper(project.location || "On-site")}
                </span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400 block font-medium">Current Capacity</span>
                <span className="font-bold text-[#D4AF37] block mt-0.5">
                  {project.plantCapacity !== undefined && project.plantCapacity !== null
                    ? `${project.plantCapacity} kW`
                    : "N/A"}
                </span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400 block font-medium">Current Status</span>
                <span className="font-bold text-gray-900 dark:text-white block mt-0.5">
                  {STATUS_LABELS[project.status || ""] || titleHelper(project.status || "")}
                </span>
              </div>
            </div>
          </div>

          {/* 2. DATA-01: Revised Capacity Field (allows numeric 0) */}
          <div className="p-3.5 bg-gray-50 dark:bg-[#1A1A1A] rounded-xl border border-gray-200 dark:border-[#2A2A2A]">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1">
              Revised Plant Capacity ({project.capacityUnit || "kW"})
            </label>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">
              Update capacity metrics. Numeric 0 is supported for pre-construction or zero-injection revisions.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="any"
                min="0"
                value={revisedCapacity}
                onChange={(e) => setRevisedCapacity(e.target.value)}
                placeholder="Enter revised capacity (e.g., 0, 50, 100)"
                className="w-full max-w-xs p-2 bg-white dark:bg-[#121212] border border-gray-300 dark:border-[#333333] text-gray-900 dark:text-white rounded-md outline-none focus:border-[#D4AF37] text-xs sm:text-sm"
              />
              <span className="text-xs text-gray-500 dark:text-gray-400">{project.capacityUnit || "kW"}</span>
            </div>
          </div>

          {/* 3. Historical Scopes Display (Preserved & Locked) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-[#D4AF37]" />
                Historical Scopes (Preserved &amp; Locked)
              </label>
              <span className="text-[11px] text-gray-500 dark:text-gray-400">
                Cannot be overwritten or deleted
              </span>
            </div>

            <div className="space-y-1.5">
              {historicalScopesList().map((scopeItem, idx) => (
                <div
                  key={`hist-${scopeItem}-${idx}`}
                  className="flex items-center justify-between p-2.5 bg-gray-100/70 dark:bg-[#1E1E1E]/60 border border-gray-200 dark:border-[#2A2A2A] rounded-lg text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    <span className="font-semibold text-gray-800 dark:text-gray-200">
                      {renderScopeTitle(scopeItem)}
                    </span>
                  </div>
                  <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 bg-gray-200/60 dark:bg-[#2A2A2A] px-2 py-0.5 rounded">
                    Existing Package
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 4. Append New Scopes Section */}
          <div className="pt-2 border-t border-gray-200 dark:border-[#2A2A2A] space-y-3">
            <label className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 block">
              Append New Scope of Work
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Scope of Work *
                </label>
                <select
                  value={selectedScopeToAdd}
                  onChange={(e) => setSelectedScopeToAdd(e.target.value)}
                  className="w-full p-2 bg-white dark:bg-[#121212] border border-gray-300 dark:border-[#333333] text-gray-900 dark:text-white rounded-md outline-none focus:border-[#D4AF37] text-xs"
                >
                  <option value="">-- Choose New Scope --</option>
                  {(scopesData || []).map((scopeItem, sIdx) => {
                    const scope = scopeItem.name;
                    const isHistorical = historicalScopesList()
                      .map((s) => s.toLowerCase().trim())
                      .includes(scope.toLowerCase().trim());
                    return (
                      <option
                        key={`scope-opt-${scope}-${sIdx}`}
                        value={scope}
                        disabled={isHistorical}
                      >
                        {scope} {isHistorical ? "(Already Assigned)" : ""}
                      </option>
                    );
                  })}
                  <option value="CUSTOM">+ Custom Engineering Scope</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Assign Designer for this Scope *
                </label>
                <select
                  value={selectedDesignerForScope}
                  onChange={(e) => setSelectedDesignerForScope(e.target.value)}
                  className="w-full p-2 bg-white dark:bg-[#121212] border border-gray-300 dark:border-[#333333] text-gray-900 dark:text-white rounded-md outline-none focus:border-[#D4AF37] text-xs"
                >
                  {allAssigneesList.map((assignee, aIdx) => (
                    <option
                      key={`assignee-${assignee.email.toLowerCase().trim()}-${aIdx}`}
                      value={assignee.email}
                    >
                      {renderDesignerLabel(assignee)}
                      {(assignee.email || "").toLowerCase().trim() ===
                      (lockedEmail || "").toLowerCase().trim()
                        ? " (You)"
                        : ""}
                    </option>
                  ))}
                </select>
              </div>

              {selectedScopeToAdd === "CUSTOM" && (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">
                    Custom Scope Name *
                  </label>
                  <input
                    type="text"
                    value={customScopeName}
                    onChange={(e) => setCustomScopeName(e.target.value)}
                    placeholder="e.g. Detailed Structural Analysis"
                    className="w-full p-2 bg-white dark:bg-[#121212] border border-gray-300 dark:border-[#333333] text-gray-900 dark:text-white rounded-md outline-none focus:border-[#D4AF37] text-xs"
                  />
                </div>
              )}

              <div className="sm:col-span-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleAddScope}
                  className="px-3 py-1.5 bg-[#D4AF37] hover:bg-[#B5952F] text-black font-semibold rounded-md text-xs flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Stage Scope for Upgrade
                </button>
              </div>
            </div>

            {/* Staged scopes */}
            {newScopesList.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider block">
                  Staged Scopes to Append ({newScopesList.length}):
                </span>
                {newScopesList.map((staged, idx) => (
                  <div
                    key={`staged-${staged.scope}-${idx}`}
                    className="flex items-center justify-between p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs"
                  >
                    <div>
                      <span className="font-bold text-gray-900 dark:text-white">
                        {renderScopeTitle(staged.scope)}
                      </span>
                      <span className="text-gray-500 dark:text-gray-400 block text-[11px] mt-0.5">
                        Assigned to: {staged.designerEmail}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveScope(idx)}
                      className="text-rose-500 hover:text-rose-700 p-1 cursor-pointer transition-colors"
                      title="Remove staged scope"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Modal Actions */}
          <div className="pt-3 border-t border-gray-200 dark:border-[#2A2A2A] flex justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 border border-gray-300 dark:border-[#333333] text-gray-700 dark:text-gray-300 rounded-lg text-xs font-medium hover:bg-gray-100 dark:hover:bg-[#2A2A2A] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || (newScopesList.length === 0 && !isCapacitySpecified)}
              className="px-4 py-2 bg-[#D4AF37] hover:bg-[#B5952F] text-black rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-md disabled:opacity-50 cursor-pointer"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Saving Upgrade...
                </>
              ) : (
                `Confirm Upgrade`
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
export default UpgradeProjectModal;
