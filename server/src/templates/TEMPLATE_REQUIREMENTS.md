# Template Validation Requirements

## Overview

Template validation is **permissive by design**. It only validates **minimum required fields** and allows custom extensions.

## Validation Philosophy

✅ **PASS** if:
- All required minimum fields are present
- Required fields have valid types/values
- Extra custom fields are present (they are preserved)

❌ **FAIL** only if:
- A required minimum field is missing
- A required field has invalid type/format

## Minimum Required Fields

### Top Level (Template)
```typescript
{
  template_id: string (min 1 char),
  name: string (min 1 char),
  version: string (min 1 char),
  jurisdiction_scope: string[] (min 1 item, any values allowed),
  mandatory_obligation_ids: string[],
  defaults: TemplateDefaults,
  slots: SlotDefinition[] (min 1 slot),
  mapping: Record<string, string[]>
}
```

**Optional**:
- `normative_basis: string[]`

**Custom fields**: All other fields are allowed and preserved.

### Template Defaults
```typescript
{
  require_traceability: boolean,
  require_method_statement: boolean,
  require_claimed_obligations: boolean,
  min_method_chars: number (>= 0),
  min_evidence_atoms: number (>= 0)
}
```

**Custom fields**: All other fields (like `mdcg_annex_i_compliant`, `no_citation_markers_in_output`) are allowed.

### Slot Definition
```typescript
{
  slot_id: string (min 1 char),
  title: string (min 1 char),
  section_path: string (min 1 char),
  slot_kind: "ADMIN" | "NARRATIVE" | "TABLE" | "METRIC",
  required: boolean,
  evidence_requirements: EvidenceRequirements,
  output_requirements: OutputRequirements
}
```

**Custom fields**: All other fields (like `agent_assignment`, `quality_checks`, `regulatory_obligations`, `mdcg_reference`, etc.) are allowed.

### Evidence Requirements
```typescript
{
  required_types: string[],
  min_atoms: number (>= 0, default 0),
  allow_empty_with_justification: boolean (default false)
}
```

**Custom fields**: All other fields (like `justification_not_applicable`, `empty_justification`) are allowed.

### Output Requirements
```typescript
{
  renderer: "md" | "docx"
}
```

**Optional**:
- `render_as: "cover_page" | "table_of_contents" | "narrative" | "table"`
- `table_schema: TableSchema`

**Custom fields**: All other fields (like `mdcg_standard`, `include_checkboxes`, `word_count_range`, `table_id`, etc.) are allowed.

### Table Schema (if present)
```typescript
{
  columns: TableColumn[] (min 1 column)
}
```

**Optional**:
- `primary_key: string[]`

**Custom fields**: All other fields are allowed.

### Table Column (if table schema present)
```typescript
{
  name: string (min 1 char),
  type: "string" | "number" | "boolean"
}
```

**Custom fields**: All other fields (like `alignment`, `format`, `required`, etc.) are allowed.

## Examples

### ✅ VALID: Minimal Template
```json
{
  "template_id": "SIMPLE_PSUR",
  "name": "Simple PSUR",
  "version": "1.0",
  "jurisdiction_scope": ["EU_MDR"],
  "mandatory_obligation_ids": ["MDR_ART_86"],
  "defaults": {
    "require_traceability": true,
    "require_method_statement": true,
    "require_claimed_obligations": true,
    "min_method_chars": 10,
    "min_evidence_atoms": 1
  },
  "slots": [{
    "slot_id": "exec_summary",
    "title": "Executive Summary",
    "section_path": "A > Executive Summary",
    "slot_kind": "NARRATIVE",
    "required": true,
    "evidence_requirements": {
      "required_types": ["summary"],
      "min_atoms": 1
    },
    "output_requirements": {
      "renderer": "md"
    }
  }],
  "mapping": {
    "exec_summary": ["MDR_ART_86"]
  }
}
```

