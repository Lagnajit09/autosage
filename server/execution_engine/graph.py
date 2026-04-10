"""
DAG engine for workflow execution ordering.

This module is a pure utility layer — no Django ORM or HTTP calls.
It accepts the raw ``nodes`` and ``edges`` JSON arrays from a ``Workflow``
record and produces the information the Celery task needs to execute
nodes in the correct order, including decision-branch resolution.

────────────────────────────────────────────────────────────────────────────
NODE TYPES
────────────────────────────────────────────────────────────────────────────

trigger  — workflow entry point; never executed, has no script binding.
           Schema:
             { "id": "trigger-xxx", "type": "trigger",
               "data": { "type": "manual", "label": "..." } }

action   — executable step (script, email, …).
           Schema:
             { "id": "action-xxx", "type": "action",
               "data": {
                 "type": "script",           # "script" | "email" | …
                 "label": "CheckMEMORY",
                 "selectedScript": { "scriptId": "19", "type": "Powershell Script" },
                 "vaultDetails": { "vaultId": "…", "serverId": "…", "credentialId": "…" },
                 "outputFormat": "json",
                 "parameters": [ … ],
               } }

decision — conditional branch; evaluates ``data.conditions`` at runtime
           and follows **exactly one** outgoing edge (true OR false).
           Schema:
             { "id": "decision-xxx", "type": "decision",
               "data": {
                 "label": "Condition Check",
                 "conditions": [ { "field": "{{…}}", "operator": ">=", "value": "80", … } ],
                 "trueLabel":  ["action-xxx"],   # node IDs on the true  branch
                 "falseLabel": ["action-xxx"],   # node IDs on the false branch
               } }

────────────────────────────────────────────────────────────────────────────
EDGE TYPES
────────────────────────────────────────────────────────────────────────────

normal      — ``sourceHandle`` is absent / None. Unconditional flow.
true-edge   — ``sourceHandle == "true"``.   Taken when decision is True.
false-edge  — ``sourceHandle == "false"``.  Taken when decision is False.

────────────────────────────────────────────────────────────────────────────
IMPORTANT — DAG vs Conditional Graph
────────────────────────────────────────────────────────────────────────────

The graph **is still a DAG** (no cycles allowed or supported).
Decision nodes have TWO outgoing edges (true + false), but at runtime only
ONE branch executes.  The full graph (both branches) is used to:
  1. Validate structure (detect cycles, missing scripts).
  2. Determine *possible* execution order via topological sort.
  3. Let the Celery task skip the unresolved branch after evaluating the
     decision condition.

Nodes on the skipped branch get status = "skipped".
"""

from __future__ import annotations

import re
from typing import Any

import networkx as nx

# ── Public constants ──────────────────────────────────────────────────────────

NODE_TYPE_TRIGGER  = "trigger"
NODE_TYPE_ACTION   = "action"
NODE_TYPE_DECISION = "decision"

EDGE_HANDLE_TRUE  = "true"
EDGE_HANDLE_FALSE = "false"

# ── Internal edge-attribute key stored on the nx.DiGraph ─────────────────────
_EDGE_HANDLE_ATTR = "sourceHandle"

# ── Template reference pattern: {{node-id.output.FIELD}} ─────────────────────
_OUTPUT_REF_RE = re.compile(r"\{\{([\w-]+)\.output\.([\w]+)\}\}")


# ─────────────────────────────────────────────────────────────────────────────
# Public helpers — graph construction
# ─────────────────────────────────────────────────────────────────────────────

