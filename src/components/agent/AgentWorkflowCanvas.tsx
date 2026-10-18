import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addEdge,
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Bot, FileText, Globe2, Play, Plus, Settings2, Sparkles, Workflow } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { exportResponseElement, responseFilenameBase } from '../../../lib/responseExport';

type WorkflowNodeKind = 'input' | 'agent' | 'search' | 'pdf' | 'output';
type WorkflowNodeData = {
  title: string;
  description: string;
  kind: WorkflowNodeKind;
  instructions: string;
  modelId: string;
};
type WorkflowNode = Node<WorkflowNodeData, 'cintraWorkflow'>;

const STORAGE_KEY = 'cintra_agent_workflow_v1';

const nodePalette: Array<{ kind: WorkflowNodeKind; title: string; icon: typeof Bot }> = [
  { kind: 'input', title: 'Input', icon: Play },
  { kind: 'agent', title: 'AI Agent', icon: Bot },
  { kind: 'search', title: 'Web Search', icon: Globe2 },
  { kind: 'pdf', title: 'PDF Builder', icon: FileText },
  { kind: 'output', title: 'Output', icon: Sparkles },
];

function createNode(kind: WorkflowNodeKind, position: { x: number; y: number }, index: number): WorkflowNode {
  const defaults: Record<WorkflowNodeKind, Omit<WorkflowNodeData, 'kind'>> = {
    input: { title: 'Input', description: 'Workflow entry point', instructions: 'Provide a prompt or files to start this workflow.', modelId: 'cintra-core-v1' },
    agent: { title: 'Cintra Agent', description: 'Reason over the incoming context', instructions: 'Describe the task this agent should perform.', modelId: 'cintra-core-v1' },
    search: { title: 'Web Search', description: 'Collect and summarize public sources', instructions: 'Search for reliable public sources relevant to the request.', modelId: 'cintra-research' },
    pdf: { title: 'PDF Builder', description: 'Format the result as a PDF document', instructions: 'Create a clear, structured PDF from the previous node output.', modelId: 'cintra-analyst' },
    output: { title: 'Final Output', description: 'Deliver the completed result', instructions: 'Return the finished content to the user.', modelId: 'cintra-core-v1' },
  };
  const defaultData = defaults[kind];
  return {
    id: `node-${crypto.randomUUID()}`,
    type: 'cintraWorkflow',
    position,
    data: { ...defaultData, kind },
  };
}

function createStarterWorkflow(): { nodes: WorkflowNode[]; edges: Edge[] } {
  const nodes = [
    createNode('input', { x: 40, y: 140 }, 0),
    createNode('search', { x: 300, y: 140 }, 1),
    createNode('pdf', { x: 560, y: 140 }, 2),
    createNode('output', { x: 820, y: 140 }, 3),
  ];
  return {
    nodes,
    edges: nodes.slice(1).map((node, index) => ({
      id: `edge-${index}`,
      source: nodes[index].id,
      target: node.id,
      animated: true,
    })),
  };
}

function readSavedWorkflow(): { nodes: WorkflowNode[]; edges: Edge[] } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createStarterWorkflow();
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed
      && typeof parsed === 'object'
      && 'nodes' in parsed
      && 'edges' in parsed
      && Array.isArray(parsed.nodes)
      && Array.isArray(parsed.edges)
    ) {
      const nodesAreValid = parsed.nodes.every((node) => (
        node
        && typeof node === 'object'
        && 'id' in node && typeof node.id === 'string'
        && 'type' in node && node.type === 'cintraWorkflow'
        && 'position' in node && typeof node.position === 'object' && node.position !== null
        && 'x' in node.position && typeof node.position.x === 'number'
        && 'y' in node.position && typeof node.position.y === 'number'
        && 'data' in node && typeof node.data === 'object' && node.data !== null
        && 'kind' in node.data && nodePalette.some(({ kind }) => kind === node.data.kind)
        && 'title' in node.data && typeof node.data.title === 'string'
        && 'description' in node.data && typeof node.data.description === 'string'
        && 'instructions' in node.data && typeof node.data.instructions === 'string'
        && 'modelId' in node.data && typeof node.data.modelId === 'string'
      ));
      const edgesAreValid = parsed.edges.every((edge) => (
        edge && typeof edge === 'object'
        && 'id' in edge && typeof edge.id === 'string'
        && 'source' in edge && typeof edge.source === 'string'
        && 'target' in edge && typeof edge.target === 'string'
      ));
      if (nodesAreValid && edgesAreValid) return parsed as { nodes: WorkflowNode[]; edges: Edge[] };
      console.error('Saved workflow data is invalid; restoring the starter workflow.');
    }
  } catch (error) {
    console.error('Could not restore saved workflow:', error);
  }
  return createStarterWorkflow();
}

