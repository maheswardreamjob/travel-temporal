# 🤖 AI Integration Deep-Dive — Travel Booking Portal

> **Companion document to [README.md](README.md).**  
> This file explains everything about the AI layer: how the chat assistant talks to Gemini, how the MCP tool registration works, how a tool call is triggered and executed, and what happens end-to-end when a user says *"Book me a trip to Tokyo."*

---

## 🗂️ Table of Contents

1. [AI Components at a Glance](#1-ai-components-at-a-glance)
2. [Spring AI + Gemini — How it connects](#2-spring-ai--gemini---how-it-connects)
3. [What is MCP (Model Context Protocol)?](#3-what-is-mcp-model-context-protocol)
4. [Tool Registration — The @Tool Annotation](#4-tool-registration---the-tool-annotation)
5. [Full Call Flow — Text Diagrams](#5-full-call-flow---text-diagrams)
6. [Interactive Session — Multi-Turn Conversation](#6-interactive-session---multi-turn-conversation)
7. [Which Tool is Called When? — Real Examples](#7-which-tool-is-called-when---real-examples)
8. [Model Fallback Chain](#8-model-fallback-chain)
9. [AI Advisory Pipeline (Inside Temporal)](#9-ai-advisory-pipeline-inside-temporal)
10. [Key Files Reference](#10-key-files-reference)

---

## 1. AI Components at a Glance

This project has **three distinct AI subsystems**, each serving a different purpose:

```
┌─────────────────────────────────────────────────────────────────┐
│                     AI SUBSYSTEMS                               │
├──────────────────────┬──────────────────────┬───────────────────┤
│  ① Chat Agent        │  ② NL Form Parser    │  ③ AI Advisor     │
│  (Conversational)    │  (Extraction)        │  (Risk Evaluator) │
├──────────────────────┼──────────────────────┼───────────────────┤
│  Spring AI ChatClient│  Direct Gemini REST  │  Multi-Agent      │
│  + @Tool / MCP       │  POST with JSON      │  (Weather + Visa) │
│  + MessageMemory     │  schema prompt       │  inside Temporal  │
├──────────────────────┼──────────────────────┼───────────────────┤
│  POST /travel/ai/chat│  POST /travel/ai/    │  Invoked as       │
│                      │  parse               │  Temporal Activity│
├──────────────────────┼──────────────────────┼───────────────────┤
│  User types in chat  │  User types in chat, │  Auto-triggered   │
│  → AI books or asks  │  clicks "Parse" →    │  by the workflow  │
│  for more info       │  fills booking form  │  at checkpoint    │
└──────────────────────┴──────────────────────┴───────────────────┘
```

---

## 2. Spring AI + Gemini — How it connects

The app uses the **Spring AI OpenAI-compatible adapter** to talk to Google Gemini. Instead of the native Gemini SDK, we reuse the OpenAI client and redirect it to Gemini's OpenAI-compatible endpoint:

```
application.properties
──────────────────────────────────────────────────────────────
spring.ai.openai.api-key      = AQ.xxxxxxxx          ← Gemini API Key
spring.ai.openai.base-url     = https://generativelanguage.
                                  googleapis.com/v1beta/openai/  ← Gemini endpoint
spring.ai.openai.chat.options.model = gemini-2.0-flash
──────────────────────────────────────────────────────────────

  Spring AI OpenAI Client
        │
        │  (sends exactly the same JSON format as the OpenAI API)
        ▼
  https://generativelanguage.googleapis.com/v1beta/openai/
  /chat/completions
        │
        ▼
  Gemini LLM  (processes the request, returns OpenAI-compatible JSON)
```

This means **no Gemini-specific SDK is needed**. Spring AI's `ChatClient` handles serialization, retry logic, streaming, and tool-call dispatch — all via the standard OpenAI wire format.

---

## 3. What is MCP (Model Context Protocol)?

MCP is a **standardized protocol** that lets AI models call external functions (tools). Think of it as a contract:

```
WITHOUT MCP:                        WITH MCP:
──────────────                      ────────────────────────────────────
User: "Book Tokyo"                  User: "Book Tokyo"
AI:   "I can't actually             AI:   (internally decides: I need to
       do that, I'm just                   call bookTrip tool)
       a language model"            AI → calls bookTrip("Tokyo") → gets result
                                    AI:   "Done! Your booking is confirmed."
```

**In this project**, MCP tools are registered using Spring AI's `@Tool` annotation. The tools are **Java methods** that the AI is allowed to call automatically.

There are **two ways** MCP is used here:

| Usage Mode | How | Who uses it |
|---|---|---|
| **Embedded** (internal) | `ChatClient.tools(temporalMcpTools)` | Our own chat endpoint |
| **Exposed** (external) | `/mcp/sse` SSE endpoint | External AI agents |

---

## 4. Tool Registration — The @Tool Annotation

### How Spring AI Discovers Tools

`TemporalMcpTools.java` is a `@Service` bean with two `@Tool`-annotated methods:

```java
// TemporalMcpTools.java

@Tool(description = "Start a Temporal workflow to book a flight, hotel, 
                     and arrange transport for a user.")
public String bookTrip(String userId, String origin, String destination,
                       String departureDate, String returnDate) {
    ...
    String runId = starter.startWorkFlow(request);
    return "Temporal workflow started. Run ID: " + runId;
}

@Tool(description = "Query the Temporal workflow to get the real-time 
                     status of a user's booking.")
public String getTripStatus(String userId) {
    return starter.getWorkflowStatus(userId);
}
```

When you pass this bean to `ChatClient`:
```java
chatClient.prompt()
    .tools(temporalMcpTools)   // ← Spring AI introspects @Tool methods here
    .call()
```

Spring AI automatically:
1. Scans all `@Tool`-annotated methods in the bean
2. Converts each method signature into a **JSON Schema** tool descriptor
3. Injects the schema into every Gemini API request

The resulting JSON Schema sent to Gemini looks like this:

```json
{
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "bookTrip",
        "description": "Start a Temporal workflow to book a flight, hotel, and arrange transport for a user.",
        "parameters": {
          "type": "object",
          "properties": {
            "userId":        { "type": "string" },
            "origin":        { "type": "string" },
            "destination":   { "type": "string" },
            "departureDate": { "type": "string" },
            "returnDate":    { "type": "string" }
          },
          "required": ["userId", "origin", "destination", "departureDate", "returnDate"]
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "getTripStatus",
        "description": "Query the Temporal workflow to get the real-time status of a user's booking.",
        "parameters": {
          "type": "object",
          "properties": {
            "userId": { "type": "string" }
          },
          "required": ["userId"]
        }
      }
    }
  ]
}
```

---

## 5. Full Call Flow — Text Diagrams

### Path A: User provides all booking details at once

```
React UI Chat
    │
    │  POST /travel/ai/chat
    │  { "prompt": "Book a trip from Paris to Tokyo departing 2026-07-10 returning 2026-07-20",
    │    "userId": "mahesh_dev" }
    ▼
AiController.chatWithAgent()
    │
    │  Builds system prompt:
    │  "You are a travel assistant...
    │   CRITICAL: userId is 'mahesh_dev'. Use this when calling bookTrip."
    │
    │  Calls:
    │  chatClient.prompt()
    │     .system(systemText)
    │     .user("Book Paris → Tokyo ...")
    │     .tools(temporalMcpTools)    ← tool schema attached
    │     .call()
    ▼
Gemini LLM API
    │
    │  Gemini reads the message + tool schema.
    │  Decides: "I have all required fields. I will call bookTrip."
    │
    │  Returns tool call (not text):
    │  {
    │    "tool_calls": [{
    │      "function": {
    │        "name": "bookTrip",
    │        "arguments": {
    │          "userId":        "mahesh_dev",
    │          "origin":        "Paris",
    │          "destination":   "Tokyo",
    │          "departureDate": "2026-07-10",
    │          "returnDate":    "2026-07-20"
    │        }
    │      }
    │    }]
    │  }
    ▼
Spring AI (auto-intercepts the tool call)
    │
    │  Calls Java method:
    │  temporalMcpTools.bookTrip("mahesh_dev", "Paris", "Tokyo",
    │                             "2026-07-10", "2026-07-20")
    ▼
TemporalMcpTools.bookTrip()
    │
    │  Creates TravelRequest bean
    │  Calls starter.startWorkFlow(request)
    ▼
TravelBookingWorkflowStarter.startWorkFlow()
    │
    │  Temporal client starts the workflow:
    │  workflowClient.newWorkflowStub(...)
    │  workflowStub.startTravelBooking(request)
    │
    │  Returns runId = "abc-123-def-456"
    ▼
Back to TemporalMcpTools.bookTrip()
    │
    │  Returns: "Temporal workflow started. Run ID: abc-123-def-456"
    ▼
Spring AI sends tool result back to Gemini
    ▼
Gemini LLM writes final reply:
    "Your trip from Paris to Tokyo has been successfully booked!
     The booking workflow is now running. Run ID: abc-123-def-456"
    ▼
AiController returns: { "response": "...Run ID: abc-123-def-456..." }
    ▼
React UI
    │
    │  handleSendMessage detects "Run ID:" in the response
    │  → setIsBookingActive(true)
    │  → setWorkflowId("travel_mahesh_dev")
    │  → startStatusPolling("mahesh_dev")   ← polls GET /travel/status/mahesh_dev
    │  → Orchestration Pipeline panel appears!
    ▼
User sees live workflow tracking in the right panel
```

---

### Path B: User is missing information — interactive session

```
User: "I want to go to Tokyo"
    │
    ▼
Gemini checks tool schema.
Required fields: userId ✅  origin ✗  departureDate ✗  returnDate ✗

Gemini does NOT call a tool.
Gemini responds with text:
    "Sure! I'd love to help you plan a trip to Tokyo.
     Could you tell me:
       1. Where will you be departing from?
       2. What are your travel dates (departure and return)?"
    │
    ▼
MessageChatMemoryAdvisor stores:
    [userId="mahesh_dev"] → [
       USER: "I want to go to Tokyo",
       ASSISTANT: "Could you tell me departure city and dates?"
    ]

─────────────────── Next turn ───────────────────

User: "From Paris, July 10 to July 20"
    │
    ▼
Gemini reads conversation memory (previous turns included automatically).
Now it has: origin="Paris", destination="Tokyo",
            departureDate="2026-07-10", returnDate="2026-07-20"

Gemini calls tool: bookTrip(...)
    │
    ▼
[continues as Path A above]
```

---

## 6. Interactive Session — Multi-Turn Conversation

The **conversation memory** is managed by `MessageChatMemoryAdvisor` backed by `MessageWindowChatMemory`:

```java
// AiController.java

private final ChatMemory chatMemory = MessageWindowChatMemory.builder()
        .chatMemoryRepository(new InMemoryChatMemoryRepository())
        .maxMessages(100)        // ← remembers last 100 messages per user
        .build();

// Each request:
chatClient.prompt()
    .advisors(a -> a.param("chat_memory_conversation_id", userId))
    //               ↑ memory is keyed by userId — each user has isolated history
    .call()
```

**What the memory stores (per userId):**

```
Memory[mahesh_dev] = [
  SYSTEM: "You are a travel assistant. userId is 'mahesh_dev'..."
  USER:   "I want to go to Tokyo"
  ASSISTANT: "Where are you departing from?"
  USER:   "From Paris, July 10 to July 20"
  TOOL:   bookTrip("mahesh_dev", "Paris", "Tokyo", ...) → "Run ID: abc"
  ASSISTANT: "Your trip is booked! Run ID: abc"
]
```

Each new message adds to this list. Gemini sees the **entire conversation history** on every call, which is why it can infer missing fields from earlier messages.

---

## 7. Which Tool is Called When? — Real Examples

### `bookTrip` is called when:

| User Input | Triggers? | Reason |
|---|---|---|
| "Book Paris to Tokyo Jul 10–20" | ✅ Yes | All 5 required fields can be extracted |
| "I want a trip to Tokyo" | ❌ No | Missing: origin, dates |
| "From Paris to Tokyo next Tuesday for a week" | ✅ Yes | AI infers dates from relative language |
| "Book me something" | ❌ No | Missing: origin, destination, dates |
| After 2 turns where user provides all missing fields | ✅ Yes | Memory context fills in the blanks |

### `getTripStatus` is called when:

| User Input | Triggers? | Reason |
|---|---|---|
| "What's my booking status?" | ✅ Yes | userId is in system prompt; AI calls status check |
| "Is my flight booked?" | ✅ Yes | AI interprets as a status query |
| "Check my trip to Tokyo" | ✅ Yes | AI maps this to getTripStatus |
| "What's the weather in Tokyo?" | ❌ No | Out of scope, AI answers from training data |

### No tool called (pure text response):

| User Input | Reason |
|---|---|
| "What do I need for a visa to Japan?" | General knowledge question |
| "What currency is used in Tokyo?" | Factual query, no tool needed |
| "What dates work best for Tokyo?" | AI asks for more context |

---

## 8. Model Fallback Chain

Since Gemini free-tier quota (`limit: 0`) affects ALL models equally when billing is enabled on a Google Cloud project, the chat endpoint implements an **automatic model fallback chain**:

```java
private final List<String> FALLBACK_MODELS = List.of(
    "gemini-2.0-flash",          // ← Try this first
    "gemini-2.0-flash-exp",      // ← If 429, try this
    "gemini-1.5-flash-latest",   // ← If 429, try this
    "gemini-1.5-flash-8b-latest",// ← If 429, try this
    "gemini-1.5-pro-latest"      // ← Last resort
);
```

**Fallback execution flow:**

```
Request arrives
    │
    ▼
Try model[0]: gemini-2.0-flash
    │
    ├── Success → respond, remember this model for next request
    │
    └── 429 (quota exceeded)
            │
            ▼
        Try model[1]: gemini-2.0-flash-exp
            │
            ├── Success → switch activeModel, respond
            │
            └── 429
                    │
                    ▼
                Try model[2]: gemini-1.5-flash-latest
                    ...
                    │
                    └── ALL models 429
                            │
                            ▼
                        Return friendly message:
                        "All models quota exhausted.
                         Use Manual Form to book directly."
```

**Important:** `limit: 0` means the free-tier is disabled at the **project level** — not per-model. If all models fail, the fix is to use an API key from a Google Cloud project **without billing enabled** (from https://aistudio.google.com/app/apikey).

---

## 9. AI Advisory Pipeline (Inside Temporal)

Separate from the Chat Agent, the **AI Advisor** runs as a **Temporal Activity** during the booking workflow. It uses a **multi-agent pattern** — two AI agents run in parallel, then a coordinator synthesizes their output:

```
Temporal Workflow reaches "AI Advisory" step
    │
    ▼
AiAdvisoryActivitiesImpl.generateAiAdvisory(travelRequest)
    │
    ├── CompletableFuture (parallel):
    │   │
    │   ├── *** WEATHER AGENT ***
    │   │   POST → gemini.api.url (Native Gemini REST)
    │   │   Prompt: "Evaluate weather risks for {destination} on {date}"
    │   │   Returns: "Weather is mild, 4/5 stars, low humidity..."
    │   │
    │   └── *** VISA AGENT ***
    │       POST → gemini.api.url (Native Gemini REST)
    │       Prompt: "Check visa/entry rules from {origin} to {destination}"
    │       Returns: "No visa required, passport valid 6+ months..."
    │
    │  (Both agents run in parallel via Java CompletableFuture)
    │  (They finish independently, then the next step waits for both)
    │
    ▼
*** COORDINATOR AGENT ***
POST → gemini.api.url
Prompt: "Synthesize this weather: {...} and visa: {...} report for a {tripType}"
Returns: Final advisory text
    │
    ▼
AiAdvisory saved to H2 Database (via tripBookingRepository)
    │
    ▼
Advisory displayed in UI at PENDING_USER_CONFIRMATION step
```

**Key difference from Chat Agent:**

| | Chat Agent | AI Advisory |
|---|---|---|
| **API Path** | `v1beta/openai/` (OpenAI-compatible) | `v1beta/models/{model}:generateContent` (Native) |
| **Spring AI?** | Yes — `ChatClient` | No — raw `RestClient` POST |
| **Tool calls?** | Yes — `@Tool` / MCP | No — direct prompt/response |
| **Memory?** | Yes — per userId | No — stateless per invocation |
| **Triggered by** | User message in chat | Temporal workflow automatically |

---

## 10. Key Files Reference

```
travel_temporal/
└── src/main/java/com/travel/
    │
    ├── controller/
    │   └── AiController.java          ← Chat endpoint, model fallback chain,
    │                                     NL parser, list models endpoint
    │
    ├── mcp/
    │   └── TemporalMcpTools.java      ← @Tool methods: bookTrip, getTripStatus
    │                                     These are the MCP tools the AI calls
    │
    ├── config/
    │   ├── TemporalConfig.java        ← Registers TemporalMcpTools as a
    │   │                                ToolCallbackProvider bean for MCP
    │   └── PromptConfig.java          ← Loads prompt templates from
    │                                     prompts.properties
    │
    ├── activities/
    │   ├── AiAdvisoryActivities.java         ← Temporal Activity interface
    │   └── AiAdvisoryActivitiesImpl.java     ← Multi-agent AI advisory logic
    │                                            (Weather + Visa + Coordinator)
    │
    └── starter/
        └── TravelBookingWorkflowStarter.java ← Starts Temporal workflows,
                                                 sends signals, queries status
```

```
travel-approval-ui/src/
└── App.jsx
    ├── handleSendMessage()   ← Calls POST /travel/ai/chat
    │                            Detects "Run ID:" → activates pipeline panel
    ├── handleAiParse()       ← Calls POST /travel/ai/parse
    │                            Fills booking form from NL prompt
    └── startStatusPolling()  ← Polls GET /travel/status/{userId}
                                 every 1.5s to update pipeline UI
```

---

## Quick Reference — Endpoint Summary

| Endpoint | Method | AI Subsystem | What it does |
|---|---|---|---|
| `/travel/ai/chat` | POST | Chat Agent + MCP | Conversational booking & status queries |
| `/travel/ai/parse` | POST | NL Parser | Extracts booking fields from free text |
| `/travel/ai/models` | GET | Model Browser | Lists all available Gemini models |
| `/travel/ai/active-model` | GET | Fallback Tracker | Shows currently active fallback model |
| `/mcp/sse` | GET | MCP Server | SSE stream for external AI agents |
| `/mcp/message` | POST | MCP Server | Receives tool calls from external agents |

---

*For the core Temporal workflow, Saga pattern, and booking orchestration — see [README.md](README.md).*