### ✅ VALID: Extended Template with Custom Fields
```json
{
  "template_id": "COMPREHENSIVE_PSUR",
  "name": "Comprehensive PSUR Template",
  "version": "3.2",
  "jurisdiction_scope": ["EU_MDR", "UK_MDR", "UKCA"],
  "mandatory_obligation_ids": ["MDR_ART_86_1"],
  "created_date": "2025-01-25",
  "device_class_applicability": ["CLASS_I", "CLASS_IIA"],
  "regulatory_basis": {
    "primary": "EU MDR 2017/745"
  },
  "defaults": {
    "require_traceability": true,
    "require_method_statement": true,
    "require_claimed_obligations": true,
    "min_method_chars": 10,
    "min_evidence_atoms": 1,
    "mdcg_annex_i_compliant": true,
    "no_citation_markers_in_output": true
  },
  "slots": [{
    "slot_id": "section_a",
    "title": "Executive Summary",
    "section_path": "A > Executive Summary",
    "section_number": "A",
    "slot_kind": "NARRATIVE",
    "required": true,
    "completion_priority": 15,
    "agent_assignment": "executive_summary_agent",
    "regulatory_criticality": "HIGHEST",
    "evidence_requirements": {
      "required_types": ["sales_data_summary"],
      "min_atoms": 4,
      "allow_empty_with_justification": false
    },
    "output_requirements": {
      "renderer": "md",
      "render_as": "narrative",
      "include_checkboxes": true,
      "word_count_range": [400, 800]
    },
    "quality_checks": [
      "All checkbox subsections completed"
    ],
    "regulatory_obligations": [
      "MDR_ART_86_3"
    ]
  }],
  "mapping": {
    "section_a": ["MDR_ART_86_3"]
  },
  "mdcg_annex_i_compliance_matrix": {
    "MDCG.ANNEXI.TOC": {
      "slot": "mdcg_toc",
      "status": "IMPLEMENTED"
    }
  }
}
```

### ❌ INVALID: Missing Required Field
```json
{
  "template_id": "BAD_TEMPLATE",
  "name": "Bad Template",
  // ❌ Missing "version" (required)
  "jurisdiction_scope": ["EU_MDR"],
  "mandatory_obligation_ids": [],
  "defaults": {
    "require_traceability": true,
    "require_method_statement": true,
    "require_claimed_obligations": true,
    "min_method_chars": 10,
    "min_evidence_atoms": 1
  },
  "slots": [{
    "slot_id": "section_a",
    "title": "Section A",
    "section_path": "A",
    "slot_kind": "NARRATIVE",
    "required": true,
    "evidence_requirements": {
      "required_types": []
    },
    "output_requirements": {
      "renderer": "md"
    }
  }],
  "mapping": {
    "section_a": []
  }
}
```

### ❌ INVALID: Wrong Type
```json
{
  "template_id": "BAD_TEMPLATE",
  "name": "Bad Template",
  "version": "1.0",
  "jurisdiction_scope": "EU_MDR", // ❌ Should be array, not string
  "mandatory_obligation_ids": [],
  "defaults": {
    "require_traceability": true,
    "require_method_statement": true,
    "require_claimed_obligations": true,
    "min_method_chars": 10,
    "min_evidence_atoms": 1
  },
  "slots": [{
    "slot_id": "section_a",
    "title": "Section A",
    "section_path": "A",
    "slot_kind": "NARRATIVE",
    "required": true,
    "evidence_requirements": {
      "required_types": []
    },
    "output_requirements": {
      "renderer": "md"
    }
  }],
  "mapping": {
    "section_a": []
  }
}
```

## Best Practices

1. **Always include minimum required fields** with valid types
2. **Use custom fields freely** for your specific requirements (MDCG compliance, agent assignments, quality checks, etc.)
3. **Document custom fields** in your template or separate documentation
4. **Use consistent naming** for custom fields across templates
5. **Validate after changes** using the template pipeline or linting tools
