/**
 * HappyFacesLA Lead Webhook — Google Apps Script
 *
 * Receives lead payloads from the Cloudflare Pages /api/lead function,
 * appends a row to Google Sheets, and sends a Gmail notification.
 *
 * SETUP INSTRUCTIONS
 * ------------------
 * 1. Open https://script.google.com and create a new project.
 *    Name it "HappyFacesLA Lead Webhook".
 *
 * 2. Paste the entire contents of this file into the editor.
 *
 * 3. Create a new Google Sheet (or open the existing leads sheet).
 *    Copy the Sheet ID from its URL:
 *    https://docs.google.com/spreadsheets/d/SHEET_ID_IS_HERE/edit
 *    Paste it into SHEET_ID below.
 *
 * 4. Set NOTIFICATION_EMAIL to the email address that should receive
 *    new-lead notifications.
 *
 * 5. Click Deploy > New deployment.
 *    - Type: Web App
 *    - Execute as: Me
 *    - Who has access: Anyone
 *    Click Deploy and copy the Web App URL.
 *
 * 6. In Cloudflare Pages dashboard:
 *    Settings > Environment variables > Production
 *    Add (or update):
 *      CRM_WEBHOOK_URL = <the Web App URL from step 5>
 *    Also add if not present:
 *      OWNER_NOTIFICATION_EMAIL = <same email as NOTIFICATION_EMAIL>
 *    Redeploy the site so the new variable takes effect.
 *
 * 7. Test by submitting the contact form. The lead should appear in the
 *    sheet and an email should arrive within seconds.
 *
 * SHEET COLUMNS (auto-created on first lead if sheet is missing)
 * Lead ID | Submitted At | First Name | Last Name | Phone | Email |
 * Event Date | Event Time | Event City | Address | Event Type |
 * Guest Count | Children Count | Services | Budget | Message |
 * Source Page | UTM Source | UTM Medium | UTM Campaign |
 * UTM Term | UTM Content | GCLID | FBCLID | MSCLKID | Consent |
 * Lead Source | Campaign | Selected Package | Organization / Venue |
 * Package Interest | Painting Window | Venue Permission Confirmed |
 * Invoice / COI Need
 */

// ── Configure these two values ──────────────────────────────────────────────
var SHEET_ID = "YOUR_GOOGLE_SHEET_ID_HERE";
var NOTIFICATION_EMAIL = "YOUR_EMAIL_HERE";

// Name of the tab within the spreadsheet where leads are written.
var SHEET_NAME = "Leads";
// ────────────────────────────────────────────────────────────────────────────

var LEAD_HEADERS = [
  "Lead ID", "Submitted At",
  "First Name", "Last Name", "Phone", "Email",
  "Event Date", "Event Time", "Event City", "Address",
  "Event Type", "Guest Count", "Children Count",
  "Services", "Budget", "Message",
  "Source Page", "UTM Source", "UTM Medium", "UTM Campaign",
  "UTM Term", "UTM Content", "GCLID", "FBCLID", "MSCLKID",
  "Consent",
  "Lead Source", "Campaign", "Selected Package",
  "Organization / Venue", "Package Interest", "Painting Window",
  "Venue Permission Confirmed", "Invoice / COI Need"
];

function doPost(e) {
  try {
    var raw = e.postData ? e.postData.contents : "{}";
    var payload = JSON.parse(raw);
    var lead = payload.lead || {};
    var leadId = payload.leadId || generateId();
    var submittedAt = payload.submittedAt || new Date().toISOString();

    appendLeadToSheet(leadId, submittedAt, lead);
    sendLeadEmail(leadId, submittedAt, lead);

    return jsonResponse({ ok: true, leadId: leadId });
  } catch (err) {
    console.error("Lead webhook error: " + err);
    return jsonResponse({ ok: false, error: String(err) });
  }
}

// ── Sheet writer ─────────────────────────────────────────────────────────────

function appendLeadToSheet(leadId, submittedAt, lead) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  ensureLeadHeader(sheet);

  var services = (lead.services_requested || []).join(", ");
  var valuesByHeader = {
    "Lead ID": leadId,
    "Submitted At": submittedAt,
    "First Name": lead.first_name || "",
    "Last Name": lead.last_name || "",
    "Phone": lead.phone || "",
    "Email": lead.email || "",
    "Event Date": lead.event_date || "",
    "Event Time": lead.event_start_time || "",
    "Event City": lead.event_city || "",
    "Address": lead.event_address_or_cross_streets_optional || "",
    "Event Type": lead.event_type || "",
    "Guest Count": lead.estimated_guest_count || "",
    "Children Count": lead.children_count_optional || "",
    "Services": services,
    "Budget": lead.budget_range || "",
    "Message": lead.message || "",
    "Source Page": lead.source_page || "",
    "UTM Source": lead.utm_source || "",
    "UTM Medium": lead.utm_medium || "",
    "UTM Campaign": lead.utm_campaign || "",
    "UTM Term": lead.utm_term || "",
    "UTM Content": lead.utm_content || "",
    "GCLID": lead.gclid || "",
    "FBCLID": lead.fbclid || "",
    "MSCLKID": lead.msclkid || "",
    "Consent": lead.consent_to_contact ? "Yes" : "No",
    "Lead Source": lead.lead_source || "",
    "Campaign": lead.campaign || "",
    "Selected Package": lead.selected_package || "",
    "Organization / Venue": lead.organization_venue_name || "",
    "Package Interest": lead.package_interest || "",
    "Painting Window": lead.painting_window || "",
    "Venue Permission Confirmed": lead.venue_permission_confirmed || "",
    "Invoice / COI Need": lead.need_invoice_coi || ""
  };

  sheet.appendRow(buildLeadRow(sheet, valuesByHeader));
}

