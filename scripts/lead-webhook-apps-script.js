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
 * Lead Source | Campaign | Selected Package | Organization / Venue |
 * Package Interest | Painting Window | Venue Permission Confirmed |
 * Invoice / COI Need | Source Page | UTM Source | UTM Medium |
 * UTM Campaign | UTM Term | UTM Content | GCLID | FBCLID | MSCLKID |
 * Consent
 */

// ── Configure these two values ──────────────────────────────────────────────
var SHEET_ID = "YOUR_GOOGLE_SHEET_ID_HERE";
var NOTIFICATION_EMAIL = "YOUR_EMAIL_HERE";

// Name of the tab within the spreadsheet where leads are written.
var SHEET_NAME = "Leads";
// ────────────────────────────────────────────────────────────────────────────

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
    sheet.appendRow([
      "Lead ID", "Submitted At",
      "First Name", "Last Name", "Phone", "Email",
      "Event Date", "Event Time", "Event City", "Address",
      "Event Type", "Guest Count", "Children Count",
      "Services", "Budget", "Message",
      "Lead Source", "Campaign", "Selected Package",
      "Organization / Venue", "Package Interest", "Painting Window",
      "Venue Permission Confirmed", "Invoice / COI Need",
      "Source Page", "UTM Source", "UTM Medium", "UTM Campaign",
      "UTM Term", "UTM Content", "GCLID", "FBCLID", "MSCLKID",
      "Consent"
    ]);
    // Bold the header row
    sheet.getRange(1, 1, 1, 34).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  var services = (lead.services_requested || []).join(", ");

  sheet.appendRow([
    leadId,
    submittedAt,
    lead.first_name || "",
    lead.last_name || "",
    lead.phone || "",
    lead.email || "",
    lead.event_date || "",
    lead.event_start_time || "",
    lead.event_city || "",
    lead.event_address_or_cross_streets_optional || "",
    lead.event_type || "",
    lead.estimated_guest_count || "",
    lead.children_count_optional || "",
    services,
    lead.budget_range || "",
    lead.message || "",
    lead.lead_source || "",
    lead.campaign || "",
    lead.selected_package || "",
    lead.organization_venue_name || "",
    lead.package_interest || "",
    lead.painting_window || "",
    lead.venue_permission_confirmed || "",
    lead.need_invoice_coi || "",
    lead.source_page || "",
    lead.utm_source || "",
    lead.utm_medium || "",
    lead.utm_campaign || "",
    lead.utm_term || "",
    lead.utm_content || "",
    lead.gclid || "",
    lead.fbclid || "",
    lead.msclkid || "",
    lead.consent_to_contact ? "Yes" : "No"
  ]);
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
