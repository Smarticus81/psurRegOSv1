import { useEffect, useMemo, useState } from "react";

type EvidenceType =
    | "sales_volume"
    | "complaint_record"
    | "serious_incident_record"
    | "fsca_record"
    | "pmcf_result"
    | "literature_result";

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

const REQUIRED_EVIDENCE: EvidenceType[] = [
    "sales_volume",
    "complaint_record",
    "serious_incident_record",
    "fsca_record",
    "pmcf_result",
    "literature_result",
];

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
    const [evidenceType, setEvidenceType] = useState<EvidenceType>("complaint_record");
    const [file, setFile] = useState<File | null>(null);
    const [uploadBusy, setUploadBusy] = useState(false);
    const [uploadMsg, setUploadMsg] = useState<string>("");

    // Atom counts
    const [counts, setCounts] = useState<AtomCountsResponse | null>(null);
    const [countsBusy, setCountsBusy] = useState(false);

    // Run state
    const [runBusy, setRunBusy] = useState(false);
    const [runResult, setRunResult] = useState<RunWorkflowResponse | null>(null);
    const [runMsg, setRunMsg] = useState<string>("");

    const canGoStep2 = !!psurCaseId;
    const evidenceTotalsOk = (counts?.totals?.all || 0) > 0;

    const missingRequiredEvidenceTypes = useMemo(() => {
        const byType = counts?.byType || {};
        return REQUIRED_EVIDENCE.filter((t) => (byType[t] || 0) <= 0);
    }, [counts]);

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
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <Field label="Evidence Type">
                                        <select
                                            className="w-full border rounded px-3 py-2 bg-background"
                                            value={evidenceType}
                                            onChange={(e) => setEvidenceType(e.target.value as EvidenceType)}
                                        >
                                            <option value="sales_volume">sales_volume</option>
                                            <option value="complaint_record">complaint_record</option>
                                            <option value="serious_incident_record">serious_incident_record</option>
                                            <option value="fsca_record">fsca_record</option>
                                            <option value="pmcf_result">pmcf_result</option>
                                            <option value="literature_result">literature_result</option>
                                        </select>
                                    </Field>

                                    <Field label="File (.xlsx / .csv)">
                                        <input
                                            type="file"
                                            accept=".xlsx,.csv,.xls"
                                            className="w-full border rounded px-3 py-2 bg-background"
                                            onChange={(e) => setFile(e.target.files?.[0] || null)}
                                        />
                                    </Field>
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
                                                {REQUIRED_EVIDENCE.map((t) => {
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

                                        <div className="pt-3 border-t">
                                            <a
                                                href={`/api/audit-bundles/${psurCaseId}/download`}
                                                className="inline-flex items-center gap-2 px-4 py-2 rounded bg-primary text-primary-foreground text-sm"
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                📦 Download Audit Bundle
                                            </a>
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