def build_dag(
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
) -> nx.DiGraph:
    """
    Convert workflow node + edge JSON into a validated NetworkX DiGraph.

    Each node is stored in the graph with its **full JSON dict** as node
    attributes so callers can do ``G.nodes[node_id]`` to retrieve type,
    label, script binding, conditions, etc.

    Each edge is stored with a ``sourceHandle`` attribute (``None``,
    ``"true"`` or ``"false"``) so the Celery task knows which branch it
    represents.

    Rules enforced:
    - At least one node must exist.
    - Exactly one ``trigger`` node must exist (it is the DAG root).
    - Edge endpoints must reference known node IDs.
    - The resulting graph must be acyclic.
    - A ``decision`` node must have **exactly two** outgoing edges:
      one with ``sourceHandle="true"`` and one with ``sourceHandle="false"``.
    - Non-decision nodes must not emit true/false edges.

    Args:
        nodes: List of node dicts from ``Workflow.nodes``.
        edges: List of edge dicts from ``Workflow.edges``.

    Returns:
        Validated ``nx.DiGraph``.

    Raises:
        ValueError: For any structural violation listed above.
    """
    if not nodes:
        raise ValueError("Workflow has no nodes — nothing to execute.")

    # ── Build node index ──────────────────────────────────────────────────────
    node_ids: set[str] = set()
    trigger_ids: list[str] = []

    G: nx.DiGraph = nx.DiGraph()
    for node in nodes:
        node_id: str = node["id"]
        node_ids.add(node_id)
        node_type: str = node.get("type", "")
        G.add_node(node_id, **node)
        if node_type == NODE_TYPE_TRIGGER:
            trigger_ids.append(node_id)

    if len(trigger_ids) == 0:
        raise ValueError("Workflow must have exactly one trigger node (found 0).")
    if len(trigger_ids) > 1:
        raise ValueError(
            f"Workflow must have exactly one trigger node (found {len(trigger_ids)}: "
            f"{trigger_ids})."
        )

    # ── Add edges with handle attribute ──────────────────────────────────────
    for edge in edges:
        source: str = edge["source"]
        target: str = edge["target"]
        handle: str | None = edge.get("sourceHandle") or None  # "" → None

        if source not in node_ids:
            raise ValueError(
                f"Edge '{edge.get('id', '?')}' references unknown source node '{source}'."
            )
        if target not in node_ids:
            raise ValueError(
                f"Edge '{edge.get('id', '?')}' references unknown target node '{target}'."
            )

        G.add_edge(source, target, **{_EDGE_HANDLE_ATTR: handle})

    # ── Cycle detection ───────────────────────────────────────────────────────
    if not nx.is_directed_acyclic_graph(G):
        try:
            cycle = nx.find_cycle(G)
            cycle_str = " → ".join(f"{u}→{v}" for u, v in cycle)
        except Exception:
            cycle_str = "(unable to identify cycle)"
        raise ValueError(
            f"Workflow graph contains a cycle and cannot be executed. "
            f"Cycle detected: {cycle_str}"
        )

    # ── Validate decision node edges ──────────────────────────────────────────
    for node_id in G.nodes():
        node_type = G.nodes[node_id].get("type", "")
        out_edges = list(G.out_edges(node_id, data=True))

        if node_type == NODE_TYPE_DECISION:
            handles = {data.get(_EDGE_HANDLE_ATTR) for _, _, data in out_edges}
            if EDGE_HANDLE_TRUE not in handles:
                raise ValueError(
                    f"Decision node '{node_id}' is missing a true-edge "
                    f"(sourceHandle='true')."
                )
            if EDGE_HANDLE_FALSE not in handles:
                raise ValueError(
                    f"Decision node '{node_id}' is missing a false-edge "
                    f"(sourceHandle='false')."
                )
            # Warn if extra edges exist (shouldn't happen, but catch it)
            if len(out_edges) != 2:
                raise ValueError(
                    f"Decision node '{node_id}' must have exactly 2 outgoing edges "
                    f"(true + false), found {len(out_edges)}."
                )
        else:
            # Non-decision nodes must not emit conditional handles
            for _, _, data in out_edges:
                handle = data.get(_EDGE_HANDLE_ATTR)
                if handle in (EDGE_HANDLE_TRUE, EDGE_HANDLE_FALSE):
                    raise ValueError(
                        f"Non-decision node '{node_id}' (type='{node_type}') has a "
                        f"conditional edge with sourceHandle='{handle}'. Only decision "
                        f"nodes may emit true/false edges."
                    )

    return G


# ─────────────────────────────────────────────────────────────────────────────
# Public helpers — ordering
# ─────────────────────────────────────────────────────────────────────────────

def topological_order(G: nx.DiGraph) -> list[str]:
    """
    Return all node IDs in a valid topological execution order.

    Both branches of every decision node are included.  The Celery task
    uses this as the *possible* order and skips nodes on the unresolved
    branch after evaluating the decision condition.

    Args:
        G: A validated DAG produced by ``build_dag()``.

    Returns:
        Ordered list of node ID strings (dependencies first).
    """
    return list(nx.topological_sort(G))


def get_node_data(G: nx.DiGraph, node_id: str) -> dict[str, Any]:
    """
    Return the full attribute dict for a node (its original JSON object).

    Args:
        G: DAG produced by ``build_dag()``.
        node_id: The node's id string.

    Returns:
        Dict of node attributes.

    Raises:
        KeyError: If ``node_id`` is not present in the graph.
    """
    return dict(G.nodes[node_id])


def get_edge_handle(G: nx.DiGraph, source: str, target: str) -> str | None:
    """
    Return the ``sourceHandle`` of the edge from ``source`` to ``target``.

    Returns:
        ``"true"``, ``"false"``, or ``None`` (normal edge).

    Raises:
        KeyError: If the edge does not exist.
    """
    return G.edges[source, target].get(_EDGE_HANDLE_ATTR)


def get_outgoing_branches(
    G: nx.DiGraph, decision_node_id: str
) -> dict[str, str]:
    """
    For a decision node, return a mapping of branch → target node ID.

    Returns:
        ``{"true": "<target_node_id>", "false": "<target_node_id>"}``

    Raises:
        ValueError: If ``decision_node_id`` is not a decision node.
        KeyError:   If the node is not in the graph.
    """
    node_type = G.nodes[decision_node_id].get("type", "")
    if node_type != NODE_TYPE_DECISION:
        raise ValueError(
            f"Node '{decision_node_id}' is not a decision node (type='{node_type}')."
        )
    branches: dict[str, str] = {}
    for _, target, data in G.out_edges(decision_node_id, data=True):
        handle = data.get(_EDGE_HANDLE_ATTR)
        if handle in (EDGE_HANDLE_TRUE, EDGE_HANDLE_FALSE):
            branches[handle] = target
    return branches


