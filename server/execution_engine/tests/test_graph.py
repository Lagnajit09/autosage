"""
Unit tests for execution_engine.graph — covering all three node types
(trigger, action, decision) and all three edge types (normal, true, false).

No Django dependencies — pure Python/pytest.

Run with:
    venv\\Scripts\\python -m pytest execution_engine/test_graph.py -v
"""

import json
import os
import pytest
import networkx as nx

from execution_engine.graph import (
    # construction
    build_dag,
    # ordering
    topological_order,
    get_node_data,
    get_edge_handle,
    get_outgoing_branches,
    get_branch_subgraph,
    get_independent_groups,
    # validation
    validate_executable_nodes,
    validate_decision_nodes,
    get_output_references,
    # constants
    NODE_TYPE_TRIGGER,
    NODE_TYPE_ACTION,
    NODE_TYPE_DECISION,
    EDGE_HANDLE_TRUE,
    EDGE_HANDLE_FALSE,
)


# ─────────────────────────────────────────────────────────────────────────────
# Shared fixtures / builder helpers
# ─────────────────────────────────────────────────────────────────────────────

def make_trigger(node_id: str = "trigger-1") -> dict:
    return {
        "id": node_id,
        "type": "trigger",
        "data": {"type": "manual", "label": "Manual Trigger", "description": ""},
        "position": {"x": 0, "y": 0},
    }


def make_action(
    node_id: str,
    action_type: str = "script",
    script_id: str = "42",
    label: str = "",
    vault_id: str = "v1",
    server_id: str = "s1",
    credential_id: str = "c1",
    parameters: list | None = None,
) -> dict:
    data: dict = {
        "type": action_type,
        "label": label or node_id,
        "description": "",
    }
    if action_type == "script":
        data["selectedScript"] = {"scriptId": script_id, "type": "Powershell Script"}
        data["vaultDetails"] = {
            "vaultId": vault_id,
            "serverId": server_id,
            "credentialId": credential_id,
        }
        data["outputFormat"] = "json"
    if parameters:
        data["parameters"] = parameters
    return {
        "id": node_id,
        "type": "action",
        "data": data,
        "position": {"x": 0, "y": 0},
    }


def make_decision(
    node_id: str,
    true_targets: list[str] | None = None,
    false_targets: list[str] | None = None,
    conditions: list | None = None,
    parameters: list | None = None,
) -> dict:
    return {
        "id": node_id,
        "type": "decision",
        "data": {
            "label": "Condition Check",
            "conditions": conditions or [
                {"field": "{{action-1.output.RESULT}}", "operator": ">=", "value": "80"}
            ],
            "trueLabel": true_targets or [],
            "falseLabel": false_targets or [],
            "parameters": parameters or [],
            "description": "",
        },
        "position": {"x": 0, "y": 0},
    }


def make_edge(
    source: str,
    target: str,
    handle: str | None = None,
) -> dict:
    edge: dict = {
        "id": f"e-{source}-{target}",
        "type": "smoothstep",
        "source": source,
        "target": target,
    }
    if handle is not None:
        edge["sourceHandle"] = handle
    return edge


def make_true_edge(source: str, target: str) -> dict:
    return make_edge(source, target, handle="true")


def make_false_edge(source: str, target: str) -> dict:
    return make_edge(source, target, handle="false")


