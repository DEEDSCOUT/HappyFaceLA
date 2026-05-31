# RELEASE_MANIFEST_CONTRACT_V1

Status: Draft Contract (Documentation Only)
Date: 2026-05-27

Purpose: define the released-only runtime configuration contract for future `/book` behavior.

## Contract Principles

- Public runtime must consume only released records.
- Runtime must never read directly from editable commercial workbook cells.
- Every booking/payment/terms decision must be traceable to a specific manifest version.

## Required Manifest Metadata

Required top-level fields:

- `release_version`
- `effective_at`
- `released_at`
- `released_by`
- `source_control_reference`
- `status`
- `terms_version`
- `payment_rule_version`
- `travel_rule_version`
- `release_authorized`

## Required Configuration Collections

Required top-level collections:

- `services`
- `packages`
- `package_prices`
- `add_ons`
- `capacity_rules`
- `travel_rules`
- `payment_rules`
- `public_copy`
- `eligibility_rules`
- `custom_routing_rules`
- `terms_documents`

## Validation Rules (Runtime Enforcement)

Runtime must reject checkout/configuration usage when any condition is true:

1. Manifest `status` is not `RELEASED`.
2. `release_authorized` is not `true`.
3. Any referenced record is draft, disabled, or unreleased.
4. Required metadata versions are missing.
5. `effective_at` is missing or not active for request timestamp.
6. Package references exist without approved active price records.
7. Payment terms are present without attorney-approved released status.
8. Travel calculations require a missing or mismatched released travel rule version.
9. Booking checkout requested without a valid active manifest.

