export interface WorkflowGraphNode {
  id: string;
  kind: string;
}

export interface WorkflowGraphEdge {
  source: string;
  target: string;
}

export function createWorkflowExecutionOrder(
  nodes: WorkflowGraphNode[],
  edges: WorkflowGraphEdge[],
): string[] {
  const nodeIds = new Set(nodes.map((node) => node.id));
  if (nodeIds.size !== nodes.length) throw new Error('Workflow node IDs must be unique.');
  if (nodes.filter((node) => node.kind === 'input').length !== 1
    || nodes.filter((node) => node.kind === 'output').length !== 1) {
    throw new Error('A workflow must contain exactly one input node and one output node.');
  }
  if (edges.some((edge) => !nodeIds.has(edge.source) || !nodeIds.has(edge.target) || edge.source === edge.target)) {
    throw new Error('Every connection must point to two different existing nodes.');
  }

  const incoming = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of edges) {
    incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1);
    outgoing.get(edge.source)?.push(edge.target);
  }
  const queue = nodes.filter((node) => incoming.get(node.id) === 0).map((node) => node.id);
  const executionOrder: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    executionOrder.push(id);
    for (const nextId of outgoing.get(id) || []) {
      const degree = (incoming.get(nextId) || 0) - 1;
      incoming.set(nextId, degree);
      if (degree === 0) queue.push(nextId);
    }
  }
  if (executionOrder.length !== nodes.length) throw new Error('Workflow connections must not contain a cycle.');

  const inputNodeId = nodes.find((node) => node.kind === 'input')!.id;
  const reachable = new Set<string>([inputNodeId]);
  const visitQueue = [inputNodeId];
  while (visitQueue.length) {
    const currentId = visitQueue.shift()!;
    for (const nextId of outgoing.get(currentId) || []) {
      if (reachable.has(nextId)) continue;
      reachable.add(nextId);
      visitQueue.push(nextId);
    }
  }
  if (reachable.size !== nodes.length) throw new Error('Connect every workflow node to the input and output path.');
  if (!edges.some((edge) => edge.target === nodes.find((node) => node.kind === 'output')!.id)) {
    throw new Error('Connect the workflow steps to the output node.');
  }

  return executionOrder;
}
