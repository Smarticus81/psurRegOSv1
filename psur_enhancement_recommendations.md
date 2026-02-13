## EXECUTIVE SUMMARY

Your complaint data is **structurally excellent** (100% completeness on critical fields, standardized investigation findings), but the current PSUR generation system likely produces **superficial analytics** due to three critical gaps:

1. **No IMDRF classification layer** (internal codes don't map to regulatory taxonomy)
2. **Unconfirmed complaints dominate** (73.3% unconfirmed, only 26.7% verified product defects)
3. **Weak root cause analysis** (86% inconclusive or "not confirmed")

These gaps prevent your agents from generating the **deep, data-driven insights** you seek. Below are prioritized enhancements with implementation guidance.

---

## PART 1: DATA PIPELINE ENHANCEMENTS

### 1.1 IMDRF Classification Engine

**Problem:** Your `Symptom Code` field uses internal taxonomy (`brokenordamagedcomponent`, `electrical`, `productsticking`), which doesn't align with IMDRF Annex A required in MDCG 2022-21 PSURs.

**Solution:** Create a two-stage classification pipeline:

#### Stage 1: Symptom Code → IMDRF Mapping Table
```sql
-- server/src/db/schema/imdrf_mappings.ts
CREATE TABLE symptom_to_imdrf_mapping (
    id UUID PRIMARY KEY,
    symptom_code VARCHAR(100) NOT NULL,  -- Your internal code
    imdrf_harm_code VARCHAR(10),         -- H0201, H0301, etc.
    imdrf_harm_term TEXT,                -- "Thermal Injury/Burn"
    imdrf_mdp_code VARCHAR(10),          -- 2003, 2101, etc.
    imdrf_mdp_term TEXT,                 -- "Mechanical Problem - Break/Fracture"
    severity_default VARCHAR(20),        -- "Serious", "Non-serious"
    requires_adjudication BOOLEAN,       -- TRUE if context-dependent
    created_at TIMESTAMP DEFAULT NOW()
);

-- Seed data based on analysis
INSERT INTO symptom_to_imdrf_mapping VALUES
('uuid-1', 'brokenordamagedcomponent', NULL, 'No Health Consequence', '2003', 'Mechanical Problem - Break/Fracture', 'Non-serious', FALSE),
('uuid-2', 'electrical', 'H0201', 'Thermal Injury/Burn', '2101', 'Electrical Problem', 'Serious', TRUE),
('uuid-3', 'burn', 'H0201', 'Thermal Injury/Burn', '2104', 'Thermal Problem', 'Serious', TRUE),
('uuid-4', 'productsticking', NULL, 'Procedural Complication', '2009', 'Mechanical Problem - Sticking/Jamming', 'Non-serious', FALSE),
('uuid-5', 'shippingdamage', NULL, 'No Health Consequence', '3010', 'Packaging Problem', 'Non-serious', FALSE);
```

#### Stage 2: AI-Powered Context-Aware Classification
For cases with `requires_adjudication = TRUE`, run an LLM agent to determine actual harm:

```typescript
// server/src/agents/ingestion/IMDRFClassificationAgent.ts
export class IMDRFClassificationAgent extends BaseAgent<
    { complaint: ComplaintRecord; mapping: IMDRFMapping },
    { harm_code: string | null; harm_term: string; mdp_code: string; mdp_term: string; confidence: number }
> {
    protected async execute(input) {
        const { complaint, mapping } = input;
        
        const prompt = `
You are a medical device regulatory expert. Classify this complaint using IMDRF Annex A terminology.

COMPLAINT DETAILS:
- Symptom: ${complaint.symptomCode}
- Description: ${complaint.description}
- Patient Involvement: ${complaint.patientInvolvement}
- Additional Medical Attention: ${complaint.additionalMedicalAttention}
- Investigation Findings: ${complaint.investigationFindings}

DEFAULT MAPPING (may be overridden based on context):
- Harm: ${mapping.imdrf_harm_term || 'None'}
- MDP: ${mapping.imdrf_mdp_term}

DECISION REQUIRED:
1. Did this complaint result in actual patient harm? (Y/N)
2. If yes, what specific harm occurred? Use IMDRF H-codes (H0201=Thermal, H0301=Mechanical, etc.)
3. If no, use NULL for harm_code and "No Health Consequence" for harm_term
4. Confirm or override the MDP code based on actual failure mode

Respond in JSON:
{
    "harm_code": "H0201" or null,
    "harm_term": "Thermal Injury/Burn" or "No Health Consequence",
    "mdp_code": "2104",
    "mdp_term": "Thermal Problem",
    "confidence": 0.95,
    "reasoning": "Patient involvement was 'n/a' and investigation confirmed electrode overheated but was not used on patient"
}
`;

        return await this.invokeLLMForJSON(prompt, input);
    }
}
```

**Impact:** Every complaint gets IMDRF codes required for PSUR Table 5/6, enabling proper regulatory classification.

---

### 1.2 Confirmed vs. Unconfirmed Complaint Separation

**Problem:** 73.3% of your complaints are unconfirmed (investigation couldn't verify product defect). Current PSUR calculations likely don't distinguish these, inflating complaint rates.

**Solution:** Modify complaint rate calculations to report **three tiers**:

```typescript
// server/src/psur/engines/complaintsEngine.ts
export interface ComplaintRateAnalysis {
    total_complaints: number;
    total_sales: number;
    
    // Tier 1: Confirmed product defects
    confirmed_complaints: number;
    confirmed_rate: number;  // confirmed / sales * 100
    
    // Tier 2: Unconfirmed (investigation inconclusive)
    unconfirmed_complaints: number;
    unconfirmed_rate: number;
    
    // Tier 3: External causes (shipping damage, user error)
    external_cause_complaints: number;
    external_cause_rate: number;
    
    // Combined rate (for comparison to previous PSURs)
    combined_rate: number;
}

export function calculateComplaintRates(
    complaints: ComplaintRecord[],
    sales: SalesRecord[],
    period: DateRange
): ComplaintRateAnalysis {
    const salesInPeriod = sales.filter(s => isInRange(s.shipDate, period));
    const totalSales = salesInPeriod.reduce((sum, s) => sum + s.quantity, 0);
    
    const complaintsInPeriod = complaints.filter(c => isInRange(c.notificationDate, period));
    
    const confirmed = complaintsInPeriod.filter(c => 
        c.complaintConfirmed?.toLowerCase() === 'yes'
    );
    
    const unconfirmed = complaintsInPeriod.filter(c => 
        c.complaintConfirmed?.toLowerCase() === 'no' &&
        !isExternalCause(c)
    );
    
    const externalCause = complaintsInPeriod.filter(c => isExternalCause(c));
    
    return {
        total_complaints: complaintsInPeriod.length,
        total_sales: totalSales,
        confirmed_complaints: confirmed.length,
        confirmed_rate: (confirmed.length / totalSales) * 100,
        unconfirmed_complaints: unconfirmed.length,
        unconfirmed_rate: (unconfirmed.length / totalSales) * 100,
        external_cause_complaints: externalCause.length,
        external_cause_rate: (externalCause.length / totalSales) * 100,
        combined_rate: (complaintsInPeriod.length / totalSales) * 100
    };
}

function isExternalCause(complaint: ComplaintRecord): boolean {
    const findings = complaint.investigationFindings?.toLowerCase() || '';
    const corrective = complaint.correctiveActions?.toLowerCase() || '';
    
    return (
        findings.includes('damage incurred in transit') ||
        findings.includes('shipping damage') ||
        corrective.includes('user error') ||
        corrective.includes('handling error')
    );
}
```

**Enhanced PSUR Narrative:**
```
During the 12-month reporting period, 15 complaints were received regarding Fischer 
Cone Biopsy Excisor products, representing a combined complaint rate of 0.30% (15 
complaints per 5,000 units sold).

Of these, 4 (26.7%) were CONFIRMED as product defects through laboratory investigation, 
yielding a confirmed product defect rate of 0.08%. The remaining 11 complaints (73.3%) 
could not be verified as product-related issues; investigations revealed:
- 2 complaints (13.3%) attributed to shipping damage (external cause)
- 9 complaints (60.0%) were unconfirmed due to product not being returned or inability 
  to replicate the reported condition

When assessing safety performance, the confirmed defect rate of 0.08% is the most 
clinically relevant metric, as it represents actual product quality issues. This rate 
is below the maximum acceptable rate of 0.15% established in the Risk Management File 
(RMF v1.2, RACT Row 5).

For regulatory comparison purposes, the combined complaint rate of 0.30% is reported 
in Table 7. However, the benefit-risk determination is based on the confirmed defect 
rate of 0.08%, which demonstrates acceptable product performance.
```

**Impact:** This creates **regulatory defensibility** by showing you distinguish real product issues from noise.

---

### 1.3 Root Cause Enrichment via NLP Clustering

**Problem:** 86% of your root cause analyses are inconclusive ("not confirmed" or "unknown"). This limits your ability to:
- Identify systemic design/manufacturing issues
- Demonstrate corrective action effectiveness
- Update risk assessments with real-world data

**Solution:** Even when individual complaints can't be root-caused, **aggregate pattern analysis** can reveal trends:

```typescript
// server/src/agents/analysis/RootCauseClusteringAgent.ts
export class RootCauseClusteringAgent extends BaseAgent<
    { complaints: ComplaintRecord[]; period: DateRange },
    { clusters: ComplaintCluster[]; insights: string[] }
> {
    protected async execute(input) {
        const { complaints } = input;
        
        // Extract investigation findings and corrective actions
        const narratives = complaints.map(c => ({
            id: c.id,
            text: `${c.description} ${c.investigationFindings} ${c.correctiveActions}`,
            symptomCode: c.symptomCode,
            productNumber: c.productNumber,
            lotNumber: c.lotNumber
        }));
        
        const prompt = `
You are analyzing complaint patterns to identify root cause themes even when individual 
complaints are inconclusive.

COMPLAINT NARRATIVES (${narratives.length} total):
${narratives.map((n, i) => `
${i + 1}. Product: ${n.productNumber} | Symptom: ${n.symptomCode}
   Text: ${n.text.substring(0, 500)}...
`).join('\n')}

TASK: Identify common themes, failure modes, or patterns across complaints.

Look for:
1. **Component-specific failures** (e.g., "wire fried" appears in multiple electrical complaints)
2. **Lot-specific patterns** (same lot number across multiple complaints)
3. **User environment factors** (e.g., all "electrical" complaints mention non-Cooper generators)
4. **Temporal clustering** (sudden spike in certain complaint types)

Respond with JSON:
{
    "clusters": [
        {
            "theme": "Electrical overheating with non-approved generators",
            "complaint_ids": ["2024-06-0000097", "2024-..."],
            "pattern_description": "5 complaints mention wire frying or overheating when used with non-CooperSurgical generators (Conmed 5000, ValleyLab FT10). No complaints with approved generators.",
            "root_cause_hypothesis": "Electrode impedance mismatch with high-frequency generators designed for different electrode types",
            "recommended_action": "Update IFU to specify approved generator list. Consider design modification for broader compatibility."
        }
    ],
    "insights": [
        "Broken/damaged component complaints (33%) predominantly involve product 900-151",
        "No geographical clustering detected - complaints evenly distributed",
        "Patient involvement rate (73%) high but zero additional medical attention - suggests near-misses"
    ]
}
`;

        const result = await this.invokeLLMForJSON<{clusters: ComplaintCluster[], insights: string[]}>(
            prompt,
            input
        );
        
        return result;
    }
}

interface ComplaintCluster {
    theme: string;
    complaint_ids: string[];
    pattern_description: string;
    root_cause_hypothesis: string;
    recommended_action: string;
}
```

**Enhanced PSUR Section E:**
```
Individual root cause determination was inconclusive for 11/15 complaints due to product 
not being returned or inability to replicate conditions. However, aggregate pattern analysis 
across the complaint population revealed the following insights:

**Cluster 1: Electrical Overheating (5 complaints, 33% of total)**
A common theme emerged across 5 complaints (2024-06-0000097, ...) describing electrode 
"wire frying" or "snapping" during use. Investigation identified that all 5 cases involved 
electrosurgical generators not specifically validated by CooperSurgical (Conmed 5000, n=3; 
ValleyLab FT10, n=2). No similar complaints were reported with approved generators.

Root Cause Hypothesis: Electrode impedance mismatch with high-frequency generators 
designed for different electrode specifications may cause overcurrent conditions.

Corrective Action: CAPA-2024-018 initiated to:
1. Update IFU (Rev K) to explicitly list validated generator models
2. Conduct compatibility testing with common non-approved generators
3. Assess feasibility of design modification for broader compatibility

**Cluster 2: Broken Components - Product 900-151 (6 complaints, 40% of total)**
Product 900-151 (Medium Fischer Cone) accounts for 6/15 complaints, disproportionate to 
its 28% market share. Of these, 3 were confirmed as breakage during handling/setup.

Root Cause Hypothesis: Potential handling sensitivity in Medium size variant.

Corrective Action: Manufacturing lot review (lots 550005803, ...) found no process 
deviations. User technique training materials being developed (Q2 2025).
```

**Impact:** Transforms "data gaps" into **actionable insights** for Section G (CAPA) and Section H (Risk Management).

---

## PART 2: STATISTICAL RIGOR ENHANCEMENTS

### 2.1 Control Chart Generation with UCL/LCL

**Problem:** Your instructions mention UCL calculations, but example PSURs don't show control charts or statistical trending.

**Solution:** Implement **time-series control chart engine** for Section E:

```typescript
// server/src/psur/engines/statisticalTrendingEngine.ts
export interface ControlChartData {
    time_periods: string[];  // ['2023-Q1', '2023-Q2', ...]
    complaint_rates: number[];  // [0.12, 0.08, ...]
    mean_rate: number;
    std_dev: number;
    ucl: number;  // mean + 3*sigma
    lcl: number;  // mean - 3*sigma
    current_rate: number;
    trend_status: 'In Control' | 'Exceeds UCL' | 'Below LCL' | 'Insufficient Data';
    statistical_significance: boolean;
}

export function generateControlChart(
    complaints: ComplaintRecord[],
    sales: SalesRecord[],
    currentPeriod: DateRange,
    baselinePeriods: DateRange[]  // At least 3-6 prior periods
): ControlChartData {
    // Calculate rates for each period
    const rates = baselinePeriods.map(period => {
        const periodComplaints = complaints.filter(c => isInRange(c.notificationDate, period));
        const periodSales = sales.filter(s => isInRange(s.shipDate, period))
            .reduce((sum, s) => sum + s.quantity, 0);
        return periodSales > 0 ? (periodComplaints.length / periodSales) * 100 : 0;
    });
    
    // Add current period
    const currentComplaints = complaints.filter(c => isInRange(c.notificationDate, currentPeriod));
    const currentSales = sales.filter(s => isInRange(s.shipDate, currentPeriod))
        .reduce((sum, s) => sum + s.quantity, 0);
    const currentRate = currentSales > 0 ? (currentComplaints.length / currentSales) * 100 : 0;
    
    // Calculate statistical parameters
    const mean = rates.reduce((sum, r) => sum + r, 0) / rates.length;
    const variance = rates.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / rates.length;
    const stdDev = Math.sqrt(variance);
    
    const ucl = mean + (3 * stdDev);
    const lcl = Math.max(0, mean - (3 * stdDev));  // Can't have negative rate
    
    let trendStatus: ControlChartData['trend_status'];
    if (rates.length < 3) {
        trendStatus = 'Insufficient Data';
    } else if (currentRate > ucl) {
        trendStatus = 'Exceeds UCL';
    } else if (currentRate < lcl) {
        trendStatus = 'Below LCL';
    } else {
        trendStatus = 'In Control';
    }
    
    return {
        time_periods: [...baselinePeriods.map(p => p.label), currentPeriod.label],
        complaint_rates: [...rates, currentRate],
        mean_rate: mean,
        std_dev: stdDev,
        ucl: ucl,
        lcl: lcl,
        current_rate: currentRate,
        trend_status: trendStatus,
        statistical_significance: trendStatus === 'Exceeds UCL'
    };
}
```

**Enhanced Chart Agent:**
```typescript
// server/src/agents/runtime/charts/ComplaintTrendChartAgent.ts
export class ComplaintTrendChartAgent extends BaseChartAgent {
    protected async generateChart(data: ControlChartData): Promise<string> {
        // Generate pure SVG (no dependencies per your architecture)
        const width = 800;
        const height = 400;
        const margin = { top: 40, right: 40, bottom: 60, left: 60 };
        
        const xScale = this.createLinearScale(
            [0, data.time_periods.length - 1],
            [margin.left, width - margin.right]
        );
        
        const maxRate = Math.max(...data.complaint_rates, data.ucl);
        const yScale = this.createLinearScale(
            [0, maxRate * 1.1],
            [height - margin.bottom, margin.top]
        );
        
        let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
        
        // Title
        svg += `<text x="${width/2}" y="20" text-anchor="middle" font-size="16" font-weight="bold">
                  Complaint Rate Trend Analysis (3-Sigma Control Chart)
                </text>`;
        
        // UCL line (red dashed)
        svg += `<line x1="${margin.left}" y1="${yScale(data.ucl)}" 
                      x2="${width - margin.right}" y2="${yScale(data.ucl)}" 
                      stroke="red" stroke-width="2" stroke-dasharray="5,5"/>`;
        svg += `<text x="${width - margin.right + 5}" y="${yScale(data.ucl)}" 
                      font-size="12" fill="red">UCL: ${data.ucl.toFixed(2)}%</text>`;
        
        // Mean line (green)
        svg += `<line x1="${margin.left}" y1="${yScale(data.mean_rate)}" 
                      x2="${width - margin.right}" y2="${yScale(data.mean_rate)}" 
                      stroke="green" stroke-width="2"/>`;
        svg += `<text x="${width - margin.right + 5}" y="${yScale(data.mean_rate)}" 
                      font-size="12" fill="green">Mean: ${data.mean_rate.toFixed(2)}%</text>`;
        
        // LCL line (red dashed)
        if (data.lcl > 0) {
            svg += `<line x1="${margin.left}" y1="${yScale(data.lcl)}" 
                          x2="${width - margin.right}" y2="${yScale(data.lcl)}" 
                          stroke="red" stroke-width="2" stroke-dasharray="5,5"/>`;
        }
        
        // Data points and line
        const points = data.complaint_rates.map((rate, i) => ({
            x: xScale(i),
            y: yScale(rate)
        }));
        
        // Line connecting points
        const pathD = `M ${points.map(p => `${p.x},${p.y}`).join(' L ')}`;
        svg += `<path d="${pathD}" fill="none" stroke="blue" stroke-width="2"/>`;
        
        // Data points as circles
        points.forEach((point, i) => {
            const isCurrentPeriod = i === points.length - 1;
            const exceedsUCL = data.complaint_rates[i] > data.ucl;
            
            svg += `<circle cx="${point.x}" cy="${point.y}" r="5" 
                           fill="${exceedsUCL ? 'red' : isCurrentPeriod ? 'orange' : 'blue'}"/>`;
            
            // Label
            svg += `<text x="${point.x}" y="${height - margin.bottom + 20}" 
                          text-anchor="middle" font-size="10">
                      ${data.time_periods[i]}
                    </text>`;
            svg += `<text x="${point.x}" y="${point.y - 10}" 
                          text-anchor="middle" font-size="10">
                      ${data.complaint_rates[i].toFixed(2)}%
                    </text>`;
        });
        
        // Y-axis
        svg += `<line x1="${margin.left}" y1="${margin.top}" 
                      x2="${margin.left}" y2="${height - margin.bottom}" 
                      stroke="black"/>`;
        svg += `<text x="${margin.left - 40}" y="${height/2}" 
                      text-anchor="middle" transform="rotate(-90 ${margin.left - 40} ${height/2})" 
                      font-size="12">Complaint Rate (%)</text>`;
        
        // X-axis
        svg += `<line x1="${margin.left}" y1="${height - margin.bottom}" 
                      x2="${width - margin.right}" y2="${height - margin.bottom}" 
                      stroke="black"/>`;
        svg += `<text x="${width/2}" y="${height - 5}" text-anchor="middle" font-size="12">
                  Reporting Period
                </text>`;
        
        svg += `</svg>`;
        
        return svg;
    }
}
```

**Enhanced PSUR Narrative:**
```
**Statistical Trend Analysis (Figure 3):**

A 3-sigma control chart was generated using 6 baseline periods (Q1-2023 through Q2-2024) 
to establish statistical control limits for complaint rate trending. The analysis reveals:

- Baseline mean complaint rate: 0.24% (σ = 0.06%)
- Upper Control Limit (UCL): 0.42% (mean + 3σ)
- Lower Control Limit (LCL): 0.06% (mean - 3σ)
- Current period rate: 0.30%

**Interpretation:** The current period complaint rate of 0.30% falls within the established 
control limits (below UCL of 0.42%), indicating the observed rate is within expected 
statistical variation. No statistically significant increase has occurred.

The slight uptick from the previous period (0.22% → 0.30%) represents an increase of 0.08 
percentage points, which is less than one standard deviation (0.06%) and therefore not 
indicative of a systematic change in product quality or safety performance.

**Conclusion:** Complaint rate trending remains "In Control" per Shewhart control chart 
methodology. Continued monitoring will be performed per PMS Plan Section 4.2.
```

**Impact:** Demonstrates **statistical sophistication** that distinguishes noise from signals.

---

### 2.2 Segmentation Analysis (Regional, Temporal, Lot-Specific)

**Problem:** Your data has rich segmentation potential (region, lot number, time period) but PSURs likely present only aggregate rates.

**Solution:** Multi-dimensional segmentation engine:

```typescript
// server/src/psur/engines/segmentationEngine.ts
export interface SegmentedComplaintAnalysis {
    by_region: Map<string, ComplaintMetrics>;
    by_product: Map<string, ComplaintMetrics>;
    by_lot: Map<string, ComplaintMetrics>;
    by_quarter: Map<string, ComplaintMetrics>;
    significant_segments: SegmentAlert[];
}

export interface ComplaintMetrics {
    complaint_count: number;
    sales_count: number;
    complaint_rate: number;
    confirmed_rate: number;
    expected_rate: number;
    rate_ratio: number;  // actual / expected
}

export interface SegmentAlert {
    segment_type: 'region' | 'product' | 'lot' | 'quarter';
    segment_id: string;
    metrics: ComplaintMetrics;
    alert_reason: string;
    recommended_action: string;
}

export function performSegmentationAnalysis(
    complaints: ComplaintRecord[],
    sales: SalesRecord[],
    period: DateRange,
    expectedRateBaseline: number
): SegmentedComplaintAnalysis {
    const result: SegmentedComplaintAnalysis = {
        by_region: new Map(),
        by_product: new Map(),
        by_lot: new Map(),
        by_quarter: new Map(),
        significant_segments: []
    };
    
    // Region segmentation
    const regions = [...new Set(sales.map(s => s.country))];
    regions.forEach(region => {
        const regionSales = sales.filter(s => s.country === region)
            .reduce((sum, s) => sum + s.quantity, 0);
        const regionComplaints = complaints.filter(c => c.country === region);
        
        const metrics = calculateMetrics(regionComplaints, regionSales, expectedRateBaseline);
        result.by_region.set(region, metrics);
        
        // Alert if rate > 2x expected
        if (metrics.rate_ratio > 2.0 && regionComplaints.length >= 3) {
            result.significant_segments.push({
                segment_type: 'region',
                segment_id: region,
                metrics: metrics,
                alert_reason: `Complaint rate (${metrics.complaint_rate.toFixed(2)}%) is ${metrics.rate_ratio.toFixed(1)}x higher than expected (${expectedRateBaseline.toFixed(2)}%)`,
                recommended_action: 'Review regional distribution, storage, training, or usage patterns'
            });
        }
    });
    
    // Product segmentation
    const products = [...new Set(sales.map(s => s.productNumber))];
    products.forEach(product => {
        const productSales = sales.filter(s => s.productNumber === product)
            .reduce((sum, s) => sum + s.quantity, 0);
        const productComplaints = complaints.filter(c => c.productNumber === product);
        
        const metrics = calculateMetrics(productComplaints, productSales, expectedRateBaseline);
        result.by_product.set(product, metrics);
        
        if (metrics.rate_ratio > 2.0 && productComplaints.length >= 3) {
            result.significant_segments.push({
                segment_type: 'product',
                segment_id: product,
                metrics: metrics,
                alert_reason: `Product ${product} has elevated complaint rate`,
                recommended_action: 'Initiate product-specific investigation. Review DHR and incoming inspection records.'
            });
        }
    });
    
    // Lot segmentation (critical for manufacturing issues)
    const lots = [...new Set(complaints.map(c => c.lotNumber).filter(Boolean))];
    lots.forEach(lot => {
        const lotComplaints = complaints.filter(c => c.lotNumber === lot);
        
        // Find total sales for this lot
        const lotSales = sales.filter(s => s.lotNumber === lot)
            .reduce((sum, s) => sum + s.quantity, 0);
        
        if (lotSales > 0) {
            const metrics = calculateMetrics(lotComplaints, lotSales, expectedRateBaseline);
            result.by_lot.set(lot!, metrics);
            
            // Alert if >1 complaint from same lot (potential manufacturing defect)
            if (lotComplaints.length > 1) {
                result.significant_segments.push({
                    segment_type: 'lot',
                    segment_id: lot!,
                    metrics: metrics,
                    alert_reason: `Multiple complaints (${lotComplaints.length}) from single lot`,
                    recommended_action: 'URGENT: Quarantine remaining lot inventory. Perform DHR review and dimensional/functional testing on retained samples.'
                });
            }
        }
    });
    
    return result;
}

function calculateMetrics(
    complaints: ComplaintRecord[],
    sales: number,
    expectedRate: number
): ComplaintMetrics {
    const confirmed = complaints.filter(c => c.complaintConfirmed?.toLowerCase() === 'yes');
    const complaintRate = sales > 0 ? (complaints.length / sales) * 100 : 0;
    const confirmedRate = sales > 0 ? (confirmed.length / sales) * 100 : 0;
    const rateRatio = expectedRate > 0 ? complaintRate / expectedRate : 0;
    
    return {
        complaint_count: complaints.length,
        sales_count: sales,
        complaint_rate: complaintRate,
        confirmed_rate: confirmedRate,
        expected_rate: expectedRate,
        rate_ratio: rateRatio
    };
}
```

**Enhanced PSUR Table 7 (Expanded):**
```
| Segment          | Complaints | Sales  | Rate (%) | Expected (%) | Ratio | Alert |
|------------------|------------|--------|----------|--------------|-------|-------|
| OVERALL          | 15         | 5,000  | 0.30     | 0.24         | 1.25  | -     |
|                  |            |        |          |              |       |       |
| BY REGION        |            |        |          |              |       |       |
| USA              | 12         | 3,800  | 0.32     | 0.24         | 1.33  | -     |
| Canada           | 1          | 600    | 0.17     | 0.24         | 0.71  | -     |
| France           | 1          | 400    | 0.25     | 0.24         | 1.04  | -     |
| New Zealand      | 1          | 200    | 0.50     | 0.24         | 2.08  | ⚠     |
|                  |            |        |          |              |       |       |
| BY PRODUCT       |            |        |          |              |       |       |
| 900-151          | 6          | 2,000  | 0.30     | 0.24         | 1.25  | -     |
| 900-152          | 5          | 1,500  | 0.33     | 0.24         | 1.38  | -     |
| 900-155          | 2          | 800    | 0.25     | 0.24         | 1.04  | -     |
| 900-157          | 1          | 500    | 0.20     | 0.24         | 0.83  | -     |
| 900-517          | 1          | 200    | 0.50     | 0.24         | 2.08  | ⚠     |
|                  |            |        |          |              |       |       |
| BY LOT (>1 complaint) |       |        |          |              |       |       |
| 550005803        | 2          | 500    | 0.40     | 0.24         | 1.67  | ⚠     |
```

**Enhanced Narrative:**
```
**Segmentation Analysis:**

Multi-dimensional analysis of complaint rates across geographic, product, and manufacturing 
lot segments identified the following notable patterns:

1. **Regional Analysis:** New Zealand showed an elevated complaint rate (0.50%, n=1) 
   representing a 2.08x ratio vs. expected rate. However, this is based on a single complaint 
   from low sales volume (200 units), making the rate statistically unstable. Continued 
   monitoring of this market is warranted.

2. **Product Analysis:** Product 900-517 (Mobius Retractor) showed a 0.50% rate (1 complaint 
   / 200 units sold), but investigation confirmed this was shipping damage (external cause), 
   not a product defect. When excluding external causes, all products fall within expected 
   variation.

3. **Lot Analysis (CRITICAL):** Lot 550005803 (Product 900-151) generated 2 confirmed 
   complaints from 500 units sold (0.40% rate). Both complaints involved electrode sticking 
   during conisation procedures. 

   **Action Taken:** CAPA-2024-019 initiated. DHR review (WO 550005803) revealed no 
   manufacturing deviations. Dimensional inspection of retained samples showed all parameters 
   within specification. Root cause remains under investigation. Remaining lot inventory 
   (85 units) has been quarantined pending resolution.
```

**Impact:** Demonstrates **proactive surveillance** rather than passive data aggregation.

---

## PART 3: NARRATIVE AGENT ENHANCEMENTS

### 3.1 Section E (Complaint Analysis) - Enhanced Prompt

Your current agents likely receive just data dumps. Here's how to structure prompts for deep analysis:

```typescript
// server/src/agents/runtime/narratives/ComplaintAnalysisNarrativeAgent.ts
protected async execute(input: {
    complaints: ComplaintRecord[];
    sales: SalesRecord[];
    controlChart: ControlChartData;
    segmentation: SegmentedComplaintAnalysis;
    rootCauseClusters: ComplaintCluster[];
    rmfExpectedRates: Map<string, number>;
    previousPSURMetrics: ComplaintRateAnalysis | null;
}): Promise<{ narrative: string }> {
    
    const prompt = `
You are a Post-Market Surveillance expert writing Section E (Complaint Analysis) of a 
PSUR per MDCG 2022-21 requirements. Your narrative must be data-driven, statistically 
rigorous, and regulatory-compliant.

===== INPUT DATA =====

1. COMPLAINT SUMMARY:
   Total Complaints: ${input.complaints.length}
   Confirmed Product Defects: ${input.complaints.filter(c => c.complaintConfirmed === 'yes').length}
   Unconfirmed: ${input.complaints.filter(c => c.complaintConfirmed === 'no').length}
   
2. SALES VOLUME (DENOMINATOR):
   Total Units Sold: ${input.sales.reduce((s, r) => s + r.quantity, 0)}
   
3. STATISTICAL TRENDING:
   ${JSON.stringify(input.controlChart, null, 2)}
   
4. SEGMENTATION ALERTS:
   ${input.segmentation.significant_segments.map(s => 
       `[${s.segment_type.toUpperCase()}] ${s.segment_id}: ${s.alert_reason}`
   ).join('\n   ')}
   
5. ROOT CAUSE CLUSTERS:
   ${input.rootCauseClusters.map((c, i) => 
       `Cluster ${i+1}: ${c.theme} (${c.complaint_ids.length} complaints)\n   Hypothesis: ${c.root_cause_hypothesis}`
   ).join('\n   ')}

6. COMPARISON TO PREVIOUS PSUR:
   ${input.previousPSURMetrics ? `
   Previous Period Rate: ${input.previousPSURMetrics.confirmed_rate.toFixed(2)}%
   Current Period Rate: ${input.controlChart.current_rate.toFixed(2)}%
   Change: ${((input.controlChart.current_rate - input.previousPSURMetrics.confirmed_rate) / input.previousPSURMetrics.confirmed_rate * 100).toFixed(1)}%
   ` : 'No previous PSUR available (first report)'}

===== NARRATIVE REQUIREMENTS =====

Your narrative must include the following elements in order:

1. **Executive Summary Paragraph:**
   - State total complaints, sales volume, and overall rate
   - Distinguish confirmed vs. unconfirmed complaints
   - Compare to previous period (if available)
   - Make an upfront statement on statistical significance

2. **Confirmed Complaint Rate Analysis:**
   - Calculate and explain confirmed defect rate methodology
   - Compare to RMF maximum acceptable rate
   - Assess clinical significance

3. **Statistical Trending (Reference Control Chart):**
   - Interpret UCL/LCL analysis
   - State trend status ("In Control" / "Exceeds UCL")
   - Explain what this means for product quality

4. **Segmentation Findings:**
   - Discuss any regional, product, or lot-specific patterns
   - Explain significance and actions taken
   - Include lot-specific investigation if >1 complaint per lot

5. **Root Cause Analysis:**
   - Present identified clusters (even if individual RCA inconclusive)
   - Describe corrective actions (link to Section G CAPAs)
   - Demonstrate proactive risk mitigation

6. **Comparison to Previous Period:**
   - Quantify change (percentage points and percent change)
   - Assess trend direction
   - Explain any significant changes

7. **Conclusions:**
   - Overall assessment of complaint trending
   - Statement on acceptability
   - Forward-looking monitoring plan

===== WRITING STYLE REQUIREMENTS =====

- Use third person, professional regulatory tone
- Quantify everything (no vague terms like "several" or "many")
- Provide explicit rate calculations with numerator/denominator
- Reference source documents (e.g., "per RMF v1.2 RACT Row 5")
- Maintain objectivity - don't minimize issues or over-claim success
- Use short paragraphs (3-5 sentences max)
- Include transition phrases between topics
- DO NOT USE BULLET POINTS - write in narrative prose paragraphs

===== CRITICAL REGULATORY NOTES =====

- Confirmed defect rate is the primary safety metric
- Combined rate (confirmed + unconfirmed) is for regulatory comparison only
- Always explain why unconfirmed complaints can't be counted as product defects
- Statistical trending prevents false alarms from random variation
- Segmentation analysis demonstrates robust surveillance
- Even inconclusive individual RCAs can yield aggregate insights

===== OUTPUT FORMAT =====

Return ONLY the narrative text (no JSON, no formatting markers). The narrative should be 
4-6 paragraphs, approximately 800-1000 words, suitable for insertion directly into 
Section E of FormQAR-054.

Generate the narrative now:
`;

    const result = await this.invokeLLM(prompt, input);
    return { narrative: result.content };
}
```

**Key Differences from Current Approach:**
1. **Pre-analyzed data** is provided (control charts, segmentation, clustering) rather than raw records
2. **Explicit requirements** for what must be covered
3. **Regulatory context** is embedded in the prompt
4. **Writing style** guidance prevents generic AI language

---

### 3.2 Section J (Benefit-Risk) - Quantitative Framework

**Problem:** Current benefit-risk determinations are likely qualitative ("benefits outweigh risks"). MDCG 2022-21 expects quantitative justification.

**Solution:** Structured benefit-risk calculation:

```typescript
// server/src/psur/engines/benefitRiskEngine.ts
export interface BenefitRiskAnalysis {
    benefits: {
        primary_clinical_benefit: string;
        benefit_magnitude: number;  // e.g., 95% success rate
        benefit_units: string;  // "% sperm recovery"
        evidence_source: string;  // "CER Section 4.2"
        patient_population_size: number;  // # patients who benefited
    };
    
    risks: {
        serious_incidents: number;
        serious_incident_rate: number;  // per 1000 uses
        deaths: number;
        serious_injuries: number;
        malfunctions_no_harm: number;
        complaint_rate_confirmed: number;
    };
    
    comparative: {
        alternative_therapy: string;
        alternative_benefit: number;
        alternative_risk: number;
        benefit_delta: number;  // your device - alternative
        risk_delta: number;
    };
    
    risk_benefit_ratio: number;  // benefits / risks (higher = more favorable)
    acceptability_threshold: number;  // From RMF
    acceptable: boolean;
    change_from_previous: 'Improved' | 'Unchanged' | 'Deteriorated' | 'N/A';
}

export function calculateBenefitRisk(
    clinicalData: ClinicalEvaluationData,
    vigilanceData: VigilanceData,
    complaintData: ComplaintRateAnalysis,
    salesData: SalesData,
    rmfData: RiskManagementData,
    previousPSURData: BenefitRiskAnalysis | null
): BenefitRiskAnalysis {
    
    // Extract clinical benefit from CER
    const primaryBenefit = clinicalData.primaryEndpoint;  // e.g., "Motile sperm recovery rate"
    const benefitMagnitude = clinicalData.primaryEndpointValue;  // e.g., 95.2
    
    // Calculate patient exposure (benefit recipients)
    const totalUnitsSold = salesData.total;
    const estimatedProcedures = totalUnitsSold * salesData.proceduresPerUnit;  // For single-use devices
    
    // Quantify risks
    const seriousIncidents = vigilanceData.deaths + vigilanceData.seriousInjuries + 
                             vigilanceData.malfunctions;
    const seriousIncidentRate = (seriousIncidents / totalUnitsSold) * 1000;  // per 1000 units
    
    // Compare to alternative (from CER)
    const alternative = clinicalData.stateOfTheArt.primaryAlternative;
    const benefitDelta = benefitMagnitude - alternative.effectivenessRate;
    const riskDelta = seriousIncidentRate - alternative.adverseEventRate;
    
    // Calculate ratio (simplified - actual calculation more complex)
    const benefitScore = benefitMagnitude * estimatedProcedures;  // total benefit delivered
    const riskScore = seriousIncidents;  // total harm
    const ratio = benefitScore / Math.max(riskScore, 1);
    
    // Determine acceptability
    const threshold = rmfData.benefitRiskThreshold;  // From RMF
    const acceptable = ratio >= threshold && seriousIncidentRate <= rmfData.maxAcceptableIncidentRate;
    
    // Assess change
    let change: BenefitRiskAnalysis['change_from_previous'] = 'N/A';
    if (previousPSURData) {
        if (ratio > previousPSURData.risk_benefit_ratio * 1.1) change = 'Improved';
        else if (ratio < previousPSURData.risk_benefit_ratio * 0.9) change = 'Deteriorated';
        else change = 'Unchanged';
    }
    
    return {
        benefits: {
            primary_clinical_benefit: primaryBenefit,
            benefit_magnitude: benefitMagnitude,
            benefit_units: clinicalData.primaryEndpointUnits,
            evidence_source: `CER ${clinicalData.cerVersion} Section ${clinicalData.primaryEndpointSection}`,
            patient_population_size: estimatedProcedures
        },
        risks: {
            serious_incidents: seriousIncidents,
            serious_incident_rate: seriousIncidentRate,
            deaths: vigilanceData.deaths,
            serious_injuries: vigilanceData.seriousInjuries,
            malfunctions_no_harm: vigilanceData.malfunctions,
            complaint_rate_confirmed: complaintData.confirmed_rate
        },
        comparative: {
            alternative_therapy: alternative.name,
            alternative_benefit: alternative.effectivenessRate,
            alternative_risk: alternative.adverseEventRate,
            benefit_delta: benefitDelta,
            risk_delta: riskDelta
        },
        risk_benefit_ratio: ratio,
        acceptability_threshold: threshold,
        acceptable: acceptable,
        change_from_previous: change
    };
}
```

**Enhanced Section J Narrative Prompt:**
```typescript
const prompt = `
Write Section J (Benefit-Risk Determination) using the following QUANTITATIVE analysis:

BENEFITS:
- Primary Clinical Benefit: ${brAnalysis.benefits.primary_clinical_benefit}
- Performance: ${brAnalysis.benefits.benefit_magnitude}${brAnalysis.benefits.benefit_units}
- Evidence: ${brAnalysis.benefits.evidence_source}
- Patient Population: ${brAnalysis.benefits.patient_population_size.toLocaleString()} procedures performed

RISKS:
- Serious Incidents: ${brAnalysis.risks.serious_incidents} (${brAnalysis.risks.serious_incident_rate.toFixed(2)} per 1,000 uses)
  · Deaths: ${brAnalysis.risks.deaths}
  · Serious Injuries: ${brAnalysis.risks.serious_injuries}
  · Malfunctions (no harm): ${brAnalysis.risks.malfunctions_no_harm}
- Confirmed Complaint Rate: ${brAnalysis.risks.complaint_rate_confirmed.toFixed(2)}%

COMPARATIVE ANALYSIS (vs. ${brAnalysis.comparative.alternative_therapy}):
- Benefit Advantage: +${brAnalysis.comparative.benefit_delta.toFixed(1)}% (our device superior)
- Risk Profile: ${brAnalysis.comparative.risk_delta.toFixed(3)} per 1,000 ${brAnalysis.comparative.risk_delta < 0 ? 'fewer' : 'more'} incidents

BENEFIT-RISK RATIO: ${brAnalysis.risk_benefit_ratio.toFixed(0)}:1
ACCEPTABILITY THRESHOLD (from RMF): ${brAnalysis.acceptability_threshold}:1
STATUS: ${brAnalysis.acceptable ? 'ACCEPTABLE ✓' : 'NOT ACCEPTABLE ✗'}
CHANGE FROM PREVIOUS PSUR: ${brAnalysis.change_from_previous}

REQUIREMENTS:
1. Open with quantitative benefit summary (what clinical outcome, what magnitude, how many patients)
2. Quantify risks (incident rate per 1,000 uses, confirmed complaint rate)
3. Compare to alternative therapy (explicit numbers)
4. Calculate and explain benefit-risk ratio
5. Make definitive acceptability statement per MDCG 2022-21
6. If favorable, explain WHY benefits outweigh risks (use numbers)
7. If unfavorable, describe corrective actions

Write 5-6 paragraphs, 600-800 words, professional regulatory tone:
`;
```

**Sample Enhanced Output:**
```
The ZyMōt™ Multi Sperm Separation Device delivers a clinically significant benefit in 
assisted reproductive technology procedures. Clinical evaluation data (CER v3.1, Section 4.2) 
demonstrates a mean motile sperm recovery rate of 95.2% ± 3.1% across 450 evaluated samples, 
representing a 12.3 percentage point improvement over traditional density gradient 
centrifugation (82.9% recovery rate). During the current reporting period, an estimated 
12,456 IVF procedures were performed using the device, providing this enhanced sperm 
selection benefit to approximately 12,000 patients globally.

The safety profile during the reporting period was favorable. Two (2) serious incidents 
were reported, yielding a serious incident rate of 0.16 per 1,000 uses (2 incidents / 
12,456 units sold). Both incidents involved device breakage (IMDRF MDP code 2003) during 
setup prior to sample processing, with no patient exposure or harm (IMDRF Harm: No Health 
Consequence). There were zero deaths, zero serious injuries requiring medical intervention, 
and zero malfunctions resulting in patient harm. The confirmed product defect rate was 
0.08% (4 confirmed complaints / 5,000 units sold), which is below the maximum acceptable 
rate of 0.15% established in the Risk Management File (RMF v1.2, RACT Row 5).

Comparative analysis against the state-of-the-art alternative (swim-up method, reported 
in literature to achieve 78-85% motile sperm recovery with manual manipulation requirements) 
demonstrates clear benefit superiority. The ZyMōt device provides approximately 10-17 
percentage points higher recovery rates while eliminating centrifugation-induced oxidative 
stress. The safety risk differential is negligible: the alternative method has no reported 
device-related adverse events (as it is a manual technique), while the ZyMōt device has a 
0.16 per 1,000 incident rate, all of which were pre-use detection of device defects with 
no patient impact.

Quantitative benefit-risk assessment yields a ratio of approximately 47,600:1 (95.2% benefit 
delivered to 12,456 procedures : 2 incidents with no harm). This substantially exceeds the 
acceptability threshold of 100:1 established in the Risk Management File and represents a 
highly favorable benefit-risk profile. The clinical benefit (superior sperm recovery enabling 
improved fertilization potential) is delivered to thousands of patients, while the residual 
risk (occasional device breakage detected before use) has zero patient safety impact.

Comparison to the previous PSUR period (Jan-Dec 2023) shows the benefit-risk profile has 
remained stable. The benefit magnitude is unchanged (95.2% vs. 95.0% in previous period), 
while the serious incident rate has remained consistent (0.16 vs. 0.18 per 1,000 in previous 
period). This demonstrates durable safety and performance characteristics.

**Conclusion:** Based on comprehensive analysis of clinical benefits (12,456 procedures 
with 95.2% motile sperm recovery rate) and safety data (2 pre-use device detections with 
no patient harm), it is concluded that the benefit-risk profile of the ZyMōt™ Multi Sperm 
Separation Device has NOT been adversely impacted and remains ACCEPTABLE per MDCG 2022-21 
requirements. The device continues to perform as intended with benefits substantially 
outweighing residual risks. All identified risks remain within acceptable limits established 
in the Risk Management File. No changes to the device design, labeling, or risk controls 
are warranted based on current surveillance data.
```

**Impact:** Transforms Section J from boilerplate conclusion to **data-driven regulatory argument**.

---

## PART 4: SYSTEM ARCHITECTURE RECOMMENDATIONS

### 4.1 Evidence Atom Schema Enhancement

Based on your CLAUDE.md, you normalize evidence to "atoms" with provenance. Here's how to ensure atoms capture granularity for analytics:

```typescript
// shared/schema.ts - Enhanced evidence_atoms table
export const evidenceAtoms = pgTable('evidence_atoms', {
    id: uuid('id').primaryKey().defaultRandom(),
    psurCaseId: uuid('psur_case_id').notNull().references(() => psurCases.id),
    
    // Source metadata
    evidenceType: text('evidence_type').notNull(),  // 'complaint', 'sales', 'vigilance', etc.
    sourceDocumentId: uuid('source_document_id'),  // Link to uploaded file
    extractionMethod: text('extraction_method').notNull(),  // 'csv_parser', 'pdf_ocr', 'manual_entry'
    
    // Temporal scoping
    eventDate: timestamp('event_date'),  // When did the event occur
    reportedDate: timestamp('reported_date'),  // When was it reported
    recordedDate: timestamp('recorded_date').notNull().defaultNow(),  // When entered into system
    
    // Structured data (JSON)
    structuredData: jsonb('structured_data').notNull(),  // The actual data
    
    // Provenance
    contentHash: text('content_hash').notNull(),  // For deduplication
    provenanceChain: jsonb('provenance_chain'),  // Audit trail of transformations
    
    // Classification (for filtering)
    imdrf_harm_code: text('imdrf_harm_code'),  // Null for non-harm events
    imdrf_mdp_code: text('imdrf_mdp_code'),
    severity: text('severity'),  // 'serious', 'non-serious'
    confirmed: boolean('confirmed'),  // For complaints
    
    // Regional/segmentation
    region: text('region'),  // Geographic segment
    productNumber: text('product_number'),
    lotNumber: text('lot_number'),
    
    // Quality metadata
    dataQualityScore: real('data_quality_score'),  // 0.0 - 1.0
    requiresHumanReview: boolean('requires_human_review').default(false),
    reviewedAt: timestamp('reviewed_at'),
    reviewedBy: text('reviewed_by'),
    
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow()
});
```

**Example Structured Data for Complaint Atom:**
```json
{
    "complaint_number": "2024-06-0000097",
    "notification_date": "2024-06-06",
    "event_date": "2024-05-15",
    "product_number": "900-152",
    "lot_number": "345133",
    "description": "electrode fried during procedure",
    "symptom_code": "electrical",
    "imdrf_harm_code": null,
    "imdrf_harm_term": "No Health Consequence",
    "imdrf_mdp_code": "2101",
    "imdrf_mdp_term": "Electrical Problem",
    "patient_involvement": "n/a",
    "additional_medical_attention": "no",
    "mdr_issued": "no",
    "confirmed": false,
    "investigation_findings": "...",
    "root_cause": "not confirmed",
    "root_cause_category": "unconfirmed",
    "corrective_action": "continue monitoring",
    "region": "USA",
    "customer_name": "OHIO HEALTH OPERATING CO",
    "generator_used": "Conmed 5000",
    "data_quality_score": 0.85,
    "missing_fields": ["lot_test_data"],
    "extraction_confidence": 0.92
}
```

**Benefits:**
- Enables SQL queries like: `WHERE imdrf_mdp_code = '2101' AND confirmed = true AND region = 'USA'`
- Supports time-series analysis: `GROUP BY DATE_TRUNC('month', event_date)`
- Facilitates segmentation: `GROUP BY product_number, lot_number`

---

### 4.2 Calculation Engine Interface Standardization

Your `server/src/psur/engines/` folder should have consistent interfaces:

```typescript
// server/src/psur/engines/baseEngine.ts
export interface CalculationEngine<TInput, TOutput> {
    name: string;
    version: string;
    requiredEvidenceTypes: string[];
    
    calculate(input: TInput): Promise<TOutput>;
    validate(input: TInput): ValidationResult;
    getMetadata(): EngineMetadata;
}

export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    dataQualityScore: number;
}

export interface EngineMetadata {
    name: string;
    version: string;
    description: string;
    methodology: string;  // Explain calculation approach
    regulatoryBasis: string[];  // ["MDCG 2022-21 Section 5.3", "ISO 14971"]
    lastUpdated: Date;
}

// Example implementation
export class ComplaintRateEngine implements CalculationEngine<ComplaintRateInput, ComplaintRateOutput> {
    name = 'Complaint Rate Calculator';
    version = '2.1.0';
    requiredEvidenceTypes = ['complaint', 'sales'];
    
    async calculate(input: ComplaintRateInput): Promise<ComplaintRateOutput> {
        const validation = this.validate(input);
        if (!validation.valid) {
            throw new Error(`Invalid input: ${validation.errors.join(', ')}`);
        }
        
        // Perform calculation
        const result = {
            total_complaints: input.complaints.length,
            confirmed_complaints: input.complaints.filter(c => c.confirmed).length,
            total_sales: input.sales.reduce((s, r) => s + r.quantity, 0),
            // ... rest of calculation
        };
        
        // Log calculation trace
        await this.logCalculationTrace(input, result);
        
        return result;
    }
    
    validate(input: ComplaintRateInput): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];
        
        if (input.complaints.length === 0) {
            warnings.push('No complaints in dataset - rate will be 0%');
        }
        
        if (input.sales.reduce((s, r) => s + r.quantity, 0) === 0) {
            errors.push('Cannot calculate rate with zero sales (division by zero)');
        }
        
        // Check temporal alignment
        const complaintDates = input.complaints.map(c => c.notificationDate);
        const salesDates = input.sales.map(s => s.shipDate);
        
        if (!this.datesOverlap(complaintDates, salesDates)) {
            warnings.push('Complaint dates and sales dates do not overlap - verify period alignment');
        }
        
        const dataQualityScore = this.calculateDataQuality(input);
        
        return {
            valid: errors.length === 0,
            errors,
            warnings,
            dataQualityScore
        };
    }
    
    getMetadata(): EngineMetadata {
        return {
            name: this.name,
            version: this.version,
            description: 'Calculates complaint rates per MDCG 2022-21 requirements with confirmed/unconfirmed distinction',
            methodology: 'Rate = (Complaint Count / Units Sold in Period) × 100. Separates confirmed product defects from unconfirmed complaints. Applies exposure-based denominators for reusable devices.',
            regulatoryBasis: [
                'MDCG 2022-21 Section 5.3 - Complaint Trending',
                'ISO 14971:2019 - Risk Management',
                'GHTF/SG2/N54R8:2006 - Complaint Handling'
            ],
            lastUpdated: new Date('2025-01-15')
        };
    }
}
```

**Benefits:**
- **Auditability:** Every calculation is traceable
- **Versioning:** Can track which methodology was used for historical PSURs
- **Validation:** Catches data quality issues before they corrupt outputs
- **Documentation:** Self-documenting regulatory basis

---

### 4.3 GRKB Slot → Evidence Mapping Validation

Your template pipeline auto-maps slots to obligations via embeddings. Add validation to ensure **semantic sufficiency**:

```typescript
// server/src/services/slotAdjudicationService.ts
export interface SlotEvidenceCoverage {
    slotId: string;
    obligationId: string;
    requirementText: string;
    
    // Evidence provisioned
    evidenceTypes: string[];
    evidenceCount: number;
    
    // Semantic analysis
    contentGenerated: boolean;
    contentWordCount: number;
    containsQuantitativeData: boolean;
    containsStatisticalAnalysis: boolean;
    containsRegulatoryCitation: boolean;
    
    // Quality scoring
    coverageScore: number;  // 0.0 - 1.0
    deficiencies: string[];
    
    status: 'Fully Covered' | 'Partially Covered' | 'Not Covered';
}

export async function validateSlotCoverage(
    slot: TemplateSlot,
    obligation: GRKBObligation,
    generatedContent: string,
    evidenceAtoms: EvidenceAtom[]
): Promise<SlotEvidenceCoverage> {
    
    const coverage: SlotEvidenceCoverage = {
        slotId: slot.id,
        obligationId: obligation.id,
        requirementText: obligation.requirementText,
        evidenceTypes: [...new Set(evidenceAtoms.map(e => e.evidenceType))],
        evidenceCount: evidenceAtoms.length,
        contentGenerated: generatedContent.length > 0,
        contentWordCount: generatedContent.split(/\s+/).length,
        containsQuantitativeData: /\d+(\.\d+)?%|\d+\/\d+|\d+ per \d+/.test(generatedContent),
        containsStatisticalAnalysis: /UCL|LCL|standard deviation|control limit|p-value|confidence interval/i.test(generatedContent),
        containsRegulatoryCitation: /MDCG|ISO|IEC|GHTF|RMF|CER/.test(generatedContent),
        coverageScore: 0,
        deficiencies: [],
        status: 'Not Covered'
    };
    
    // Score calculation
    let score = 0;
    
    if (coverage.contentGenerated) score += 0.2;
    if (coverage.contentWordCount >= 200) score += 0.2;
    if (coverage.evidenceCount > 0) score += 0.2;
    if (coverage.containsQuantitativeData) score += 0.2;
    if (coverage.containsStatisticalAnalysis) score += 0.1;
    if (coverage.containsRegulatoryCitation) score += 0.1;
    
    coverage.coverageScore = score;
    
    // Determine status
    if (score >= 0.8) coverage.status = 'Fully Covered';
    else if (score >= 0.5) coverage.status = 'Partially Covered';
    else coverage.status = 'Not Covered';
    
    // Identify deficiencies
    if (!coverage.containsQuantitativeData && obligation.requiresQuantitativeEvidence) {
        coverage.deficiencies.push('Missing quantitative data (rates, counts, metrics)');
    }
    
    if (!coverage.containsStatisticalAnalysis && obligation.requiresStatisticalAnalysis) {
        coverage.deficiencies.push('Missing statistical analysis (trending, control limits, significance testing)');
    }
    
    if (coverage.contentWordCount < 150 && obligation.narrativeMinWordCount && obligation.narrativeMinWordCount > 150) {
        coverage.deficiencies.push(`Narrative too brief (${coverage.contentWordCount} words < ${obligation.narrativeMinWordCount} required)`);
    }
    
    return coverage;
}
```

**Impact:** Prevents "hollow compliance" where slots are technically filled but lack regulatory substance.

---

## PART 5: IMPLEMENTATION ROADMAP

### Phase 1: Data Pipeline (Weeks 1-2)
**Priority: CRITICAL**

1. **IMDRF Classification Engine**
   - Create `symptom_to_imdrf_mapping` table
   - Seed with mappings from analysis
   - Build `IMDRFClassificationAgent`
   - Migrate existing complaint atoms

2. **Confirmed/Unconfirmed Separation**
   - Enhance `complaintsEngine.ts` with tiered rates
   - Update `evidence_atoms` schema with `confirmed` field
   - Backfill historical data

3. **Evidence Atom Schema Enhancement**
   - Add IMDRF fields, segmentation fields
   - Create migration script
   - Update all parser agents

**Deliverable:** All complaint data has IMDRF codes and confirmed/unconfirmed classification

---

### Phase 2: Statistical Engines (Weeks 3-4)
**Priority: HIGH**

1. **Control Chart Engine**
   - Implement `statisticalTrendingEngine.ts`
   - Create `ComplaintTrendChartAgent` (SVG generation)
   - Test with historical data

2. **Segmentation Engine**
   - Implement `segmentationEngine.ts`
   - Create alert thresholds (2x expected rate, >1 lot complaint)
   - Build segmentation tables

3. **Root Cause Clustering**
   - Build `RootCauseClusteringAgent`
   - Test NLP clustering on your dataset
   - Validate cluster quality with domain expert

**Deliverable:** All PSURs include control charts, segmentation tables, and cluster insights

---

### Phase 3: Narrative Enhancements (Weeks 5-6)
**Priority: HIGH**

1. **Prompt Engineering Overhaul**
   - Rewrite Section E agent prompt (complaint analysis)
   - Rewrite Section J agent prompt (benefit-risk)
   - Add regulatory context and calculation methodology

2. **Benefit-Risk Engine**
   - Implement `benefitRiskEngine.ts`
   - Create quantitative ratio calculations
   - Integrate with CER and RMF data

3. **Agent Testing**
   - Generate reference PSURs for 3 products
   - Compare to current outputs
   - Iterate based on regulatory review

**Deliverable:** Narratives demonstrate statistical rigor and regulatory sophistication

---

### Phase 4: Validation & HITL (Weeks 7-8)
**Priority: MEDIUM**

1. **Slot Coverage Validation**
   - Implement `validateSlotCoverage` service
   - Add coverage dashboard to UI
   - Create rejection workflows

2. **HITL Enhancement**
   - Add coverage scores to approval gates
   - Create "deficiency correction" workflow
   - Track common rejection reasons

3. **Quality Metrics**
   - Build PSUR quality scorecard
   - Track: quantitative data density, statistical analysis presence, regulatory citation frequency
   - Create continuous improvement loop

**Deliverable:** Every PSUR is validated for semantic quality, not just structural compliance

---

## CONCLUSION

Your PSUR system has **excellent bones** (GRKB architecture, agent orchestration, traceability), but current outputs likely suffer from:

1. **Missing IMDRF classification layer** → Prevents proper regulatory categorization
2. **Lack of confirmed/unconfirmed distinction** → Inflates complaint rates misleadingly  
3. **No statistical trending** → Can't distinguish signal from noise
4. **Weak root cause analysis** → Limits risk re-evaluation depth
5. **Generic AI narratives** → Lack quantitative rigor and regulatory persuasiveness

**The fix is NOT more data** (your data is excellent). **The fix is smarter data processing:**
- Classification engines that normalize to IMDRF taxonomy
- Statistical engines that detect meaningful trends
- Analytical engines that cluster patterns even when individual root causes are inconclusive
- Narrative agents that synthesize quantitative insights rather than just summarizing data

Implement the enhancements in this document and your PSURs will transform from **compliance documents** into **regulatory intelligence assets** that demonstrate:
- ✅ Robust post-market surveillance
- ✅ Statistical sophistication
- ✅ Proactive risk management
- ✅ Data-driven benefit-risk justification

This is what regulators (Notified Bodies, Competent Authorities) expect from MDCG 2022-21 compliant PSURs.

---

**Next Steps:**
1. Share your actual agent prompts (especially Section E and J)
2. Provide sales data structure so I can demonstrate rate calculations
3. Send one complete PSUR output so I can mark it up with specific enhancement annotations
4. Clarify: Do you want me to generate a reference PSUR Section E using this dataset to show the depth you should be targeting?