# ─────────────────────────────────────────────────────────────────────────────
# Fixture: demo_workflow.json loaded as a real-world integration test
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def demo_workflow() -> dict:
    """Load the demo_workflow.json from the seed directory."""
    json_path = os.path.join(os.path.dirname(__file__), "..", "seed", "demo_workflow.json")
    with open(json_path, encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def demo_graph(demo_workflow) -> nx.DiGraph:
    return build_dag(demo_workflow["nodes"], demo_workflow["edges"])


# ─────────────────────────────────────────────────────────────────────────────
# TestBuildDag — happy paths
# ─────────────────────────────────────────────────────────────────────────────

class TestBuildDag:

    def test_minimal_trigger_only(self):
        """Single trigger with no edges is a valid (trivial) workflow."""
        G = build_dag([make_trigger()], [])
        assert list(G.nodes()) == ["trigger-1"]
        assert list(G.edges()) == []

    def test_linear_trigger_action_chain(self):
        """trigger → action-1 → action-2"""
        nodes = [make_trigger(), make_action("action-1"), make_action("action-2")]
        edges = [make_edge("trigger-1", "action-1"), make_edge("action-1", "action-2")]
        G = build_dag(nodes, edges)
        assert set(G.nodes()) == {"trigger-1", "action-1", "action-2"}
        assert ("trigger-1", "action-1") in G.edges()
        assert ("action-1", "action-2") in G.edges()

    def test_full_decision_branch_structure(self):
        """trigger → action → decision → (true: action-t | false: action-f)"""
        nodes = [
            make_trigger(),
            make_action("action-1"),
            make_decision("decision-1", true_targets=["action-t"], false_targets=["action-f"]),
            make_action("action-t"),
            make_action("action-f"),
        ]
        edges = [
            make_edge("trigger-1", "action-1"),
            make_edge("action-1", "decision-1"),
            make_true_edge("decision-1", "action-t"),
            make_false_edge("decision-1", "action-f"),
        ]
        G = build_dag(nodes, edges)
        assert nx.is_directed_acyclic_graph(G)
        assert set(G.nodes()) == {"trigger-1", "action-1", "decision-1", "action-t", "action-f"}

    def test_node_attributes_stored(self):
        """Full node JSON must be retrievable from the graph."""
        action = make_action("action-1", label="Deploy", script_id="sid-99")
        G = build_dag([make_trigger(), action], [make_edge("trigger-1", "action-1")])
        attrs = G.nodes["action-1"]
        assert attrs["data"]["label"] == "Deploy"
        assert attrs["data"]["selectedScript"]["scriptId"] == "sid-99"

    def test_edge_handle_stored_for_normal_edge(self):
        nodes = [make_trigger(), make_action("action-1")]
        edges = [make_edge("trigger-1", "action-1")]  # no sourceHandle
        G = build_dag(nodes, edges)
        handle = G.edges["trigger-1", "action-1"].get("sourceHandle")
        assert handle is None

    def test_edge_handle_stored_for_true_false(self):
        nodes = [
            make_trigger(),
            make_action("action-1"),
            make_decision("decision-1", ["action-t"], ["action-f"]),
            make_action("action-t"),
            make_action("action-f"),
        ]
        edges = [
            make_edge("trigger-1", "action-1"),
            make_edge("action-1", "decision-1"),
            make_true_edge("decision-1", "action-t"),
            make_false_edge("decision-1", "action-f"),
        ]
        G = build_dag(nodes, edges)
        assert G.edges["decision-1", "action-t"]["sourceHandle"] == "true"
        assert G.edges["decision-1", "action-f"]["sourceHandle"] == "false"

    def test_email_action_no_script_required(self):
        """Non-script action nodes (type='email') are valid without selectedScript."""
        nodes = [
            make_trigger(),
            make_action("action-email", action_type="email"),
        ]
        G = build_dag(nodes, [make_edge("trigger-1", "action-email")])
        assert "action-email" in G.nodes()

    def test_demo_workflow_parses_successfully(self, demo_workflow):
        G = build_dag(demo_workflow["nodes"], demo_workflow["edges"])
        assert nx.is_directed_acyclic_graph(G)
        assert len(G.nodes()) == 5
        assert len(G.edges()) == 4


# ─────────────────────────────────────────────────────────────────────────────
# TestBuildDag — structural errors
# ─────────────────────────────────────────────────────────────────────────────

class TestBuildDagErrors:

    def test_empty_nodes_raises(self):
        with pytest.raises(ValueError, match="no nodes"):
            build_dag([], [])

    def test_no_trigger_raises(self):
        nodes = [make_action("action-1")]
        with pytest.raises(ValueError, match="trigger"):
            build_dag(nodes, [])

    def test_two_triggers_raises(self):
        nodes = [make_trigger("trigger-1"), make_trigger("trigger-2")]
        with pytest.raises(ValueError, match="exactly one trigger"):
            build_dag(nodes, [])

    def test_unknown_source_node_raises(self):
        nodes = [make_trigger(), make_action("action-1")]
        edges = [make_edge("GHOST", "action-1")]
        with pytest.raises(ValueError, match="unknown source node"):
            build_dag(nodes, edges)

    def test_unknown_target_node_raises(self):
        nodes = [make_trigger()]
        edges = [make_edge("trigger-1", "GHOST")]
        with pytest.raises(ValueError, match="unknown target node"):
            build_dag(nodes, edges)

    def test_cycle_raises(self):
        """A → B → A is a cycle."""
        nodes = [make_trigger(), make_action("action-1"), make_action("action-2")]
        edges = [
            make_edge("trigger-1", "action-1"),
            make_edge("action-1", "action-2"),
            make_edge("action-2", "action-1"),
        ]
        with pytest.raises(ValueError, match="cycle"):
            build_dag(nodes, edges)

    def test_self_loop_raises(self):
        nodes = [make_trigger(), make_action("action-1")]
        edges = [make_edge("action-1", "action-1")]
        with pytest.raises(ValueError, match="cycle"):
            build_dag(nodes, edges)

    def test_decision_missing_true_edge_raises(self):
        nodes = [
            make_trigger(),
            make_decision("decision-1", ["action-t"], ["action-f"]),
            make_action("action-f"),
        ]
        # Only false edge provided
        edges = [
            make_edge("trigger-1", "decision-1"),
            make_false_edge("decision-1", "action-f"),
        ]
        with pytest.raises(ValueError, match="missing a true-edge"):
            build_dag(nodes, edges)

    def test_decision_missing_false_edge_raises(self):
        nodes = [
            make_trigger(),
            make_decision("decision-1", ["action-t"], ["action-f"]),
            make_action("action-t"),
        ]
        edges = [
            make_edge("trigger-1", "decision-1"),
            make_true_edge("decision-1", "action-t"),
        ]
        with pytest.raises(ValueError, match="missing a false-edge"):
            build_dag(nodes, edges)

    def test_decision_extra_edge_raises(self):
        nodes = [
            make_trigger(),
            make_decision("decision-1", ["action-t"], ["action-f"]),
            make_action("action-t"),
            make_action("action-f"),
            make_action("action-extra"),
        ]
        edges = [
            make_edge("trigger-1", "decision-1"),
            make_true_edge("decision-1", "action-t"),
            make_false_edge("decision-1", "action-f"),
            make_edge("decision-1", "action-extra"),  # 3rd edge
        ]
        with pytest.raises(ValueError, match="exactly 2 outgoing edges"):
            build_dag(nodes, edges)

    def test_non_decision_emitting_true_edge_raises(self):
        nodes = [make_trigger(), make_action("action-1"), make_action("action-2")]
        edges = [
            make_edge("trigger-1", "action-1"),
            make_true_edge("action-1", "action-2"),  # invalid — action emitting true
        ]
        with pytest.raises(ValueError, match="Non-decision node"):
            build_dag(nodes, edges)


# ─────────────────────────────────────────────────────────────────────────────
# TestTopologicalOrder
# ─────────────────────────────────────────────────────────────────────────────

class TestTopologicalOrder:

    def test_linear_order(self):
        nodes = [make_trigger(), make_action("action-1"), make_action("action-2")]
        edges = [make_edge("trigger-1", "action-1"), make_edge("action-1", "action-2")]
        G = build_dag(nodes, edges)
        order = topological_order(G)
        assert order == ["trigger-1", "action-1", "action-2"]

    def test_single_trigger(self):
        G = build_dag([make_trigger()], [])
        assert topological_order(G) == ["trigger-1"]

    def test_predecessor_always_before_successor(self):
        """For every edge (u→v), u's index must be < v's index."""
        nodes = [
            make_trigger(),
            make_action("action-1"),
            make_decision("decision-1", ["action-t"], ["action-f"]),
            make_action("action-t"),
            make_action("action-f"),
        ]
        edges = [
            make_edge("trigger-1", "action-1"),
            make_edge("action-1", "decision-1"),
            make_true_edge("decision-1", "action-t"),
            make_false_edge("decision-1", "action-f"),
        ]
        G = build_dag(nodes, edges)
        order = topological_order(G)
        pos = {nid: i for i, nid in enumerate(order)}
        for u, v in G.edges():
            assert pos[u] < pos[v], f"Edge {u}→{v} violated order: {order}"

    def test_decision_branches_both_in_order(self):
        """Both true-branch and false-branch nodes must appear after the decision."""
        nodes = [
            make_trigger(),
            make_action("action-1"),
            make_decision("decision-1", ["action-t"], ["action-f"]),
            make_action("action-t"),
            make_action("action-f"),
        ]
        edges = [
            make_edge("trigger-1", "action-1"),
            make_edge("action-1", "decision-1"),
            make_true_edge("decision-1", "action-t"),
            make_false_edge("decision-1", "action-f"),
        ]
        G = build_dag(nodes, edges)
        order = topological_order(G)
        d_idx = order.index("decision-1")
        assert order.index("action-t") > d_idx
        assert order.index("action-f") > d_idx

    def test_demo_workflow_topological_order(self, demo_graph):
        """Verify demo workflow: trigger first, then action, decision, then branches."""
        order = topological_order(demo_graph)
        trigger_idx  = next(i for i, n in enumerate(order) if "trigger"  in n)
        action_idx   = next(i for i, n in enumerate(order) if "action-1771310603866" in n)
        decision_idx = next(i for i, n in enumerate(order) if "decision" in n)
        assert trigger_idx < action_idx < decision_idx
        # Both branch actions must come after the decision
        for nid in order:
            if nid in ("action-1771310622803", "action-1771310629189"):
                assert order.index(nid) > decision_idx


# ─────────────────────────────────────────────────────────────────────────────
# TestGetNodeData / TestGetEdgeHandle
# ─────────────────────────────────────────────────────────────────────────────

class TestGetNodeData:

    def test_returns_trigger_data(self):
        G = build_dag([make_trigger()], [])
        data = get_node_data(G, "trigger-1")
        assert data["type"] == "trigger"

    def test_returns_action_script_id(self):
        nodes = [make_trigger(), make_action("action-1", script_id="sid-007")]
        G = build_dag(nodes, [make_edge("trigger-1", "action-1")])
        data = get_node_data(G, "action-1")
        assert data["data"]["selectedScript"]["scriptId"] == "sid-007"

    def test_returns_decision_conditions(self):
        nodes = [
            make_trigger(),
            make_decision("decision-1",
                          conditions=[{"field": "{{action-1.output.CPU}}", "operator": ">", "value": "90"}],
                          true_targets=["action-t"], false_targets=["action-f"]),
            make_action("action-t"), make_action("action-f"),
        ]
        edges = [
            make_edge("trigger-1", "decision-1"),
            make_true_edge("decision-1", "action-t"),
            make_false_edge("decision-1", "action-f"),
        ]
        G = build_dag(nodes, edges)
        data = get_node_data(G, "decision-1")
        assert data["data"]["conditions"][0]["operator"] == ">"

    def test_missing_node_raises_key_error(self):
        G = build_dag([make_trigger()], [])
        with pytest.raises(KeyError):
            get_node_data(G, "DOES_NOT_EXIST")


class TestGetEdgeHandle:

    def test_normal_edge_handle_is_none(self):
        nodes = [make_trigger(), make_action("action-1")]
        G = build_dag(nodes, [make_edge("trigger-1", "action-1")])
        assert get_edge_handle(G, "trigger-1", "action-1") is None

    def test_true_edge_handle(self):
        nodes = [
            make_trigger(), make_action("action-1"),
            make_decision("decision-1", ["action-t"], ["action-f"]),
            make_action("action-t"), make_action("action-f"),
        ]
        edges = [
            make_edge("trigger-1", "action-1"),
            make_edge("action-1", "decision-1"),
            make_true_edge("decision-1", "action-t"),
            make_false_edge("decision-1", "action-f"),
        ]
        G = build_dag(nodes, edges)
        assert get_edge_handle(G, "decision-1", "action-t") == "true"
        assert get_edge_handle(G, "decision-1", "action-f") == "false"


# ─────────────────────────────────────────────────────────────────────────────
# TestGetOutgoingBranches
# ─────────────────────────────────────────────────────────────────────────────

class TestGetOutgoingBranches:

    def _make_decision_graph(self):
        nodes = [
            make_trigger(), make_action("action-1"),
            make_decision("decision-1", ["action-t"], ["action-f"]),
            make_action("action-t"), make_action("action-f"),
        ]
        edges = [
            make_edge("trigger-1", "action-1"),
            make_edge("action-1", "decision-1"),
            make_true_edge("decision-1", "action-t"),
            make_false_edge("decision-1", "action-f"),
        ]
        return build_dag(nodes, edges)

    def test_returns_both_branches(self):
        G = self._make_decision_graph()
        branches = get_outgoing_branches(G, "decision-1")
        assert branches == {"true": "action-t", "false": "action-f"}

    def test_non_decision_node_raises(self):
        G = self._make_decision_graph()
        with pytest.raises(ValueError, match="not a decision node"):
            get_outgoing_branches(G, "action-1")

    def test_demo_workflow_branches(self, demo_graph):
        branches = get_outgoing_branches(demo_graph, "decision-1771310615633")
        assert branches["true"]  == "action-1771310622803"
        assert branches["false"] == "action-1771310629189"


# ─────────────────────────────────────────────────────────────────────────────
# TestGetBranchSubgraph
# ─────────────────────────────────────────────────────────────────────────────

class TestGetBranchSubgraph:

    def test_leaf_node_returns_itself(self):
        nodes = [
            make_trigger(), make_action("action-1"),
            make_decision("decision-1", ["action-t"], ["action-f"]),
            make_action("action-t"), make_action("action-f"),
        ]
        edges = [
            make_edge("trigger-1", "action-1"),
            make_edge("action-1", "decision-1"),
            make_true_edge("decision-1", "action-t"),
            make_false_edge("decision-1", "action-f"),
        ]
        G = build_dag(nodes, edges)
        assert get_branch_subgraph(G, "action-t") == {"action-t"}
        assert get_branch_subgraph(G, "action-f") == {"action-f"}

    def test_branch_includes_all_descendants(self):
        """
        trigger → action-1 → decision → true: action-t → action-t2
                                      → false: action-f
        get_branch_subgraph from action-t should return {action-t, action-t2}.
        """
        nodes = [
            make_trigger(), make_action("action-1"),
            make_decision("decision-1", ["action-t"], ["action-f"]),
            make_action("action-t"), make_action("action-t2"), make_action("action-f"),
        ]
        edges = [
            make_edge("trigger-1", "action-1"),
            make_edge("action-1", "decision-1"),
            make_true_edge("decision-1", "action-t"),
            make_false_edge("decision-1", "action-f"),
            make_edge("action-t", "action-t2"),
        ]
        G = build_dag(nodes, edges)
        assert get_branch_subgraph(G, "action-t") == {"action-t", "action-t2"}
        assert get_branch_subgraph(G, "action-f") == {"action-f"}

    def test_skipped_branch_in_demo_workflow(self, demo_graph):
        """
        If decision resolves True, nodes reachable from the false-branch target
        represent the skipped set.
        """
        false_branch = get_branch_subgraph(demo_graph, "action-1771310629189")
        assert "action-1771310629189" in false_branch
        # True branch is not in the false subgraph
        assert "action-1771310622803" not in false_branch


# ─────────────────────────────────────────────────────────────────────────────
# TestValidateExecutableNodes
# ─────────────────────────────────────────────────────────────────────────────

class TestValidateExecutableNodes:

    def test_all_script_actions_bound_returns_empty(self):
        nodes = [make_trigger(), make_action("action-1"), make_action("action-2")]
        assert validate_executable_nodes(nodes) == []

    def test_trigger_not_in_missing(self):
        """Trigger nodes are never executable — should never appear in results."""
        nodes = [make_trigger()]
        assert validate_executable_nodes(nodes) == []

    def test_decision_not_in_missing(self):
        """Decision nodes have no script — should never appear in results."""
        nodes = [make_decision("decision-1", [], [])]
        assert validate_executable_nodes(nodes) == []

    def test_email_action_not_in_missing(self):
        """Email actions don't need a script binding."""
        nodes = [make_action("action-email", action_type="email")]
        assert validate_executable_nodes(nodes) == []

    def test_script_action_missing_selected_script(self):
        node = {
            "id": "action-bad",
            "type": "action",
            "data": {"type": "script", "label": "Bad"},
            "position": {"x": 0, "y": 0},
        }
        assert validate_executable_nodes([node]) == ["action-bad"]

    def test_script_action_empty_script_id(self):
        node = make_action("action-empty", script_id="")
        # Force selectedScript.scriptId to be empty
        node["data"]["selectedScript"]["scriptId"] = ""
        assert validate_executable_nodes([node]) == ["action-empty"]

    def test_script_action_null_script_id(self):
        node = make_action("action-null", script_id="")
        node["data"]["selectedScript"] = None
        assert validate_executable_nodes([node]) == ["action-null"]

    def test_multiple_missing_returned(self):
        bad1 = {"id": "a1", "type": "action", "data": {"type": "script"}, "position": {}}
        bad2 = {"id": "a2", "type": "action", "data": {"type": "script"}, "position": {}}
        good = make_action("a3")
        result = validate_executable_nodes([bad1, bad2, good])
        assert set(result) == {"a1", "a2"}

    def test_demo_workflow_action_has_script(self, demo_workflow):
        """The demo workflow's script action has a bound scriptId."""
        missing = validate_executable_nodes(demo_workflow["nodes"])
        # CheckMEMORY action has scriptId=19
        assert "action-1771310603866" not in missing
        # Email actions are type='email' so not checked
        assert missing == []


# ─────────────────────────────────────────────────────────────────────────────
# TestValidateDecisionNodes
# ─────────────────────────────────────────────────────────────────────────────

class TestValidateDecisionNodes:

    def test_decision_with_conditions_is_valid(self):
        nodes = [
            make_decision("decision-1",
                          conditions=[{"field": "x", "operator": ">", "value": "0"}])
        ]
        assert validate_decision_nodes(nodes) == []

    def test_decision_without_conditions_flagged(self):
        node = {
            "id": "decision-bad",
            "type": "decision",
            "data": {"label": "Empty", "conditions": [], "trueLabel": [], "falseLabel": []},
            "position": {},
        }
        assert validate_decision_nodes([node]) == ["decision-bad"]

    def test_non_decision_nodes_ignored(self):
        nodes = [make_trigger(), make_action("action-1")]
        assert validate_decision_nodes(nodes) == []

    def test_demo_workflow_decision_is_valid(self, demo_workflow):
        assert validate_decision_nodes(demo_workflow["nodes"]) == []


# ─────────────────────────────────────────────────────────────────────────────
# TestGetOutputReferences
# ─────────────────────────────────────────────────────────────────────────────

class TestGetOutputReferences:

    def test_no_references_returns_empty(self):
        nodes = [make_trigger(), make_action("action-1")]
        assert get_output_references(nodes) == {}

    def test_condition_reference_detected(self):
        """Decision node condition referencing action-1's output."""
        nodes = [
            make_decision(
                "decision-1",
                conditions=[{"field": "{{action-1.output.MEMORY}}", "operator": ">=", "value": "80"}],
            )
        ]
        refs = get_output_references(nodes)
        assert "decision-1" in refs
        assert "action-1" in refs["decision-1"]

    def test_parameter_reference_detected(self):
        """Action/decision parameter value referencing another node's output."""
        nodes = [
            make_action(
                "action-2",
                parameters=[{
                    "id": "p1", "name": "THRESHOLD",
                    "value": "{{action-1.output.MEMORY}}", "type": "number",
                }],
            )
        ]
        refs = get_output_references(nodes)
        assert "action-2" in refs
        assert "action-1" in refs["action-2"]

    def test_multiple_references_in_one_node(self):
        nodes = [
            make_decision(
                "decision-1",
                conditions=[{"field": "{{node-a.output.X}}", "operator": ">", "value": "{{node-b.output.Y}}"}],
            )
        ]
        refs = get_output_references(nodes)
        assert set(refs["decision-1"]) == {"node-a", "node-b"}

    def test_no_self_reference(self):
        """A node referencing itself would be unusual but still parsed correctly."""
        nodes = [
            make_decision(
                "decision-1",
                conditions=[{"field": "{{action-1.output.MEMORY}}", "operator": ">=", "value": "80"}],
            ),
        ]
        refs = get_output_references(nodes)
        assert "decision-1" not in refs.get("decision-1", [])

    def test_demo_workflow_references(self, demo_workflow):
        """
        In the demo workflow, decision-1771310615633 references action-1771310603866.
        """
        refs = get_output_references(demo_workflow["nodes"])
        assert "decision-1771310615633" in refs
        assert "action-1771310603866" in refs["decision-1771310615633"]


# ─────────────────────────────────────────────────────────────────────────────
# TestGetIndependentGroups
# ─────────────────────────────────────────────────────────────────────────────

class TestGetIndependentGroups:

    def test_single_trigger_one_wave(self):
        G = build_dag([make_trigger()], [])
        assert get_independent_groups(G) == [["trigger-1"]]

    def test_linear_chain_one_per_wave(self):
        nodes = [make_trigger(), make_action("action-1"), make_action("action-2")]
        edges = [make_edge("trigger-1", "action-1"), make_edge("action-1", "action-2")]
        G = build_dag(nodes, edges)
        waves = get_independent_groups(G)
        assert waves == [["trigger-1"], ["action-1"], ["action-2"]]

    def test_decision_branches_in_same_wave(self):
        """Both true-branch and false-branch are independent of each other → same wave."""
        nodes = [
            make_trigger(), make_action("action-1"),
            make_decision("decision-1", ["action-t"], ["action-f"]),
            make_action("action-t"), make_action("action-f"),
        ]
        edges = [
            make_edge("trigger-1", "action-1"),
            make_edge("action-1", "decision-1"),
            make_true_edge("decision-1", "action-t"),
            make_false_edge("decision-1", "action-f"),
        ]
        G = build_dag(nodes, edges)
        waves = get_independent_groups(G)
        # Waves: [trigger-1], [action-1], [decision-1], [action-t, action-f]
        assert len(waves) == 4
        last_wave = set(waves[-1])
        assert last_wave == {"action-t", "action-f"}

    def test_all_nodes_covered(self):
        nodes = [
            make_trigger(), make_action("action-1"),
            make_decision("decision-1", ["action-t"], ["action-f"]),
            make_action("action-t"), make_action("action-f"),
        ]
        edges = [
            make_edge("trigger-1", "action-1"),
            make_edge("action-1", "decision-1"),
            make_true_edge("decision-1", "action-t"),
            make_false_edge("decision-1", "action-f"),
        ]
        G = build_dag(nodes, edges)
        waves = get_independent_groups(G)
        all_nodes = [n for wave in waves for n in wave]
        assert set(all_nodes) == {"trigger-1", "action-1", "decision-1", "action-t", "action-f"}

    def test_wave_ordering_respects_dependencies(self):
        nodes = [
            make_trigger(), make_action("action-1"),
            make_decision("decision-1", ["action-t"], ["action-f"]),
            make_action("action-t"), make_action("action-f"),
        ]
        edges = [
            make_edge("trigger-1", "action-1"),
            make_edge("action-1", "decision-1"),
            make_true_edge("decision-1", "action-t"),
            make_false_edge("decision-1", "action-f"),
        ]
        G = build_dag(nodes, edges)
        waves = get_independent_groups(G)
        wave_index = {nid: i for i, wave in enumerate(waves) for nid in wave}
        for u, v in G.edges():
            assert wave_index[u] < wave_index[v], (
                f"Dependency {u}→{v} violated wave order: {waves}"
            )

    def test_demo_workflow_waves(self, demo_graph):
        waves = get_independent_groups(demo_graph)
        # Both email send-actions must be in the last wave (independent branches)
        all_nodes = [n for wave in waves for n in wave]
        assert set(all_nodes) == set(demo_graph.nodes())
        last_wave = set(waves[-1])
        assert "action-1771310622803" in last_wave
        assert "action-1771310629189" in last_wave


# ─────────────────────────────────────────────────────────────────────────────
# Integration — full demo_workflow round-trip
# ─────────────────────────────────────────────────────────────────────────────

class TestDemoWorkflowIntegration:

    def test_graph_node_count(self, demo_graph):
        assert len(demo_graph.nodes()) == 5

    def test_graph_edge_count(self, demo_graph):
        assert len(demo_graph.edges()) == 4

    def test_correct_node_types(self, demo_graph):
        type_map = {nid: demo_graph.nodes[nid]["type"] for nid in demo_graph.nodes()}
        assert "trigger"  in type_map.values()
        assert "action"   in type_map.values()
        assert "decision" in type_map.values()

    def test_decision_has_conditions(self, demo_workflow):
        dec = next(n for n in demo_workflow["nodes"] if n["type"] == "decision")
        assert len(dec["data"]["conditions"]) == 1
        assert dec["data"]["conditions"][0]["operator"] == ">="
        assert dec["data"]["conditions"][0]["value"] == "80"

    def test_validate_executable_nodes_clean(self, demo_workflow):
        assert validate_executable_nodes(demo_workflow["nodes"]) == []

    def test_validate_decision_conditions_clean(self, demo_workflow):
        assert validate_decision_nodes(demo_workflow["nodes"]) == []

    def test_skip_false_branch_when_true(self, demo_graph):
        """Simulate: decision resolves True → false-branch is skipped."""
        branches = get_outgoing_branches(demo_graph, "decision-1771310615633")
        skipped = get_branch_subgraph(demo_graph, branches["false"])
        executed = set(demo_graph.nodes()) - skipped
        assert "action-1771310629189" in skipped
        assert "action-1771310622803" in executed

    def test_skip_true_branch_when_false(self, demo_graph):
        """Simulate: decision resolves False → true-branch is skipped."""
        branches = get_outgoing_branches(demo_graph, "decision-1771310615633")
        skipped = get_branch_subgraph(demo_graph, branches["true"])
        executed = set(demo_graph.nodes()) - skipped
        assert "action-1771310622803" in skipped
        assert "action-1771310629189" in executed
