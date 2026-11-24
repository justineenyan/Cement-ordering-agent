# KARIBU Multi-Model AI Routing Engine

An intelligent, lightweight routing orchestrator that classifies natural language inputs and delegates tasks to specialized sub-systems or fine-tuned Small Language Models (SLMs)—specifically handling database interactions, mutations, and queries against the **KARIBU GraphQL API**.

---

## 1. Project Vision & Goals

Modern AI architectures face a key trade-off: **monolithic frontier LLMs** provide broad reasoning but come with high per-token latency, significant costs, and unpredictable outputs for deterministic tasks. Conversely, **hyper-specialized small models** are fast and cost-effective, but struggle with open-ended conversation.

This project implements a **Tiered / Routed AI Architecture** designed to:

1. **Decouple Natural Language Intent from Execution:** Serve as an intent gatekeeper that determines whether a request is an internal operational query, an analytical task, or casual conversation.
2. **Safeguard the KARIBU GraphQL Surface:** Prevent LLM hallucinations by isolating GraphQL query generation to structured, schema-aware handlers.
3. **Minimize Compute & Latency Overhead:** Utilize lightweight open-weights models (such as `Qwen2.5-1.5B-Instruct`) hosted on serverless inference infrastructure to make sub-second, deterministic routing decisions without local GPU hardware dependencies.
4. **Remain Host-Agnostic:** Establish a modular TypeScript orchestration layer capable of routing to serverless endpoints, specialized local models, or cloud providers seamlessly.

---

## 2. System Architecture

```
                       ┌────────────────────────┐
                       │   User Query / Input   │
                       └───────────┬────────────┘
                                   │
                                   ▼
                       ┌────────────────────────┐
                       │  Intent Router (SLM)   │  ◄── Qwen2.5-1.5B via HF Inference API
                       │  - Deterministic Temp  │
                       │  - JSON Schema Output  │
                       └───────────┬────────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         │ [KARIBU_GRAPHQL]        │ [GENERAL_CHAT]          │ [ANALYTICS]
         ▼                         ▼                         ▼
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│  Schema-Aware    │      │ Conversational   │      │ Computation &    │
│  Query Generator │      │ Model / Agent    │      │ Data Processor   │
└────────┬─────────┘      └────────┬─────────┘      └────────┬─────────┘
         │                         │                         │
         ▼                         │                         │
┌──────────────────┐               │                         │
│  KARIBU GraphQL  │               │                         │
│  Endpoint (API)  │               │                         │
└────────┬─────────┘               │                         │
         │                         │                         │
         └─────────────────────────┼─────────────────────────┘
                                   │
                                   ▼
                       ┌────────────────────────┐
                       │ Unified Response to UI │
                       └────────────────────────┘
```

### Components

* **Intent Router (Gatekeeper):** A small language model operating at `temperature: 0.0`. It outputs a strict JSON payload containing the classified route, confidence score, extracted parameters, and intent classification.
* **KARIBU GraphQL Handler:** Translates business domain requirements into validated GraphQL syntax (`Query` / `Mutation`), attaches authorization headers, sends requests to the KARIBU endpoint, and formats the output data.
* **General / Fallback Agent:** Handles casual conversation, greetings, and edge cases where confidence scores fall below threshold limits ($< 0.6$).

---

## 3. Tech Stack

* **Runtime:** Node.js (v20+ recommended)
* **Language:** TypeScript
* **Execution Runner:** `tsx` (TypeScript Execute)
* **AI Provider:** Hugging Face Serverless Inference API (`@huggingface/inference`)
* **Default Routing Model:** `Qwen/Qwen2.5-1.5B-Instruct`
* **Target Integration:** KARIBU GraphQL API

---

## 4. Repository Structure

```text
├── index.ts           # Router entry point & intent evaluation harness
├── package.json       # Project dependencies and script definitions
├── tsconfig.json      # TypeScript compiler configuration
├── .env.example       # Environment template
├── .gitignore         # Git ignore rules (node_modules, .env)
└── README.md          # Architecture and documentation
```

---

## 5. Getting Started

### Prerequisites

* Node.js installed on your machine
* A Hugging Face account with a **Fine-grained Access Token** (configured with `Inference Providers` / `Inference API` permissions)

### Installation

1. Clone or initialize the repository directory.
2. Install dependencies:

```bash
npm install
```

3. Create your `.env` file from the example:

```bash
cp .env.example .env
```

4. Populate your `.env` file:

```env
HF_TOKEN=hf_your_actual_token_here
KARIBU_GRAPHQL_ENDPOINT=https://your-karibu-endpoint/graphql
```

---

## 6. Development & Testing

Run the execution harness directly using `tsx`:

```bash
npm run dev
```

### Sample Output

```json
{
  "route": "KARIBU_GRAPHQL",
  "confidence": 0.98,
  "reason": "Request asks for user order history from Karibu database records."
}
```

---

## 7. Roadmap

- [x] Set up TypeScript project with native ESM and `tsx` execution.
- [x] Configure Hugging Face Serverless API integration using `Qwen2.5-1.5B`.
- [x] Define deterministic JSON routing schema.
- [ ] Implement schema ingestion for KARIBU GraphQL queries and mutations.
- [ ] Add GraphQL client executor and response formatting.
- [ ] Expose pipeline via REST/WebSocket API for client consumption.