const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// ── Identity (fill in your real details) ──────────────────────────────────────
const USER_ID = 'johndoe_17091999';          // fullname_ddmmyyyy
const EMAIL_ID = 'john.doe@srmist.edu.in';   // your college email
const COLLEGE_ROLL = '21CS1001';             // your roll number
// ─────────────────────────────────────────────────────────────────────────────

const NODE_REGEX = /^([A-Z])->([A-Z])$/;

function parseInput(data) {
  const valid = [];
  const invalid = [];
  const seen = new Set();
  const duplicates = [];

  for (let raw of data) {
    const entry = raw.trim();

    // self-loop or bad format
    if (!NODE_REGEX.test(entry)) {
      invalid.push(raw); // push original (trimmed is fine)
      continue;
    }

    const [, parent, child] = entry.match(NODE_REGEX);
    if (parent === child) { invalid.push(entry); continue; }

    const key = `${parent}->${child}`;
    if (seen.has(key)) {
      if (!duplicates.includes(key)) duplicates.push(key);
      continue;
    }
    seen.add(key);
    valid.push({ parent, child, key });
  }

  return { valid, invalid, duplicates };
}

function buildHierarchies(edges) {
  // collect all nodes and adjacency
  const children = {}; // parent -> [child]
  const parentOf = {};  // child -> first parent

  for (const { parent, child } of edges) {
    if (!children[parent]) children[parent] = [];
    // diamond: first-encountered parent wins
    if (parentOf[child] !== undefined) continue;
    parentOf[child] = parent;
    children[parent].push(child);
  }

  const allNodes = new Set([
    ...Object.keys(children),
    ...Object.keys(parentOf),
    ...edges.map(e => e.child)
  ]);

  // group nodes into connected components (undirected)
  const adj = {};
  for (const n of allNodes) adj[n] = new Set();
  for (const { parent, child } of edges) {
    adj[parent].add(child);
    adj[child].add(parent);
  }

  const visited = new Set();
  const components = [];
  for (const node of [...allNodes].sort()) {
    if (visited.has(node)) continue;
    const comp = [];
    const queue = [node];
    while (queue.length) {
      const n = queue.shift();
      if (visited.has(n)) continue;
      visited.add(n);
      comp.push(n);
      for (const nb of adj[n]) queue.push(nb);
    }
    components.push(comp);
  }

  const hierarchies = [];

  for (const comp of components) {
    const compSet = new Set(comp);

    // find root(s): node in comp not appearing as child (in edges within comp)
    const childNodes = new Set(
      edges.filter(e => compSet.has(e.parent) && compSet.has(e.child)).map(e => e.child)
    );
    const roots = comp.filter(n => !childNodes.has(n)).sort();

    let root = roots.length > 0 ? roots[0] : comp.sort()[0];

    // cycle detection (DFS)
    function hasCycle() {
      const color = {}; // 0=white,1=gray,2=black
      for (const n of comp) color[n] = 0;
      function dfs(u) {
        color[u] = 1;
        for (const v of (children[u] || [])) {
          if (!compSet.has(v)) continue;
          if (color[v] === 1) return true;
          if (color[v] === 0 && dfs(v)) return true;
        }
        color[u] = 2;
        return false;
      }
      return dfs(root);
    }

    if (hasCycle()) {
      hierarchies.push({ root, tree: {}, has_cycle: true });
      continue;
    }

    // build nested tree
    function buildTree(node) {
      const obj = {};
      for (const child of (children[node] || [])) {
        obj[child] = buildTree(child);
      }
      return obj;
    }

    function depth(node) {
      const kids = children[node] || [];
      if (!kids.length) return 1;
      return 1 + Math.max(...kids.map(depth));
    }

    const tree = { [root]: buildTree(root) };
    const d = depth(root);
    hierarchies.push({ root, tree, depth: d });
  }

  return hierarchies;
}

app.post('/bfhl', (req, res) => {
  const { data } = req.body;
  if (!Array.isArray(data)) {
    return res.status(400).json({ error: 'data must be an array' });
  }

  const { valid, invalid, duplicates } = parseInput(data);
  const hierarchies = buildHierarchies(valid);

  const nonCyclic = hierarchies.filter(h => !h.has_cycle);
  const cyclic = hierarchies.filter(h => h.has_cycle);

  let largest_tree_root = '';
  if (nonCyclic.length > 0) {
    const max = nonCyclic.reduce((best, h) => {
      if (h.depth > best.depth) return h;
      if (h.depth === best.depth && h.root < best.root) return h;
      return best;
    });
    largest_tree_root = max.root;
  }

  return res.json({
    user_id: USER_ID,
    email_id: EMAIL_ID,
    college_roll_number: COLLEGE_ROLL,
    hierarchies,
    invalid_entries: invalid,
    duplicate_edges: duplicates,
    summary: {
      total_trees: nonCyclic.length,
      total_cycles: cyclic.length,
      largest_tree_root
    }
  });
});

// Serve frontend
const path = require('path');
app.get('/', (_, res) => res.json({ status: 'BFHL API running. POST to /bfhl' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on port ${PORT}`));