function ensureLeadHeader(sheet) {
  var lastColumn = Math.max(sheet.getLastColumn(), 1);
  var existing = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  var hasAnyHeader = existing.some(function (value) {
    return String(value || "").trim() !== "";
  });

  if (!hasAnyHeader) {
    sheet.getRange(1, 1, 1, LEAD_HEADERS.length).setValues([LEAD_HEADERS]);
    sheet.getRange(1, 1, 1, LEAD_HEADERS.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
    return;
  }

  var existingNames = {};
  existing.forEach(function (value) {
    var header = String(value || "").trim();
    if (header) {
      existingNames[header] = true;
    }
  });

  var missingHeaders = LEAD_HEADERS.filter(function (header) {
    return !existingNames[header];
  });

  if (!missingHeaders.length) {
    sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), LEAD_HEADERS.length)).setFontWeight("bold");
    sheet.setFrozenRows(1);
    return;
  }

  var appendStartColumn = sheet.getLastColumn() + 1;
  sheet.getRange(1, appendStartColumn, 1, missingHeaders.length).setValues([missingHeaders]);
  sheet.getRange(1, 1, 1, appendStartColumn + missingHeaders.length - 1).setFontWeight("bold");
  sheet.setFrozenRows(1);
}

function buildLeadRow(sheet, valuesByHeader) {
  var headers = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .map(function (value) {
      return String(value || "").trim();
    });

  return headers.map(function (header) {
    return Object.prototype.hasOwnProperty.call(valuesByHeader, header) ? valuesByHeader[header] : "";
  });
}

// ── Email notification ────────────────────────────────────────────────────────

function sendLeadEmail(leadId, submittedAt, lead) {
  var services = (lead.services_requested || []).join(", ") || "Not specified";
  var name = ((lead.first_name || "") + " " + (lead.last_name || "")).trim();
  var subject = "New Lead: " + name + " — " + (lead.event_type || "Event") + " in " + (lead.event_city || "unknown city");

  var body = [
    "New quote request received from happyfacesla.com",
    "",
    "CONTACT INFORMATION",
    "-------------------",
    "Name:   " + name,
    "Email:  " + (lead.email || ""),
    "Phone:  " + (lead.phone || ""),
    "",
    "EVENT DETAILS",
    "-------------",
    "Date:          " + (lead.event_date || ""),
    "Time:          " + (lead.event_start_time || ""),
    "City:          " + (lead.event_city || ""),
    "Address:       " + (lead.event_address_or_cross_streets_optional || "Not provided"),
    "Event Type:    " + (lead.event_type || ""),
    "Guest Count:   " + (lead.estimated_guest_count || ""),
    "Children:      " + (lead.children_count_optional || "Not specified"),
    "Services:      " + services,
    "Budget:        " + (lead.budget_range || "Not specified"),
    "",
    "SOCCER / B2B DETAILS",
    "--------------------",
    "Lead Source:              " + (lead.lead_source || "Not specified"),
    "Campaign:                 " + (lead.campaign || "Not specified"),
    "Selected Package:         " + (lead.selected_package || "Not specified"),
    "Organization / Venue:     " + (lead.organization_venue_name || "Not specified"),
    "Package Interest:         " + (lead.package_interest || "Not specified"),
    "Painting Window:          " + (lead.painting_window || "Not specified"),
    "Venue Permission:         " + (lead.venue_permission_confirmed || "Not specified"),
    "Invoice / COI Need:       " + (lead.need_invoice_coi || "Not specified"),
    "",
    "MESSAGE",
    "-------",
    (lead.message || "None"),
    "",
    "ATTRIBUTION",
    "-----------",
    "Source Page:   " + (lead.source_page || ""),
    "UTM Source:    " + (lead.utm_source || "None"),
    "UTM Medium:    " + (lead.utm_medium || "None"),
    "UTM Campaign:  " + (lead.utm_campaign || "None"),
    "UTM Term:      " + (lead.utm_term || "None"),
    "UTM Content:   " + (lead.utm_content || "None"),
    "GCLID:         " + (lead.gclid || "None"),
    "FBCLID:        " + (lead.fbclid || "None"),
    "",
    "Lead ID:       " + leadId,
    "Submitted At:  " + submittedAt,
  ].join("\n");

  GmailApp.sendEmail(NOTIFICATION_EMAIL, subject, body);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateId() {
  return "lead_" + new Date().getTime() + "_" + Math.random().toString(36).slice(2, 8);
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