## JSON Schema Draft (Initial)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://happyfacesla.com/schemas/release_manifest_v1.json",
  "title": "HFLA Release Manifest V1",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "release_version",
    "effective_at",
    "released_at",
    "released_by",
    "source_control_reference",
    "status",
    "terms_version",
    "payment_rule_version",
    "travel_rule_version",
    "release_authorized",
    "services",
    "packages",
    "package_prices",
    "add_ons",
    "capacity_rules",
    "travel_rules",
    "payment_rules",
    "public_copy",
    "eligibility_rules",
    "custom_routing_rules",
    "terms_documents"
  ],
  "properties": {
    "release_version": {
      "type": "string",
      "pattern": "^v[0-9]+\\.[0-9]+\\.[0-9]+$"
    },
    "effective_at": {
      "type": "string",
      "format": "date-time"
    },
    "released_at": {
      "type": "string",
      "format": "date-time"
    },
    "released_by": {
      "type": "string",
      "minLength": 1
    },
    "source_control_reference": {
      "type": "string",
      "minLength": 1
    },
    "status": {
      "type": "string",
      "enum": ["RELEASED"]
    },
    "terms_version": {
      "type": "string",
      "minLength": 1
    },
    "payment_rule_version": {
      "type": "string",
      "minLength": 1
    },
    "travel_rule_version": {
      "type": "string",
      "minLength": 1
    },
    "release_authorized": {
      "type": "boolean",
      "const": true
    },
    "services": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/service"
      }
    },
    "packages": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/package"
      }
    },
    "package_prices": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/packagePrice"
      }
    },
    "add_ons": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/addOn"
      }
    },
    "capacity_rules": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/capacityRule"
      }
    },
    "travel_rules": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/travelRule"
      }
    },
    "payment_rules": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/paymentRule"
      }
    },
    "public_copy": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/publicCopy"
      }
    },
    "eligibility_rules": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/eligibilityRule"
      }
    },
    "custom_routing_rules": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/customRoutingRule"
      }
    },
    "terms_documents": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/termsDocument"
      }
    }
  },
  "$defs": {
    "recordMeta": {
      "type": "object",
      "additionalProperties": false,
      "required": ["id", "version", "status", "effective_at"],
      "properties": {
        "id": {"type": "string", "minLength": 1},
        "version": {"type": "string", "minLength": 1},
        "status": {"type": "string", "enum": ["RELEASED"]},
        "effective_at": {"type": "string", "format": "date-time"}
      }
    },
    "service": {
      "allOf": [
        {"$ref": "#/$defs/recordMeta"},
        {
          "type": "object",
          "required": ["name", "active"],
          "properties": {
            "name": {"type": "string"},
            "active": {"type": "boolean"}
          }
        }
      ]
    },
    "package": {
      "allOf": [
        {"$ref": "#/$defs/recordMeta"},
        {
          "type": "object",
          "required": ["name", "service_ids", "active"],
          "properties": {
            "name": {"type": "string"},
            "service_ids": {"type": "array", "minItems": 1, "items": {"type": "string"}},
            "active": {"type": "boolean"}
          }
        }
      ]
    },
    "packagePrice": {
      "allOf": [
        {"$ref": "#/$defs/recordMeta"},
        {
          "type": "object",
          "required": ["package_id", "currency", "amount_minor", "active"],
          "properties": {
            "package_id": {"type": "string"},
            "currency": {"type": "string", "pattern": "^[A-Z]{3}$"},
            "amount_minor": {"type": "integer", "minimum": 0},
            "active": {"type": "boolean"}
          }
        }
      ]
    },
    "addOn": {
      "allOf": [
        {"$ref": "#/$defs/recordMeta"},
        {
          "type": "object",
          "required": ["name", "active"],
          "properties": {
            "name": {"type": "string"},
            "active": {"type": "boolean"}
          }
        }
      ]
    },
    "capacityRule": {
      "allOf": [
        {"$ref": "#/$defs/recordMeta"},
        {"type": "object"}
      ]
    },
    "travelRule": {
      "allOf": [
        {"$ref": "#/$defs/recordMeta"},
        {"type": "object"}
      ]
    },
    "paymentRule": {
      "allOf": [
        {"$ref": "#/$defs/recordMeta"},
        {
          "type": "object",
          "required": ["label", "active"],
          "properties": {
            "label": {"type": "string"},
            "active": {"type": "boolean"}
          }
        }
      ]
    },
    "publicCopy": {
      "allOf": [
        {"$ref": "#/$defs/recordMeta"},
        {
          "type": "object",
          "required": ["key", "value"],
          "properties": {
            "key": {"type": "string"},
            "value": {"type": "string"}
          }
        }
      ]
    },
    "eligibilityRule": {
      "allOf": [
        {"$ref": "#/$defs/recordMeta"},
        {"type": "object"}
      ]
    },
    "customRoutingRule": {
      "allOf": [
        {"$ref": "#/$defs/recordMeta"},
        {"type": "object"}
      ]
    },
    "termsDocument": {
      "allOf": [
        {"$ref": "#/$defs/recordMeta"},
        {
          "type": "object",
          "required": ["document_type", "uri", "checksum"],
          "properties": {
            "document_type": {"type": "string"},
            "uri": {"type": "string"},
            "checksum": {"type": "string"}
          }
        }
      ]
    }
  }
}
```

## Illustrative Non-Runtime Example

The following example is structural only and does not define production-released pricing:

```json
{
  "release_version": "v0.0.0-example",
  "effective_at": "2099-01-01T00:00:00Z",
  "released_at": "2099-01-01T00:00:00Z",
  "released_by": "example-owner",
  "source_control_reference": "docs-only-example",
  "status": "RELEASED",
  "terms_version": "terms-v-example",
  "payment_rule_version": "payment-v-example",
  "travel_rule_version": "travel-v-example",
  "release_authorized": true,
  "services": [],
  "packages": [],
  "package_prices": [],
  "add_ons": [],
  "capacity_rules": [],
  "travel_rules": [],
  "payment_rules": [],
  "public_copy": [],
  "eligibility_rules": [],
  "custom_routing_rules": [],
  "terms_documents": []
}
```

## Notes

- Any implementation must perform schema validation before runtime activation.
- Any mismatch between manifest versions and booking/payment references is a hard failure.
