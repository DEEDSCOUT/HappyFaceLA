#!/usr/bin/env python3
"""
test_mailbox_state_machine.py — Pytest layer for the cross-process harness
==========================================================================
Wraps the full Phase 1–4 cross-process execution (builder + auditor agents
driven through the .agent mailbox) into the automated test suite.

The test programmatically invokes the real execution run via
``run_test_harness.run_harness()``, captures the resulting milestones dict,
and enforces hard assertions on the key state-machine invariants:

  * Task 1 enters an ``edit_required`` cycle.
  * Task 1 recovers and is approved (``proceed``).
  * Task 2 is approved (``proceed``).
  * The builder reaches ``tasks_completed_awaiting_final_signoff``.
  * The run never times out.

Run with:  pytest test_mailbox_state_machine.py
"""

import pytest

from run_test_harness import run_harness


@pytest.fixture(scope="module")
def harness_result():
    """
    Execute the concurrent builder/auditor run exactly once for the module and
    share the structured result across assertions. ``run_harness`` always
    terminates its subprocesses (including on the failure path), so no
    background agents leak out of the fixture.
    """
    result = run_harness()
    assert isinstance(result, dict), "run_harness() must return a result dict"
    assert "milestones" in result, "result dict missing 'milestones'"
    assert "events" in result, "result dict missing 'events'"
    return result


@pytest.fixture(scope="module")
def milestones(harness_result):
    """Convenience accessor for the canonical milestone invariant dict."""
    return harness_result["milestones"]


def test_task1_edit_cycle_triggered(milestones):
    """The auditor must force exactly one edit_required cycle on Task 1."""
    assert milestones["Task 1 edit cycle triggered"] is True


def test_task1_approved_proceed(milestones):
    """Task 1 must recover from the edit cycle and be approved to proceed."""
    assert milestones["Task 1 approved (proceed)"] is True


def test_task2_approved_proceed(milestones):
    """Task 2 must be approved to proceed on first review (no edit needed)."""
    assert milestones["Task 2 approved (proceed)"] is True


def test_final_status_reached(milestones):
    """The builder must reach tasks_completed_awaiting_final_signoff."""
    assert milestones["Final status reached"] is True


def test_did_not_time_out(milestones):
    """The run must complete well within the harness timeout window."""
    assert milestones["Timed out"] is False


def test_overall_success(harness_result):
    """Aggregate sanity check: the harness itself reports overall success."""
    assert harness_result["success"] is True


if __name__ == "__main__":
    # Allow `python test_mailbox_state_machine.py` as a convenience entry point.
    raise SystemExit(pytest.main([__file__, "-v"]))
