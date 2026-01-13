import { useEffect, useMemo, useState } from "react";

// Generate human-readable labels from evidence type slugs
function formatEvidenceType(type: string): string {
    return type
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

// Categorize evidence types for better organization
function getEvidenceCategory(type: string): string {
    if (type.includes('sales') || type.includes('distribution') || type.includes('usage')) return 'Sales & Usage';
    if (type.includes('complaint') || type.includes('feedback')) return 'Complaints & Feedback';
    if (type.includes('incident') || type.includes('vigilance')) return 'Incidents & Vigilance';
    if (type.includes('fsca') || type.includes('recall')) return 'FSCA & Recalls';
    if (type.includes('capa') || type.includes('ncr')) return 'CAPA & NCR';
    if (type.includes('pmcf') || type.includes('clinical')) return 'PMCF & Clinical';
    if (type.includes('literature') || type.includes('external')) return 'Literature & External';
    if (type.includes('device') || type.includes('manufacturer') || type.includes('regulatory') || type.includes('certificate')) return 'Device & Regulatory';
    if (type.includes('trend') || type.includes('signal')) return 'Trends & Signals';
    if (type.includes('benefit') || type.includes('risk') || type.includes('rmf') || type.includes('cer')) return 'Risk & Benefit';
    return 'Other';
}

// Get icon path for evidence type category
function getEvidenceIcon(type: string): string {
    const category = getEvidenceCategory(type);
    const icons: Record<string, string> = {
        'Sales & Usage': "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z",
        'Complaints & Feedback': "M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z",
        'Incidents & Vigilance': "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
        'FSCA & Recalls': "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
        'CAPA & NCR': "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
        'PMCF & Clinical': "M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z",
        'Literature & External': "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
        'Device & Regulatory': "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
        'Trends & Signals': "M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z",
        'Risk & Benefit': "M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3",
        'Other': "M4 6h16M4 10h16M4 14h16M4 18h16",
    };
    return icons[category] || icons['Other'];
}

// Category colors
function getCategoryColor(category: string): { bg: string; border: string; text: string } {
    const colors: Record<string, { bg: string; border: string; text: string }> = {
        'Sales & Usage': { bg: 'bg-emerald-50 dark:bg-emerald-950', border: 'border-emerald-200', text: 'text-emerald-700 dark:text-emerald-300' },
        'Complaints & Feedback': { bg: 'bg-amber-50 dark:bg-amber-950', border: 'border-amber-200', text: 'text-amber-700 dark:text-amber-300' },
        'Incidents & Vigilance': { bg: 'bg-red-50 dark:bg-red-950', border: 'border-red-200', text: 'text-red-700 dark:text-red-300' },
        'FSCA & Recalls': { bg: 'bg-orange-50 dark:bg-orange-950', border: 'border-orange-200', text: 'text-orange-700 dark:text-orange-300' },
        'CAPA & NCR': { bg: 'bg-violet-50 dark:bg-violet-950', border: 'border-violet-200', text: 'text-violet-700 dark:text-violet-300' },
        'PMCF & Clinical': { bg: 'bg-cyan-50 dark:bg-cyan-950', border: 'border-cyan-200', text: 'text-cyan-700 dark:text-cyan-300' },
        'Literature & External': { bg: 'bg-indigo-50 dark:bg-indigo-950', border: 'border-indigo-200', text: 'text-indigo-700 dark:text-indigo-300' },
        'Device & Regulatory': { bg: 'bg-slate-50 dark:bg-slate-900', border: 'border-slate-200', text: 'text-slate-700 dark:text-slate-300' },
        'Trends & Signals': { bg: 'bg-pink-50 dark:bg-pink-950', border: 'border-pink-200', text: 'text-pink-700 dark:text-pink-300' },
        'Risk & Benefit': { bg: 'bg-teal-50 dark:bg-teal-950', border: 'border-teal-200', text: 'text-teal-700 dark:text-teal-300' },
        'Other': { bg: 'bg-gray-50 dark:bg-gray-900', border: 'border-gray-200', text: 'text-gray-700 dark:text-gray-300' },
    };
    return colors[category] || colors['Other'];
}

type CreateCasePayload = {
    psurReference: string;
    version: number;
    templateId: string;
    jurisdictions: string[];
    startPeriod: string;
    endPeriod: string;
    deviceIds: number[];
    leadingDeviceId: number;
    status: string;
};

type CreateCaseResponse = {
    id: number;
    psurReference: string;
};

type UploadResponse = {
    upload: {
        id: number;
        atomsCreated: number;
    };
    summary: {
        totalRecords: number;
        validRecords: number;
        rejectedRecords: number;
        atomsCreated: number;
    };
    validationErrors?: Array<{ rowIndex: number; errors: Array<{ path: string; message: string }> }>;
};

type AtomCountsResponse = {
    psurCaseId: number;
    totals: { all: number };
    byType: Record<string, number>;
};

type RunWorkflowResponse = {
    scope: {
        templateId: string;
        jurisdictions: string[];
        deviceCode: string;
        periodStart: string;
        periodEnd: string;
    };
    case: {
        psurCaseId: number;
        psurRef: string;
        version: number;
    };
    steps: Array<{
        step: number;
        name: string;
        status: string;
        error?: string;
    }>;
};

async function api<T>(url: string, opts?: RequestInit): Promise<T> {
    const resp = await fetch(url, {
        ...opts,
        headers: {
            "Content-Type": "application/json",
            ...(opts?.headers || {}),
        },
    });

    const text = await resp.text();
    const json = text ? JSON.parse(text) : null;

    if (!resp.ok) {
        const msg = json?.message || json?.error || `HTTP ${resp.status}`;
        throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
    return json as T;
}

function todayISO(): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

export default function PsurWizard() {
    // Step state
    const [step, setStep] = useState<1 | 2 | 3>(1);

    // Case state
    const [deviceCode, setDeviceCode] = useState("JS3000X");
    const [deviceId, setDeviceId] = useState(1);
    const [templateId, setTemplateId] = useState("MDCG_2022_21_ANNEX_I");
    const [jurisdictions, setJurisdictions] = useState<string[]>(["EU_MDR"]);
    const [periodStart, setPeriodStart] = useState("2024-01-01");
    const [periodEnd, setPeriodEnd] = useState("2024-12-31");

    const [psurCaseId, setPsurCaseId] = useState<number | null>(null);
    const [psurRef, setPsurRef] = useState<string | null>(null);
    const [createBusy, setCreateBusy] = useState(false);
    const [createError, setCreateError] = useState<string>("");

    // Evidence upload state
    const [evidenceType, setEvidenceType] = useState<string>("complaint_record");
    const [file, setFile] = useState<File | null>(null);
    const [uploadBusy, setUploadBusy] = useState(false);
    const [uploadMsg, setUploadMsg] = useState<string>("");
    const [sampleLoadBusy, setSampleLoadBusy] = useState(false);

    // Atom counts
    const [counts, setCounts] = useState<AtomCountsResponse | null>(null);
    const [countsBusy, setCountsBusy] = useState(false);

    // Run state
    const [runBusy, setRunBusy] = useState(false);
    const [runResult, setRunResult] = useState<RunWorkflowResponse | null>(null);
    const [runMsg, setRunMsg] = useState<string>("");
    
    // Dynamic evidence requirements
    const [requiredEvidenceTypes, setRequiredEvidenceTypes] = useState<string[]>([]);

    useEffect(() => {
        api<{ requiredEvidenceTypes: string[] }>(`/api/templates/${templateId}/requirements`)
            .then(data => {
                if (data.requiredEvidenceTypes && data.requiredEvidenceTypes.length > 0) {
                    const types = data.requiredEvidenceTypes.sort();
                    setRequiredEvidenceTypes(types);
                    // Default to first available type when template changes
                    if (types.length > 0) {
                        setEvidenceType(types[0]);
                    }
                } else {
                    // Fallback for safety if API returns empty (shouldn't happen for valid templates)
                    const defaults = [
                        "sales_volume", "complaint_record", "serious_incident_record",
                        "fsca_record", "pmcf_result", "literature_result"
                    ];
                    setRequiredEvidenceTypes(defaults);
                    setEvidenceType(defaults[0]);
                }
            })
            .catch(err => {
                console.error("Failed to fetch template requirements", err);
                // Fallback on error
                const defaults = [
                    "sales_volume", "complaint_record", "serious_incident_record",
                    "fsca_record", "pmcf_result", "literature_result"
                ];
                setRequiredEvidenceTypes(defaults);
                setEvidenceType(defaults[0]);
            });
    }, [templateId]);

    const canGoStep2 = !!psurCaseId;
    const evidenceTotalsOk = (counts?.totals?.all || 0) > 0;

    const missingRequiredEvidenceTypes = useMemo(() => {
        const byType = counts?.byType || {};
        return requiredEvidenceTypes.filter((t) => (byType[t] || 0) <= 0);
    }, [counts, requiredEvidenceTypes]);

    // Strict gating by required evidence types
    const canGoStep3 = canGoStep2 && evidenceTotalsOk && missingRequiredEvidenceTypes.length === 0;

    // Fetch counts when case exists / after uploads
    async function refreshCounts() {
        if (!psurCaseId) return;
        setCountsBusy(true);
        try {
            const data = await api<AtomCountsResponse>(`/api/evidence/atoms/counts?psur_case_id=${psurCaseId}`);
            setCounts(data);
        } catch (e) {
            setCounts(null);
        } finally {
            setCountsBusy(false);
        }
    }

    useEffect(() => {
        if (psurCaseId) refreshCounts();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [psurCaseId]);

    async function createCase() {
        setCreateError("");
        setUploadMsg("");
        setRunResult(null);
        setCreateBusy(true);

        try {
            const refNum = `PSUR-${Date.now().toString(36).toUpperCase()}`;
            const payload: CreateCasePayload = {
                psurReference: refNum,
                version: 1,
                templateId,
                jurisdictions,
                startPeriod: periodStart,
                endPeriod: periodEnd,
                deviceIds: [deviceId],
                leadingDeviceId: deviceId,
                status: "draft",
            };

            const data = await api<CreateCaseResponse>("/api/psur-cases", {
                method: "POST",
                body: JSON.stringify(payload),
            });

            setPsurCaseId(data.id);
            setPsurRef(data.psurReference);
            setStep(2);
        } catch (e: unknown) {
            const err = e as Error;
            setCreateError(err?.message || "Failed to create case");
        } finally {
            setCreateBusy(false);
        }
    }

    async function uploadEvidence() {
        if (!psurCaseId) {
            setUploadMsg("Create a PSUR case first.");
            return;
        }
        if (!file) {
            setUploadMsg("Choose a file first.");
            return;
        }

        setUploadBusy(true);
        setUploadMsg("");

        try {
            const form = new FormData();
            form.append("psur_case_id", String(psurCaseId));
            form.append("device_code", deviceCode);
            form.append("period_start", periodStart);
            form.append("period_end", periodEnd);
            form.append("evidence_type", evidenceType);
            form.append("file", file);

            const resp = await fetch("/api/evidence/upload", {
                method: "POST",
                body: form,
            });

            const text = await resp.text();
            const json = text ? JSON.parse(text) : null;

            if (!resp.ok) {
                const msg = json?.message || json?.error || `HTTP ${resp.status}`;
                throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
            }

            const data = json as UploadResponse;

            if (data.summary.rejectedRecords > 0) {
                const sample = (data.validationErrors || [])
                    .slice(0, 3)
                    .map((e) => `Row ${e.rowIndex}: ${e.errors.map(er => er.message).join(", ")}`)
                    .join(" | ");
                setUploadMsg(`Uploaded with rejections. Accepted=${data.summary.validRecords}, Rejected=${data.summary.rejectedRecords}. ${sample}`);
            } else {
                setUploadMsg(`Uploaded OK. Atoms created: ${data.summary.atomsCreated}.`);
            }

            setFile(null);
            await refreshCounts();
        } catch (e: unknown) {
            const err = e as Error;
            setUploadMsg(`Upload failed: ${err?.message || "unknown error"}`);
        } finally {
            setUploadBusy(false);
        }
    }

    async function loadSamples() {
        if (!psurCaseId) return;
        
        setSampleLoadBusy(true);
        setUploadMsg(""); 
        
        try {
            const resp = await fetch(`/api/samples/load/${psurCaseId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ templateId })
            });
            
            const data = await resp.json();
            
            if (!resp.ok) throw new Error(data.error || "Failed to load samples");
            
            setUploadMsg(`Loaded ${data.atomsCreated} sample atoms across ${data.typesLoaded?.length || 0} types.`);
            await refreshCounts();
        } catch (e: any) {
            setUploadMsg(`Sample load failed: ${e.message}`);
        } finally {
            setSampleLoadBusy(false);
        }
    }

    async function runWorkflow() {
        if (!psurCaseId) return;

        setRunBusy(true);
        setRunMsg("");
        setRunResult(null);

        try {
            const data = await api<RunWorkflowResponse>("/api/orchestrator/run", {
                method: "POST",
                body: JSON.stringify({
                    templateId,
                    jurisdictions,
                    deviceCode,
                    deviceId,
                    periodStart,
                    periodEnd,
                    psurCaseId,
                }),
            });
            setRunResult(data);

            const failedSteps = data.steps.filter(s => s.status === "FAILED" || s.status === "BLOCKED");
            if (failedSteps.length > 0) {
                setRunMsg(`Workflow completed with issues: ${failedSteps.map(s => `${s.name} (${s.status})`).join(", ")}`);
            } else {
                setRunMsg("Workflow completed successfully!");
            }
        } catch (e: unknown) {
            const err = e as Error;
            setRunMsg(`Workflow failed: ${err?.message || "unknown error"}`);
        } finally {
            setRunBusy(false);
        }
    }

    return (
        <div className="p-6 max-w-5xl mx-auto space-y-6 overflow-y-auto h-full">
            <header className="space-y-1">
                <h1 className="text-2xl font-semibold">PSUR Wizard</h1>
                <p className="text-sm text-muted-foreground">
                    Follow the steps in order. No case → no evidence. No evidence → no PSUR.
                </p>
            </header>

            {/* Step indicator */}
            <div className="flex items-center gap-2 text-sm flex-wrap">
                <StepBadge active={step === 1} done={step > 1} label="1. Create Case" />
                <span className="text-muted-foreground">→</span>
                <StepBadge active={step === 2} done={step > 2} label="2. Upload Evidence" disabled={!canGoStep2} />
                <span className="text-muted-foreground">→</span>
                <StepBadge active={step === 3} done={false} label="3. Run PSUR" disabled={!canGoStep3} />
            </div>

            {/* STEP 1 */}
            <section className="border rounded-lg p-4 space-y-4 bg-card">
                <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold">Step 1 — Create PSUR Case</h2>
                    <button
                        className="px-3 py-1 rounded bg-primary text-primary-foreground text-sm disabled:opacity-50"
                        onClick={() => setStep(1)}
                        disabled={step === 1}
                    >
                        Open
                    </button>
                </div>

                {step === 1 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="Device Code">
                            <input
                                className="w-full border rounded px-3 py-2 bg-background"
                                value={deviceCode}
                                onChange={(e) => setDeviceCode(e.target.value)}
                            />
                        </Field>

                        <Field label="Device ID">
                            <input
                                type="number"
                                className="w-full border rounded px-3 py-2 bg-background"
                                value={deviceId}
                                onChange={(e) => setDeviceId(parseInt(e.target.value) || 1)}
                            />
                        </Field>

                        <Field label="Template">
                            <select
                                className="w-full border rounded px-3 py-2 bg-background"
                                value={templateId}
                                onChange={(e) => setTemplateId(e.target.value)}
                            >
                                <option value="MDCG_2022_21_ANNEX_I">MDCG_2022_21_ANNEX_I</option>
                                <option value="FormQAR-054_C">FormQAR-054_C</option>
                            </select>
                        </Field>

                        <Field label="Jurisdictions">
                            <div className="flex flex-wrap gap-3">
                                {["EU_MDR", "UK_MDR"].map((j) => {
                                    const checked = jurisdictions.includes(j);
                                    return (
                                        <label key={j} className="flex items-center gap-2 text-sm cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => {
                                                    setJurisdictions((prev) => (checked ? prev.filter((x) => x !== j) : [...prev, j]));
                                                }}
                                                className="rounded"
                                            />
                                            {j}
                                        </label>
                                    );
                                })}
                            </div>
                        </Field>

                        <Field label="Period Start">
                            <input
                                type="date"
                                className="w-full border rounded px-3 py-2 bg-background"
                                value={periodStart}
                                onChange={(e) => setPeriodStart(e.target.value)}
                            />
                        </Field>

                        <Field label="Period End">
                            <input
                                type="date"
                                className="w-full border rounded px-3 py-2 bg-background"
                                value={periodEnd}
                                onChange={(e) => setPeriodEnd(e.target.value)}
                            />
                        </Field>

                        <div className="md:col-span-2 flex items-center gap-3 flex-wrap">
                            <button
                                className="px-4 py-2 rounded bg-blue-600 text-white text-sm disabled:opacity-50"
                                onClick={createCase}
                                disabled={createBusy}
                            >
                                {createBusy ? "Creating..." : "Create Case"}
                            </button>

                            {psurCaseId ? (
                                <div className="text-sm text-green-600">
                                    <span className="font-medium">Created:</span> Case #{psurCaseId} ({psurRef})
                                </div>
                            ) : (
                                <div className="text-sm text-muted-foreground">No case created yet.</div>
                            )}

                            {createError && (
                                <div className="text-sm text-red-600">{createError}</div>
                            )}
                        </div>
                    </div>
                ) : (
                    <CollapsedSummary
                        lines={[
                            `Device: ${deviceCode} (ID: ${deviceId})`,
                            `Template: ${templateId}`,
                            `Jurisdictions: ${jurisdictions.join(", ") || "(none)"}`,
                            `Period: ${periodStart} → ${periodEnd}`,
                            psurCaseId ? `✓ PSUR Case ID: ${psurCaseId}` : "PSUR Case ID: (not created)",
                        ]}
                    />
                )}
            </section>

            {/* STEP 2 */}
            <section className="border rounded-lg p-4 space-y-4 bg-card">
                <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold">Step 2 — Upload Evidence</h2>
                    <button
                        className="px-3 py-1 rounded bg-primary text-primary-foreground text-sm disabled:opacity-50"
                        onClick={() => canGoStep2 && setStep(2)}
                        disabled={!canGoStep2 || step === 2}
                    >
                        Open
                    </button>
                </div>

                {step === 2 ? (
                    <div className="space-y-4">
                        {!psurCaseId ? (
                            <div className="text-sm text-red-600">Create a case in Step 1 first.</div>
                        ) : (
                            <>
                                {/* Evidence Type Card Selector */}
                                <div className="space-y-3">
                                    <div className="text-sm font-medium">Select Evidence Type</div>
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[400px] overflow-y-auto pr-2">
                                        {requiredEvidenceTypes.map((type) => {
                                            const label = formatEvidenceType(type);
                                            const category = getEvidenceCategory(type);
                                            const icon = getEvidenceIcon(type);
                                            const colors = getCategoryColor(category);
                                            
                                            const isSelected = evidenceType === type;
                                            const atomCount = counts?.byType?.[type] || 0;
                                            const hasUploaded = atomCount > 0;
                                            
                                            return (
                                                <button
                                                    key={type}
                                                    type="button"
                                                    onClick={() => setEvidenceType(type)}
                                                    className={`
                                                        relative p-3 rounded-lg border-2 text-left transition-all h-full flex flex-col
                                                        hover:shadow-md
                                                        ${isSelected 
                                                            ? `border-primary bg-primary/5 ring-2 ring-primary/20` 
                                                            : hasUploaded 
                                                                ? `${colors.border} ${colors.bg}` 
                                                                : 'border-border bg-card hover:bg-accent/50'
                                                        }
                                                    `}
                                                >
                                                    {/* Status indicator */}
                                                    {hasUploaded && (
                                                        <div className="absolute top-2 right-2">
                                                            <div className={`flex items-center gap-1 text-xs font-medium ${colors.text}`}>
                                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                                </svg>
                                                                {atomCount}
                                                            </div>
                                                        </div>
                                                    )}
                                                    
                                                    {/* Icon */}
                                                    <div className={`
                                                        w-8 h-8 rounded-md flex items-center justify-center mb-2 shrink-0
                                                        ${isSelected 
                                                            ? 'bg-primary text-primary-foreground' 
                                                            : hasUploaded
                                                                ? 'bg-background/50'
                                                                : 'bg-muted text-muted-foreground'
                                                        }
                                                    `}>
                                                        <svg className={`w-4 h-4 ${hasUploaded && !isSelected ? colors.text : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
                                                        </svg>
                                                    </div>
                                                    
                                                    {/* Label */}
                                                    <div className={`font-medium text-xs leading-tight mb-1 ${isSelected ? 'text-foreground' : ''}`}>
                                                        {label}
                                                    </div>
                                                    
                                                    {/* Category */}
                                                    <div className="text-[10px] text-muted-foreground mt-auto pt-1">
                                                        {category}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                    
                                    {/* Selected type info */}
                                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                                        <div className="w-8 h-8 rounded-md bg-background flex items-center justify-center border border-border">
                                            <svg className="w-4 h-4 text-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d={getEvidenceIcon(evidenceType)} />
                                            </svg>
                                        </div>
                                        <div>
                                            <div className="font-medium text-sm text-foreground">
                                                Uploading: {formatEvidenceType(evidenceType)}
                                            </div>
                                            <div className="text-xs text-muted-foreground flex items-center gap-2">
                                                <span>{getEvidenceCategory(evidenceType)}</span>
                                                <span className="w-1 h-1 rounded-full bg-border"></span>
                                                <code className="font-mono text-[10px]">{evidenceType}</code>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* File upload */}
                                <div className="space-y-2">
                                    <Field label="Select File (.xlsx / .csv)">
                                        <input
                                            type="file"
                                            accept=".xlsx,.csv,.xls"
                                            className="w-full border rounded px-3 py-2 bg-background file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-950 dark:file:text-blue-300"
                                            onChange={(e) => setFile(e.target.files?.[0] || null)}
                                        />
                                    </Field>
                                    {file && (
                                        <div className="text-sm text-muted-foreground">
                                            Selected: <span className="font-medium">{file.name}</span> ({(file.size / 1024).toFixed(1)} KB)
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center gap-3 flex-wrap">
                                    <button
                                        className="px-4 py-2 rounded bg-blue-600 text-white text-sm disabled:opacity-50"
                                        onClick={uploadEvidence}
                                        disabled={uploadBusy || !file}
                                    >
                                        {uploadBusy ? "Uploading..." : "Upload Evidence"}
                                    </button>

                                    <button
                                        className="px-3 py-2 rounded border text-sm disabled:opacity-50"
                                        onClick={refreshCounts}
                                        disabled={countsBusy}
                                    >
                                        {countsBusy ? "Refreshing..." : "Refresh Counts"}
                                    </button>

                                    <button
                                        className="px-3 py-2 rounded border border-primary/20 bg-primary/5 text-primary text-sm disabled:opacity-50 hover:bg-primary/10"
                                        onClick={loadSamples}
                                        disabled={sampleLoadBusy || uploadBusy}
                                        title="Automatically populate case with sample data for all required evidence types"
                                    >
                                        {sampleLoadBusy ? "Loading Samples..." : "⚡ Load Sample Data"}
                                    </button>

                                    {uploadMsg && <div className="text-sm">{uploadMsg}</div>}
                                </div>

                                <div className="border rounded-lg p-4 bg-muted/30">
                                    <div className="text-sm font-medium mb-3">Evidence Atom Counts (Case #{psurCaseId})</div>
                                    {!counts ? (
                                        <div className="text-sm text-muted-foreground">No counts loaded. Click "Refresh Counts".</div>
                                    ) : (
                                        <div className="space-y-3">
                                            <div className="text-lg font-semibold">Total atoms: {counts.totals.all}</div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                                {requiredEvidenceTypes.map((t) => {
                                                    const count = counts.byType?.[t] || 0;
                                                    return (
                                                        <div
                                                            key={t}
                                                            className={`flex items-center justify-between border rounded px-3 py-2 ${count > 0 ? 'bg-green-50 dark:bg-green-950 border-green-200' : 'bg-red-50 dark:bg-red-950 border-red-200'}`}
                                                        >
                                                            <span className="text-sm">{t}</span>
                                                            <span className={`font-medium ${count > 0 ? 'text-green-600' : 'text-red-600'}`}>{count}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            {missingRequiredEvidenceTypes.length > 0 ? (
                                                <div className="mt-3 p-3 rounded bg-amber-50 dark:bg-amber-950 border border-amber-200 text-sm text-amber-700 dark:text-amber-300">
                                                    ⚠️ Missing required evidence types: {missingRequiredEvidenceTypes.join(", ")}
                                                </div>
                                            ) : (
                                                <div className="mt-3 p-3 rounded bg-green-50 dark:bg-green-950 border border-green-200 text-sm text-green-700 dark:text-green-300">
                                                    ✓ All required evidence types are present.
                                                </div>
                                            )}

                                            <div className="mt-4">
                                                <button
                                                    className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm disabled:opacity-50"
                                                    onClick={() => setStep(3)}
                                                    disabled={!canGoStep3}
                                                >
                                                    Continue to Step 3 →
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                ) : (
                    <CollapsedSummary
                        lines={[
                            psurCaseId ? `PSUR Case ID: ${psurCaseId}` : "PSUR Case ID: (none)",
                            counts ? `Total atoms: ${counts.totals.all}` : "Total atoms: (unknown)",
                            missingRequiredEvidenceTypes.length > 0
                                ? `⚠️ Missing: ${missingRequiredEvidenceTypes.join(", ")}`
                                : "✓ All required evidence present",
                        ]}
                    />
                )}
            </section>

            {/* STEP 3 */}
            <section className="border rounded-lg p-4 space-y-4 bg-card">
                <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold">Step 3 — Run PSUR + Export Audit Bundle</h2>
                    <button
                        className="px-3 py-1 rounded bg-primary text-primary-foreground text-sm disabled:opacity-50"
                        onClick={() => canGoStep3 && setStep(3)}
                        disabled={!canGoStep3 || step === 3}
                    >
                        Open
                    </button>
                </div>

                {step === 3 ? (
                    <div className="space-y-4">
                        {!canGoStep3 ? (
                            <div className="text-sm text-red-600">
                                Complete Step 1 and Step 2 (including all required evidence types) before running PSUR.
                            </div>
                        ) : (
                            <>
                                <div className="p-4 rounded-lg bg-muted/30 border">
                                    <div className="text-sm font-medium mb-2">Ready to generate PSUR</div>
                                    <div className="text-sm text-muted-foreground space-y-1">
                                        <div>Case: #{psurCaseId} ({psurRef})</div>
                                        <div>Template: {templateId}</div>
                                        <div>Jurisdictions: {jurisdictions.join(", ")}</div>
                                        <div>Period: {periodStart} → {periodEnd}</div>
                                        <div>Evidence atoms: {counts?.totals.all || 0}</div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 flex-wrap">
                                    <button
                                        className="px-6 py-3 rounded bg-blue-600 text-white font-medium disabled:opacity-50"
                                        onClick={runWorkflow}
                                        disabled={runBusy}
                                    >
                                        {runBusy ? "Running Workflow..." : "🚀 Run PSUR Workflow"}
                                    </button>

                                    {runMsg && (
                                        <div className={`text-sm ${runMsg.includes("failed") ? "text-red-600" : "text-green-600"}`}>
                                            {runMsg}
                                        </div>
                                    )}
                                </div>

                                {runResult && (
                                    <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                                        <div className="text-sm font-medium">Workflow Result</div>
                                        <div className="text-sm">Case: #{runResult.case.psurCaseId} ({runResult.case.psurRef})</div>

                                        <div className="space-y-2">
                                            <div className="text-sm font-medium">Steps</div>
                                            <div className="space-y-1">
                                                {runResult.steps.map((s) => (
                                                    <div
                                                        key={s.step}
                                                        className={`flex items-center justify-between text-sm px-3 py-2 rounded border ${s.status === "COMPLETED" ? "bg-green-50 dark:bg-green-950 border-green-200" :
                                                                s.status === "FAILED" ? "bg-red-50 dark:bg-red-950 border-red-200" :
                                                                    s.status === "BLOCKED" ? "bg-amber-50 dark:bg-amber-950 border-amber-200" :
                                                                        "bg-muted"
                                                            }`}
                                                    >
                                                        <span>Step {s.step}: {s.name}</span>
                                                        <span className="font-medium">{s.status}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="pt-3 border-t space-y-3">
                                            <div className="text-sm font-medium">Download PSUR Documents</div>
                                            <div className="flex flex-wrap gap-2">
                                                <a
                                                    href={`/api/psur-cases/${psurCaseId}/psur.docx`}
                                                    className="inline-flex items-center gap-2 px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
                                                    download
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                    </svg>
                                                    Word Document (.docx)
                                                </a>
                                                <a
                                                    href={`/api/psur-cases/${psurCaseId}/psur.md`}
                                                    className="inline-flex items-center gap-2 px-4 py-2 rounded bg-gray-600 hover:bg-gray-700 text-white text-sm font-medium"
                                                    download
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                                    </svg>
                                                    Markdown (.md)
                                                </a>
                                                <a
                                                    href={`/api/audit-bundles/${psurCaseId}/download`}
                                                    className="inline-flex items-center gap-2 px-4 py-2 rounded bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium"
                                                    target="_blank"
                                                    rel="noreferrer"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                                                    </svg>
                                                    Full Audit Bundle (.zip)
                                                </a>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                ) : (
                    <CollapsedSummary
                        lines={[
                            canGoStep3 ? "✓ Ready to run." : "⏳ Complete previous steps first.",
                            runResult?.case.psurCaseId ? `Generated: Case #${runResult.case.psurCaseId}` : "Audit bundle: (not generated)",
                        ]}
                    />
                )}
            </section>

            <footer className="text-xs text-muted-foreground pt-4 border-t">
                RegulatoryOS PSUR Engine • {todayISO()}
            </footer>
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1.5">
            <label className="text-sm font-medium">{label}</label>
            {children}
        </div>
    );
}

function StepBadge({
    label,
    active,
    done,
    disabled,
}: {
    label: string;
    active: boolean;
    done: boolean;
    disabled?: boolean;
}) {
    const base = "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors";
    const cls = disabled
        ? `${base} opacity-50 bg-muted text-muted-foreground`
        : active
            ? `${base} bg-blue-600 text-white border-blue-600`
            : done
                ? `${base} bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300`
                : `${base} bg-muted text-muted-foreground`;

    return <span className={cls}>{label}</span>;
}

function CollapsedSummary({ lines }: { lines: string[] }) {
    return (
        <div className="text-sm text-muted-foreground space-y-1">
            {lines.map((l, i) => (
                <div key={i}>{l}</div>
            ))}
        </div>
    );
}
