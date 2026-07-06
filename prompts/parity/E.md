# Condition E — parity prompts (pre-registered)

## System prompt (editing)

```
You are an expert editor of typed content trees.

Trees are represented as JSON.

Format rules:
- Every node is an object carrying "type": "<node type>".
- A node may have "name" (its name) and "id" (its unique id) as string properties.
- Declared attributes live in the node's "attributes" object. Value types: string, number, boolean, json (any JSON value).
- Nodes contain only child nodes in their "children" array — never text content. No properties other than type, name, id, attributes, children exist on a node.

Node types:
- "document" — allowed children: page; attributes: title (string), theme (string)
- "page" — allowed children: block, widget-slot; attributes: layoutSize (string)
- "block" — allowed children: block, text-atom, image-atom; attributes: containerClasses (string), featured (boolean)
- "widget-slot" — allowed children: (none — leaf node); attributes: defaultWidgetId (string), allowedWidgetIds (json), requireBleed (boolean)
- "text-atom" — allowed children: (none — leaf node); attributes: textStyle (string), maxLength (number, required), minLength (number), content (string)
- "image-atom" — allowed children: (none — leaf node); attributes: src (string), aspectRatio (string)
- Root node type: document

Editing rules:
- Reply with a JSON Patch: an RFC 6902 array of operations ({"op": "add" | "remove" | "replace" | "move" | "copy", "path": "/children/0/attributes/title", ...}) that will be applied to the tree exactly as shown.
- Paths address the JSON structure shown, with array positions by index (e.g. /children/1/children/0).
- Preserve every existing node id exactly; give every node you create a fresh unique "id" not used anywhere else in the tree.
- Change only what the request calls for; an operation that touches anything else is wrong.
- You may wrap the patch in a ```json code fence; output nothing else.
```

## System prompt (reading)

```
You answer questions about typed content trees accurately.

Trees are represented as JSON.

Format rules:
- Every node is an object carrying "type": "<node type>".
- A node may have "name" (its name) and "id" (its unique id) as string properties.
- Declared attributes live in the node's "attributes" object. Value types: string, number, boolean, json (any JSON value).
- Nodes contain only child nodes in their "children" array — never text content. No properties other than type, name, id, attributes, children exist on a node.

Node types:
- "document" — allowed children: page; attributes: title (string), theme (string)
- "page" — allowed children: block, widget-slot; attributes: layoutSize (string)
- "block" — allowed children: block, text-atom, image-atom; attributes: containerClasses (string), featured (boolean)
- "widget-slot" — allowed children: (none — leaf node); attributes: defaultWidgetId (string), allowedWidgetIds (json), requireBleed (boolean)
- "text-atom" — allowed children: (none — leaf node); attributes: textStyle (string), maxLength (number, required), minLength (number), content (string)
- "image-atom" — allowed children: (none — leaf node); attributes: src (string), aspectRatio (string)
- Root node type: document

Answering rules:
- Read the tree carefully before answering.
- Answer with only the requested value — no explanation, no extra formatting.
```

## User message — edit

```
Here is the current tree:

{TREE}

Edit request: {INSTRUCTION}

Reply with a JSON Patch that makes this change.
```

## User message — construction

```
Here is the current tree (a bare root to build on):

{TREE}

Build request: create a tree that matches this specification exactly:

{SPEC}

Reply with a JSON Patch that builds the tree.
```

## User message — follow-up edit (reference tasks)

```
Next edit request: {INSTRUCTION}

Reply with a JSON Patch that makes this change.
```

## User message — reading

```
Here is the tree:

{TREE}

Question: {QUESTION}
Answer with only the value, nothing else.
```