def get_branch_subgraph(
    G: nx.DiGraph, start_node_id: str
) -> set[str]:
    """
    Return the set of all node IDs reachable from ``start_node_id``
    (inclusive), following the graph edges.

    This is used by the Celery task to determine which nodes to mark as
    "skipped" when a decision resolves to the other branch.

    Args:
        G: DAG produced by ``build_dag()``.
        start_node_id: Root of the sub-branch to collect.

    Returns:
        Set of node ID strings (includes ``start_node_id`` itself).
    """
    return {start_node_id} | nx.descendants(G, start_node_id)


# ─────────────────────────────────────────────────────────────────────────────
# Public helpers — validation
# ─────────────────────────────────────────────────────────────────────────────

def validate_executable_nodes(nodes: list[dict[str, Any]]) -> list[str]:
    """
    Return the IDs of ``action`` nodes that are missing a ``script_id``
    binding when their ``data.type == "script"``.

    Trigger nodes are never executed — they are excluded.
    Decision nodes have no script — they are excluded.
    Action nodes whose ``data.type`` is not ``"script"`` (e.g. ``"email"``)
    are also excluded (they are handled by a different executor).

    Args:
        nodes: List of node dicts from ``Workflow.nodes``.

    Returns:
        List of action node IDs that are type="script" but missing
        ``data.selectedScript.scriptId``.  Empty list = all bound.
    """
    missing: list[str] = []
    for node in nodes:
        if node.get("type") != NODE_TYPE_ACTION:
            continue
        data = node.get("data", {})
        if data.get("type") != "script":
            continue  # non-script actions (email, webhook, …): no script needed
        script_id = (data.get("selectedScript") or {}).get("scriptId")
        if not script_id:
            missing.append(node["id"])
    return missing


def validate_decision_nodes(nodes: list[dict[str, Any]]) -> list[str]:
    """
    Return the IDs of ``decision`` nodes that have no conditions defined.

    Args:
        nodes: List of node dicts from ``Workflow.nodes``.

    Returns:
        List of decision node IDs missing ``data.conditions``.
    """
    return [
        node["id"]
        for node in nodes
        if node.get("type") == NODE_TYPE_DECISION
        and not node.get("data", {}).get("conditions")
    ]


def get_output_references(nodes: list[dict[str, Any]]) -> dict[str, list[str]]:
    """
    Scan all node parameter values for ``{{node_id.output.FIELD}}`` template
    references and return a mapping of ``consumer_node_id → [producer_node_ids]``.

    This is informational — the Celery task uses it to resolve parameter
    values by looking up the producer node's execution output at runtime.

    Args:
        nodes: List of node dicts from ``Workflow.nodes``.

    Returns:
        Dict mapping each consumer node's ID to a (possibly empty) list of
        producer node IDs whose outputs it references.
    """
    refs: dict[str, list[str]] = {}
    for node in nodes:
        consumer_id = node["id"]
        producers: set[str] = set()
        data = node.get("data", {})

        # Check conditions (decision nodes)
        for cond in data.get("conditions", []):
            for val in (cond.get("field", ""), cond.get("value", "")):
                for match in _OUTPUT_REF_RE.finditer(str(val)):
                    producers.add(match.group(1))

        # Check parameters (action + decision nodes)
        for param in data.get("parameters", []):
            for val in (param.get("value", ""),):
                for match in _OUTPUT_REF_RE.finditer(str(val)):
                    producers.add(match.group(1))

        if producers:
            refs[consumer_id] = sorted(producers)

    return refs


# ─────────────────────────────────────────────────────────────────────────────
# Public helpers — parallel execution waves (future use)
# ─────────────────────────────────────────────────────────────────────────────

def get_independent_groups(G: nx.DiGraph) -> list[list[str]]:
    """
    Group nodes into sequential *waves* where all nodes within a wave
    are mutually independent and could theoretically run in parallel.

    Decision branches are treated as independent after the decision node
    itself (one wave per depth level).

    The sequential Celery task currently ignores this, but it is available
    for a future parallel execution upgrade.

    Example — diamond (A → B, A → C, B → D, C → D):
        wave 0: [A]
        wave 1: [B, C]
        wave 2: [D]

    Args:
        G: A validated DAG produced by ``build_dag()``.

    Returns:
        List of waves; each wave is a sorted list of node ID strings.
    """
    waves: list[list[str]] = []
    remaining = set(G.nodes())

    while remaining:
        wave = [
            n for n in remaining
            if not any(pred in remaining for pred in G.predecessors(n))
        ]
        if not wave:
            raise ValueError(
                "Could not determine independent execution groups — "
                "the graph may contain a hidden cycle."
            )
        waves.append(sorted(wave))
        remaining -= set(wave)

    return waves
