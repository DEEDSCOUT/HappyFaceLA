"""
Fetch live lead data from the publicly published Google Sheet CSV stream.

Pulls the sheet in-memory via requests, parses it with pandas, and returns
a clean DataFrame — no files are written to disk.

Requirements: requests, pandas
"""

import io
import requests
import pandas as pd

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

LEADS_CSV_URL: str = (
    "https://docs.google.com/spreadsheets/d/e/"
    "2PACX-1vTbzjKZZxVgNTd-S9igv_50YlGPwFOIV-MVJh7UNrRMqOZBDyWY6m3J-LlO6mtKYId"
    "FOh0b2f7edZgz/pub?gid=0&single=true&output=csv"
)

# Seconds to wait for the remote server to respond / send data.
REQUEST_TIMEOUT: tuple[int, int] = (10, 30)  # (connect timeout, read timeout)


# ---------------------------------------------------------------------------
# Core function
# ---------------------------------------------------------------------------


def get_live_leads() -> pd.DataFrame:
    """Fetch the live leads CSV from Google Sheets and return it as a DataFrame.

    Returns:
        pd.DataFrame: All rows from the published sheet, with the original
            column headers preserved.

    Raises:
        requests.exceptions.ConnectionError: If the host cannot be reached.
        requests.exceptions.Timeout: If the request exceeds REQUEST_TIMEOUT.
        requests.exceptions.HTTPError: If the server returns a non-2xx status.
        ValueError: If the response body cannot be parsed as CSV.
    """
    try:
        response = requests.get(LEADS_CSV_URL, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
    except requests.exceptions.ConnectionError as exc:
        raise requests.exceptions.ConnectionError(
            "Could not reach Google Sheets. Check your network connection."
        ) from exc
    except requests.exceptions.Timeout as exc:
        raise requests.exceptions.Timeout(
            f"Request timed out after {REQUEST_TIMEOUT} seconds."
        ) from exc
    except requests.exceptions.HTTPError as exc:
        raise requests.exceptions.HTTPError(
            f"Server returned an error: {exc.response.status_code} "
            f"{exc.response.reason}"
        ) from exc

    try:
        df = pd.read_csv(io.StringIO(response.text))
    except Exception as exc:
        raise ValueError(
            "Response was received but could not be parsed as CSV."
        ) from exc

    return df


# ---------------------------------------------------------------------------
# Local test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("Fetching live leads from Google Sheets…\n")

    leads_df = get_live_leads()

    print(f"Total leads : {len(leads_df)}")
    print(f"Columns     : {leads_df.columns.tolist()}")
    print("\n--- Top 2 rows ---")
    print(leads_df.head(2).to_string(index=False))