function WorkflowNodeCard({ data, selected }: NodeProps<WorkflowNode>) {
  const text = document.documentElement.lang === 'ar';
  const paletteItem = nodePalette.find(({ kind }) => kind === data.kind) || nodePalette[1];
  const Icon = paletteItem.icon;
  return (
    <div className={`cintra-flow-node ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Left} className="cintra-flow-handle" />
      <div className="flex items-start gap-3">
        <span className={`cintra-flow-icon kind-${data.kind}`}><Icon size={16} /></span>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold">{data.title}</p>
          <p className="mt-1 line-clamp-2 text-[10px] leading-4 opacity-65">{text ? 'عقدة في مسار العمل' : data.description}</p>
          <span className="cintra-flow-kind-label mt-2 inline-flex rounded-full px-2 py-0.5 text-[9px]">{paletteItem.title}</span>
        </div>
        <Settings2 size={13} className="ms-auto shrink-0 opacity-45" />
      </div>
      <Handle type="source" position={Position.Right} className="cintra-flow-handle" />
    </div>
  );
}

const nodeTypes = { cintraWorkflow: WorkflowNodeCard };

function WorkflowEditor() {
  const { currentLang } = useLanguage();
  const text = currentLang === 'ar';
  const canvasRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  const initial = useMemo(readSavedWorkflow, []);
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [workflowInput, setWorkflowInput] = useState('');
  const [workflowResult, setWorkflowResult] = useState('');
  const [workflowError, setWorkflowError] = useState('');
  const [workflowRunning, setWorkflowRunning] = useState(false);
  const [workflowModels, setWorkflowModels] = useState<Array<{ id: string; name: string; group?: string }>>([]);
  const reportRef = useRef<HTMLElement>(null);
  const selectedNode = nodes.find((node) => node.id === selectedId) || null;

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/models', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Could not load available models (${response.status}).`);
        const data = await response.json();
        if (Array.isArray(data.models)) setWorkflowModels(data.models);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name !== 'AbortError') console.error('Could not load workflow models:', error);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes, edges }));
    } catch (error) {
      console.error('Could not save the workflow in local storage:', error);
    }
  }, [nodes, edges]);

  const connectNodes = useCallback((connection: Connection) => {
    setEdges((current) => addEdge({ ...connection, animated: true }, current));
  }, [setEdges]);

  const addPaletteNode = useCallback((kind: WorkflowNodeKind, position?: { x: number; y: number }) => {
    const point = position || screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    const node = createNode(kind, point, nodes.length);
    setNodes((current) => [...current, node]);
    setSelectedId(node.id);
  }, [nodes.length, screenToFlowPosition, setNodes]);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const kind = event.dataTransfer.getData('application/cintra-node') as WorkflowNodeKind;
    if (!nodePalette.some((entry) => entry.kind === kind) || !canvasRef.current) return;
    addPaletteNode(kind, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  }, [addPaletteNode, screenToFlowPosition]);

  const updateSelectedNode = (updates: Partial<WorkflowNodeData>) => {
    if (!selectedNode) return;
    setNodes((current) => current.map((node) => node.id === selectedNode.id
      ? { ...node, data: { ...node.data, ...updates } }
      : node));
  };

  const runWorkflow = async () => {
    if (workflowRunning || workflowInput.trim().length < 1) return;
    setWorkflowRunning(true);
    setWorkflowError('');
    setWorkflowResult('');
    try {
      const response = await fetch('/api/agent/workflow/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: workflowInput.trim(),
          nodes: nodes.map(({ id, data }) => ({ id, data })),
          edges: edges.map(({ source, target }) => ({ source, target })),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || `Workflow failed (${response.status}).`);
      if (typeof data.result !== 'string' || !data.result.trim()) throw new Error('The workflow returned no output.');
      setWorkflowResult(data.result);
    } catch (error) {
      setWorkflowError(error instanceof Error ? error.message : 'Could not execute this workflow.');
    } finally {
      setWorkflowRunning(false);
    }
  };

  const downloadWorkflowPdf = async () => {
    if (!reportRef.current) return;
    try {
      await exportResponseElement(reportRef.current, 'pdf', responseFilenameBase());
    } catch (error) {
      setWorkflowError(error instanceof Error ? error.message : 'Could not create a PDF from the workflow result.');
    }
  };

  return (
    <div className="cintra-workflow-layout">
      <aside className="cintra-workflow-panel">
        <div className="mb-4 flex items-center gap-2">
          <Workflow size={16} className="text-indigo-400" />
          <div>
            <h2 className="text-xs font-semibold">{text ? 'العُقد' : 'Node library'}</h2>
            <p className="mt-0.5 text-[10px] opacity-55">{text ? 'اسحب العقد إلى مساحة العمل' : 'Drag nodes onto the canvas'}</p>
          </div>
        </div>
        <div className="grid gap-2">
          {nodePalette.map(({ kind, title, icon: Icon }) => (
            <button
              key={kind}
              type="button"
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData('application/cintra-node', kind);
                event.dataTransfer.effectAllowed = 'move';
              }}
              onClick={() => addPaletteNode(kind)}
              className="cintra-workflow-palette-item"
            >
              <Icon size={15} />
              <span>{text ? ({
                input: 'إدخال',
                agent: 'وكيل ذكاء اصطناعي',
                search: 'بحث ويب',
                pdf: 'إنشاء PDF',
                output: 'المخرج',
              } as const)[kind] : title}</span>
              <Plus size={13} className="ms-auto opacity-55" />
            </button>
          ))}
        </div>
        <div className="mt-5 rounded-xl border border-white/10 bg-white/[.03] p-3 text-[10px] leading-5 opacity-65">
          {text ? 'اسحب من منفذ العقدة إلى منفذ عقدة أخرى لتحديد ترتيب التنفيذ.' : 'Connect a node output to another node input to define the workflow path.'}
        </div>
      </aside>

      <div
        className="cintra-workflow-canvas"
        ref={canvasRef}
        onDrop={onDrop}
        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={connectNodes}
          onNodeClick={(_event, node) => setSelectedId(node.id)}
          onPaneClick={() => setSelectedId(null)}
          fitView
          fitViewOptions={{ padding: 0.18 }}
          deleteKeyCode={['Backspace', 'Delete']}
        >
          <Background color="rgba(148,163,184,.16)" gap={22} size={1} />
          <MiniMap className="cintra-flow-minimap" nodeColor={(node) => {
            const data = node.data as WorkflowNodeData;
            return data.kind === 'search' ? '#6366f1' : data.kind === 'pdf' ? '#0ea5e9' : '#8b5cf6';
          }} />
          <Controls />
        </ReactFlow>
        <div className="cintra-workflow-toolbar">
          <span className="inline-flex items-center gap-2"><Workflow size={14} />{text ? 'مصمم سير العمل' : 'Workflow designer'}</span>
          <span className="opacity-55">{nodes.length} {text ? 'عُقد' : 'nodes'} · {edges.length} {text ? 'اتصالات' : 'connections'}</span>
          <button type="button" onClick={() => void runWorkflow()} disabled={workflowRunning || !workflowInput.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 px-3 py-2 text-[10px] font-semibold text-white shadow-lg transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50">
            {workflowRunning ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Play size={13} />}
            {workflowRunning ? (text ? 'جارٍ التنفيذ…' : 'Running…') : (text ? 'تشغيل سير العمل' : 'Run workflow')}
          </button>
        </div>
      </div>

      <aside className="cintra-workflow-panel cintra-workflow-inspector">
        <section className="mb-5 rounded-2xl border border-indigo-400/20 bg-indigo-400/[.05] p-3">
          <h2 className="mb-1 text-xs font-semibold">{text ? 'تشغيل الوكيل' : 'Run the agent'}</h2>
          <p className="mb-3 text-[10px] leading-4 opacity-60">{text ? 'أدخل طلبك، وسينفّذ Cintra العقد المتصلة بالترتيب.' : 'Enter a request. Cintra will execute the connected nodes in order.'}</p>
          <textarea value={workflowInput} maxLength={20000} rows={4} onChange={(event) => setWorkflowInput(event.target.value)} placeholder={text ? 'اكتب المطلوب تنفيذه…' : 'Describe what the workflow should do…'} className="cintra-workflow-field w-full resize-y leading-5" />
          <button type="button" onClick={() => void runWorkflow()} disabled={workflowRunning || !workflowInput.trim()} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50">
            {workflowRunning ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Play size={14} />}
            {workflowRunning ? (text ? 'جارٍ تنفيذ العقد…' : 'Executing nodes…') : (text ? 'تشغيل' : 'Execute workflow')}
          </button>
          {workflowError && <p className="mt-2 rounded-lg border border-red-400/20 bg-red-400/10 p-2 text-[10px] leading-4 text-red-300" role="alert">{workflowError}</p>}
          {workflowResult && (
            <div className="mt-4 border-t border-white/10 pt-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-[11px] font-semibold">{text ? 'نتيجة التنفيذ' : 'Workflow result'}</h3>
                <button type="button" onClick={() => void downloadWorkflowPdf()} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1.5 text-[10px] hover:bg-white/5">
                  <FileText size={12} /> PDF
                </button>
              </div>
              <article ref={reportRef} dir="auto" className="markdown-content max-h-72 overflow-y-auto rounded-xl bg-white p-4 text-[11px] leading-6 text-neutral-900">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{workflowResult}</ReactMarkdown>
              </article>
            </div>
          )}
        </section>
        <h2 className="mb-1 text-xs font-semibold">{text ? 'إعدادات العقدة' : 'Node settings'}</h2>
        <p className="mb-4 text-[10px] opacity-55">{text ? 'حدد عقدة لتعديل خصائصها' : 'Select a node to edit its properties'}</p>
        {selectedNode ? (
          <div className="grid gap-3">
            <label className="grid gap-1.5 text-[10px] opacity-75">
              {text ? 'الاسم' : 'Name'}
              <input value={selectedNode.data.title} maxLength={80} onChange={(event) => updateSelectedNode({ title: event.target.value })} className="cintra-workflow-field" />
            </label>
            <label className="grid gap-1.5 text-[10px] opacity-75">
              {text ? 'وصف مختصر' : 'Description'}
              <input value={selectedNode.data.description} maxLength={160} onChange={(event) => updateSelectedNode({ description: event.target.value })} className="cintra-workflow-field" />
            </label>
            <label className="grid gap-1.5 text-[10px] opacity-75">
              {text ? 'تعليمات العقدة' : 'Instructions'}
              <textarea value={selectedNode.data.instructions} maxLength={2000} rows={7} onChange={(event) => updateSelectedNode({ instructions: event.target.value })} className="cintra-workflow-field resize-y leading-5" />
            </label>
            {selectedNode.data.kind === 'agent' && (
              <label className="grid gap-1.5 text-[10px] opacity-75">
                {text ? 'نموذج Cintra' : 'Cintra model'}
                <select value={selectedNode.data.modelId} onChange={(event) => updateSelectedNode({ modelId: event.target.value })} className="cintra-workflow-field">
                  {workflowModels.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
                </select>
              </label>
            )}
            <button type="button" onClick={() => {
              setNodes((current) => current.filter((node) => node.id !== selectedNode.id));
              setEdges((current) => current.filter((edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id));
              setSelectedId(null);
            }} className="mt-1 rounded-xl border border-red-400/20 px-3 py-2 text-[10px] text-red-300 hover:bg-red-400/10">
              {text ? 'حذف العقدة' : 'Delete node'}
            </button>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-white/15 px-3 py-6 text-center text-[10px] leading-5 opacity-50">
            {text ? 'اختر عقدة من اللوحة لعرض إعداداتها.' : 'Choose a node on the canvas to inspect its settings.'}
          </div>
        )}
      </aside>
    </div>
  );
}

export function AgentWorkflowCanvas() {
  return (
    <ReactFlowProvider>
      <WorkflowEditor />
    </ReactFlowProvider>
  );
}
