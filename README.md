# Premium Travel Booking Portal (Temporal Saga & Parallel Orchestration)

Welcome to the **Premium Travel Booking Portal**, a world-class demonstration of distributed transactions using the **Saga Pattern** with the **Temporal Java SDK**, a **Spring Boot** backend, and a modern, glassmorphic **React/Vite** frontend dashboard.

This monorepo contains two primary components:
1. **`travel_temporal`**: The Spring Boot Java backend that acts as the Temporal client/worker, manages JPA entities, and exposes REST APIs.
2. **`travel-approval-ui`**: The React UI dashboard that provides real-time state visualization, terminal worker logs, simulation controls, and user approvals.

---

## 🏗️ Tech Design & Architecture (Deterministic vs. Probabilistic Orchestration)

The portal combines three design paradigms to offer a premium, robust booking experience:

1. **Deterministic Orchestration (Booking & Payment Saga):** Coordinates transactional systems (Flight, Hotel, Transport, Credit Card, and Invoice systems). Must be 100% deterministic, guaranteeing eventual consistency via the **Saga Pattern** (rollbacks and compensation) and parent/child workflow boundaries.
2. **Probabilistic Multi-Agent Orchestration (AI Risk Advisor):** Coordinates generative AI agents inside Temporal activities to evaluate travel destination safety guidelines (Weather, Visa entry requirements) and synthesizes advice via a Coordinator agent. Latency is optimized by running independent agents in parallel via Java futures, with mock fallbacks for offline safety.
3. **AI Assistive NLP Parser (Form Filler):** Translates conversational natural language requests into structured travel forms dynamically via an extraction agent.

### 📐 High-Level Design (HLD)

The box diagram below illustrates how the frontend layer, backend API gateway, Temporal orchestration engine, and external databases/services interface with each other:

```mermaid
flowchart TD
    %% Define Styles
    classDef frontend fill:#2563eb,stroke:#1d4ed8,stroke-width:2px,color:#fff;
    classDef api fill:#059669,stroke:#047857,stroke-width:2px,color:#fff;
    classDef temporal fill:#d97706,stroke:#b45309,stroke-width:2px,color:#fff;
    classDef database fill:#4b5563,stroke:#374151,stroke-width:2px,color:#fff;

    subgraph UI ["🖥️ FRONTEND LAYER (React/Vite)"]
        Chat["✨ AI Assistant Chat (Natural Language Input)"]
        Form["📋 Booking Form (Structured Inputs)"]
        Tracker["📊 Live Workflow Pipeline (Status Tracker)"]
    end
    class Chat,Form,Tracker frontend;

    subgraph API ["⚡ BACKEND API GATEWAY (Spring Boot)"]
        Controller["TravelWorkflowController<br>(Triggers, Signals, Queries)"]
        AiParser["AiController (/travel/ai/parse)<br>(Gemini / Local Regex fallback)"]
    end
    class Controller,AiParser api;

    subgraph Engine ["⏳ TEMPORAL ORCHESTRATION ENGINE"]
        subgraph Parent ["TravelWorkflow (Parent Workflow)"]
            Init["1. Initialize Booking"]
            Reserve["2. Parallel Booking Activities(Deterministic)<br>(Flight, Hotel, Transport)<br>⚡ Saga Compensations Registered"]
            Advisor["3. Multi-Agent AI Advisory(Probabilistic)<br>(Parallel Visa & Weather Agents)"]
            HumanGate["4. Human Approval Gate (Signal)<br>⏱️ Awaits Confirm/Cancel or Timeout"]
        end
        
        subgraph Child ["PaymentWorkflow (Child Workflow)"]
            Pay["5. Sequential Payments<br>(Credit Card, Invoice, Loyalty)"]
        end
    end
    class Init,Reserve,Advisor,HumanGate,Pay,Parent,Child temporal;

    subgraph Storage ["💾 DATABASE & AI SERVICES"]
        DB[("H2 Database<br>(Trip, Payment & Booking tables)")]
        LLM["Gemini LLM API / Local Fallback<br>(Weather & Visa guidelines)"]
    end
    class DB,LLM database;

    %% Simple flow lines
    Chat -->|"Parse NL request"| AiParser
    AiParser -.->|"Auto-populate fields"| Form
    Form -->|"Submit /travel/book"| Controller
    Controller -->|"Start workflow / signal / query"| Parent
    Parent -->|"Invoke transactional changes"| DB
    Parent -->|"Run advisory evaluation"| LLM
    HumanGate -->|"If Confirmed -> Start Child"| Child
    Tracker -->|"Query real-time status"| Controller
```

### 🔄 Core Temporal Features Implemented

This project leverages Temporal's most powerful patterns to build a highly resilient, interactive, and distributed transactional process:

1. **Human-in-the-Loop (Human Workflow & Signals)**
   * **Concept:** Instead of running purely automated from start to finish, the booking process pauses and waits for user confirmation (an external manual action).
   * **Implementation:** The workflow blocks execution using `Workflow.await(timeout, () -> confirmed || cancelled);` waiting for a Signal from the controller (`confirm` or `cancel`).
   
2. **Saga Pattern (Compensating Transactions)**
   * **Concept:** Ensures eventual consistency in distributed systems. If a step fails, the system executes compensation logic (reversals) for previously completed steps.
   * **Implementation:** The workflow registers compensation methods (`cancelFlight()`, `cancelHotel()`, `cancelTransport()`) in a `Saga` object. If any booking activity throws an exception, `saga.compensate()` is automatically triggered, rolling back database changes.

3. **Workflow Timers & Automatic Escalation**
   * **Concept:** Human workflows need timeouts so they don't block indefinitely.
   * **Implementation:** The UI lets users dynamically configure the approval timer (from 10s to 300s). The parent workflow uses this duration inside `Workflow.await` to auto-cancel and compensate if the user doesn't respond in time.

4. **Parent/Child Workflow Orchestration**
   * **Concept:** Splitting complex processes into sub-processes facilitates retry control, security boundaries, and modular development.
   * **Implementation:** The payment/invoice flow is executed as a child workflow `PaymentWorkflow` from within the parent `TravelWorkflow`.

5. **Asynchronous Parallel Execution**
   * **Concept:** Speeding up distributed service calls by running non-dependent activities concurrently.
   * **Implementation:** Booking reservations (`bookFlight`, `bookHotel`, `arrangeTransport`) and AI Risk Advisor agents (Weather, Visa checks) execute concurrently via `Async.function(...)` and `CompletableFuture`.

6. **Worker Crash Resilience (State Reconstruction)**
   * **Concept:** If backend nodes or workers crash mid-flight, state is not lost.
   * **Implementation:** Temporal stores the full execution history. Upon restarting a crashed worker, the workflow resumes execution exactly from the last saved state without repeating successfully completed activities.


### 🔍 Low-Level Design (LLD)

#### 1. Deterministic Layer (Transactional Eventual Consistency)
*   **`TravelWorkflow` / `TravelWorkflowImpl`**: Serves as the orchestrator. Dictates the parallel booking execution, compensation registration, and signal wait boundaries.
*   **`PaymentWorkflow` / `PaymentWorkflowImpl`**: Exposes child workflow capabilities to process card charges, invoices, and loyalty records.
*   **`TravelActivities` / `TravelActivitiesImpl`**: Manages entity creation and status mutations in the H2 Database across `trip_bookings`, `flight_bookings`, `hotel_bookings`, and `transport_bookings`.
*   **Saga Compensation Rules:** If `bookHotel` or `arrangeTransport` throws an exception, Temporal catches the application error and executes registered rollbacks (`cancelFlight`, `cancelHotel`, etc.) sequentially.

#### 2. Probabilistic Layer (Parallel Multi-Agent Reasoning)
*   **`AiAdvisoryActivities` / `AiAdvisoryActivitiesImpl`**: Coordinates the risk assessment flow. Spawns two asynchronous tasks in parallel:
    *   **Weather Agent:** Queries seasonal weather ratings.
    *   **Visa Agent:** Validates border entry regulations.
    *   **Coordinator Agent:** Concurrently synthesizes both results.
*   **`PromptConfig` / `prompts.properties`**: Isolates system instructions from Java logic, supporting runtime placeholders (`{origin}`, `{destination}`, `{tripType}`).
*   **`TripBooking.aiAdvisory`**: Configured via `@Column(length = 2000)` in JPA to store markdown text advice securely without database length constraints.

#### 3. AI Assistive Layer (Natural Language Processing)
*   **`AiController.java`**: Implements `/travel/ai/parse` and binds header/environment API keys. Utilizes structural parsing configurations (`responseMimeType: "application/json"`) to query Gemini.
*   **`mockParse(...)`**: High-performance local regex fallback pattern matches travel parameters (dates, guests, destination presets) when offline.

### Transaction Orchestration Workflow

```mermaid
sequenceDiagram
    autonumber
    actor User as User/Frontend UI
    participant API as Spring Boot API
    participant WF as Temporal Parent (TravelWorkflow)
    participant CWF as Temporal Child (PaymentWorkflow)
    participant Act as Temporal Activities (Services)

    User->>API: POST /travel/book (payload with chaos flags)
    API->>WF: Start travelBookingWorkflow (ID: travel_{userId})
    Note over WF: Status: INITIALIZING_TRIP
    WF->>Act: initializeTripBooking()
    
    Note over WF: Status: RESERVING_PARALLEL
    par Flight Booking
        WF->>Act: bookFlight()
        Act-->>WF: Flight reserved. Register comp: cancelFlight()
    and Hotel Booking
        WF->>Act: bookHotel()
        Act-->>WF: Hotel reserved. Register comp: cancelHotel()
    and Transport Arranging
        WF->>Act: arrangeTransport()
        Act-->>WF: Transport reserved. Register comp: cancelTransport()
    end

    Note over WF: Status: AWAITING CONFIRMATION<br/>(Awaits approval signal with configurable countdown)
    
    alt User clicks "Confirm Booking" (Before countdown)
        User->>API: POST /travel/confirm/{userId}
        API->>WF: sendConfirmationSignal()
        Note over WF: Status: PAYMENT_IN_PROGRESS
        WF->>CWF: Start Child Workflow (PaymentWorkflow)
        
        Note over CWF: Payment Saga Phase
        CWF->>Act: chargeCreditCard()
        Act-->>CWF: Card charged. Register comp: refundCreditCard()
        CWF->>Act: issueInvoice()
        CWF->>Act: awardLoyaltyPoints()
        
        CWF-->>WF: Child completed successfully
        
        Note over WF: Status: CONFIRMED
        WF->>Act: confirmBooking()
        WF-->>User: Workflow Completed Successfully
    else User clicks "Cancel" OR Countdown runs out
        Note over WF: Status: COMPENSATING
        WF->>Act: cancelTransport()
        WF->>Act: cancelHotel()
        WF->>Act: cancelFlight()
        WF->>Act: cancelBooking()
        Note over WF: Status: CANCELLED
        WF-->>User: Workflow Terminated (Compensated)
    end
```

---

## 📁 Projects Explanation

### 💻 1. Frontend: `travel-approval-ui`
A sleek, premium, glassmorphic portal built using React and Vite:
*   **Grouped Pipeline Tracker**: Consolidates sequential steps into a grouped hierarchy showing parallel reservations (`Flight`, `Hotel`, `Transport` pills) and sequential payment steps (`Card Charge`, `Invoice`, `Loyalty` pills).
*   **Worker Log Console**: Simulates terminal logs directly on the web page, making it clear to see when activities are executed, registered for compensation, or rolled back.
*   **Repositioned Controls**: Placed the confirmation/timer card on the right-side gap next to the pipeline to maximize layout efficiency.
*   **Admin Tab**: Aggregates external project components and config controls:
    *   **Workflow Control Panel**: Features an interactive slider to configure the User Confirmation Timeout dynamically (10s to 300s). The UI automatically dispatches a cancel signal if the timer runs out.
    *   **Temporal UI**: Embeds the local Temporal dev server console directly inside the application via an iframe to track workflow execution histories.
    *   **H2 Database Console**: Embeds the H2 database console to view real-time data persistence.
    *   **Swagger UI**: Embeds the backend OpenAPI spec Swagger console to run REST calls directly.

### ☕ 2. Backend: `travel_temporal`
A Java backend built on Spring Boot, integrated with the Temporal SDK and JPA repositories:
*   **`TravelWorkflow`**: Parent workflow coordinating parallel reservations, timer signals, and child execution.
*   **`PaymentWorkflow`**: Child workflow managing sequential credit card charging, invoicing, and loyalty point awarding.
*   **JPA Relational Schema**: Persists state across `trip_bookings`, `flight_bookings`, `hotel_bookings`, `transport_bookings`, `payment_records`, and `loyalty_records` using Hibernate and transaction-safe repository queries.
*   **H2 Local Config**: Automatic configuration via `.h2.server.properties` and reflection-based servlet setup to ensure H2 Console works seamlessly out-of-the-box.

---

## 🛠️ Prerequisites

Before running the application, make sure you have the following software installed:

| Software | Version | Purpose |
| :--- | :--- | :--- |
| **Java JDK** | 21+ | To compile and run the Spring Boot backend. |
| **Node.js & npm** | v18+ / npm 9+ | To compile and serve the Vite frontend. |
| **Docker & Compose** | Latest | To run PostgreSQL and the Temporal Server infrastructure. |

---

## 🚀 How to Run the Application

Follow these steps to set up and run the entire ecosystem locally:

### Step 1: Start Temporal Server (Docker Compose)
The backend uses Temporal Server to manage workflow state persistence.
1. Open a terminal and navigate to the backend subdirectory:
   ```bash
   cd travel_temporal
   ```
2. Start the Temporal Server stack:
   ```bash
   docker compose up -d
   ```
3. Once running, you can access the **Temporal Web Console** at **[http://localhost:8088](http://localhost:8088)**.

### Step 2: Run the Spring Boot Backend
1. Open a new terminal in the backend directory (`travel_temporal`).
2. Build and run the Spring Boot server:
   * **Windows (PowerShell)**:
     ```powershell
     mvn spring-boot:run
     ```
   * **macOS/Linux**:
     ```bash
     ./mvnw spring-boot:run
     ```
3. The API will start on port **`9191`** (e.g. `http://localhost:9191/travel/book`).

### Step 3: Run the React Frontend
1. Open a new terminal and navigate to the frontend directory:
   ```bash
   cd travel-approval-ui
   ```
2. Install the frontend dependencies:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```
4. Open the displayed URL (usually **[http://localhost:5174](http://localhost:5174)**) in your browser.

---

## 📡 REST API Endpoints

The Spring Boot backend exposes the following REST APIs:

*   **Start Booking Workflow**: `POST http://localhost:9191/travel/book`
    *   Body:
        ```json
        {
          "userId": "mahesh_dev",
          "origin": "Paris, France",
          "destination": "Tokyo, Japan",
          "departureDate": "2026-06-15",
          "returnDate": "2026-06-22",
          "travelClass": "Business Class",
          "hotelRating": "5-Star Luxury Resort",
          "transportVehicle": "Tesla Model Y (EV)",
          "travelersCount": 2,
          "includeInsurance": true,
          "simulateFlightFailure": false,
          "simulateHotelFailure": false,
          "simulateTransportFailure": false,
          "simulatePaymentFailure": false,
          "simulateLoyaltyFailure": false
        }
        ```
*   **Query Workflow Status**: `GET http://localhost:9191/travel/status/{userId}`
*   **Send Confirm Signal**: `POST http://localhost:9191/travel/confirm/{userId}`
*   **Send Cancel/Reject Signal**: `POST http://localhost:9191/travel/cancel/{userId}`
*   **Kill Worker Process (Chaos Switch)**: `POST http://localhost:9191/travel/kill`

---

## 🧹 Local Infrastructure DB Cleanup

If you ever see state discrepancies in your local Temporal dev environment and want to perform a clean wipe of the workflow history:

1.  **Stop Containers & Delete Volumes**:
    ```bash
    docker compose down -v
    ```
2.  **Restart Temporal Stack**:
    ```bash
    docker compose up -d
    ```
    This will drop all history records and recreate a clean Postgres db from scratch.

---

## ☁️ AWS Production Deployment Architecture

Deploying this portal to AWS involves separating the frontend, backend workers, Temporal engine, and persistence layers into a scalable, production-grade architecture.

```mermaid
flowchart TD
    classDef aws_compute fill:#f58536,stroke:#d95b00,stroke-width:2px,color:#fff;
    classDef aws_network fill:#8c4fff,stroke:#5c1aeb,stroke-width:2px,color:#fff;
    classDef aws_storage fill:#3f8624,stroke:#1e5a07,stroke-width:2px,color:#fff;
    classDef aws_frontend fill:#e7157b,stroke:#a10a54,stroke-width:2px,color:#fff;
    classDef temporal fill:#111827,stroke:#374151,stroke-width:2px,color:#fff;

    Client(["👤 End User"])

    subgraph AWS_Edge ["AWS Edge Network"]
        CF["🌐 Amazon CloudFront<br>(CDN)"]
        S3["🪣 Amazon S3<br>(Static React UI)"]
    end
    class CF,S3 aws_frontend;

    subgraph AWS_VPC ["AWS VPC (Private Subnets)"]
        ALB["⚖️ Application Load Balancer"]
        
        subgraph Compute ["ECS Cluster"]
            Fargate["🐳 AWS Fargate (ECS)<br>Spring Boot API & Temporal Workers"]
        end
        
        subgraph Data ["Data Tier"]
            RDS[("🐘 Amazon RDS<br>(PostgreSQL)")]
        end
        
        NAT["🌍 NAT Gateway"]
    end
    class ALB,NAT aws_network;
    class Fargate aws_compute;
    class RDS aws_storage;

    subgraph External ["External Managed Services"]
        TC["⏳ Temporal Cloud<br>(Orchestration Engine)"]
        Gemini["✨ Google Gemini API<br>(AI Models)"]
    end
    class TC temporal;

    Client -->|"Loads Web UI"| CF
    CF -.->|"Fetches static build"| S3
    Client -->|"REST API Calls (/travel/*)"| ALB
    ALB -->|"Routes HTTP traffic"| Fargate
    Fargate -->|"Reads/Writes App Data"| RDS
    Fargate <-->|"mTLS Connection (gRPC)"| TC
    Fargate -->|"Outbound Requests"| NAT
    NAT -->|"HTTPS Call"| Gemini
```

### 1. Frontend (React UI)
*   **Amazon S3:** Host the compiled static UI assets (`npm run build`).
*   **Amazon CloudFront:** Acts as a global Content Delivery Network (CDN) to serve the UI with low latency, HTTPS/SSL termination, and caching.

### 2. Backend (Spring Boot & Temporal Workers)
*   **Amazon ECS with AWS Fargate:** Run the Spring Boot application in serverless Docker containers within private subnets. Fargate automatically scales based on worker load.
*   **Application Load Balancer (ALB):** Routes incoming HTTP REST requests from the React frontend to the Spring Boot API controllers.
*   **AWS Secrets Manager:** Securely stores the `GEMINI_API_KEY`, database credentials, and Temporal TLS connection certificates.

### 3. Temporal Engine
*   **Temporal Cloud (Recommended):** The easiest and most reliable way to run Temporal in production. Connect your ECS workers to Temporal Cloud via secure mTLS.
*   **Self-Hosted Alternative:** Deploy the Temporal cluster components (Frontend, History, Matching, Worker) onto **Amazon EKS** (Kubernetes) or a dedicated ECS Fargate cluster.

### 4. Data Persistence & Networking
*   **Amazon RDS for PostgreSQL:** Fully managed relational database. Used by the Spring application for business entity state and the Temporal server (if self-hosted) for workflow state persistence.
*   **Amazon VPC & NAT Gateway:** Ensure ECS containers and RDS instances sit in private subnets. Use a NAT Gateway to allow Spring Boot workers to securely access the external Gemini API and Temporal Cloud over the internet.

---

## 📈 Non-Functional Requirements (NFR)

When deploying to AWS, the architecture is designed to meet strict NFRs:

1. **Scalability:** The API layer (Controllers) scales independently from the background task execution (Workers). If background tasks pile up, ECS Auto Scaling triggers more Fargate instances based on Temporal backlog metrics without affecting the web server.
2. **High Availability (HA) & Fault Tolerance:** Fargate tasks are distributed across 3 Availability Zones (AZs). If an entire data center goes down, or if the Gemini API experiences an outage, Temporal's native retry engine pauses and retries failures without taking down the portal.
3. **Security:** Network isolation via Amazon VPC. The ALB handles public traffic and integrates **OAuth2 / OIDC** for securing API endpoints (authenticating user requests via JWT tokens). Worker containers and RDS databases reside strictly in private subnets, pulling credentials dynamically from AWS Secrets Manager via IAM Task execution roles.
4. **Observability:** Distributed tracing is handled via AWS X-Ray and centralized logging via Amazon CloudWatch Logs. Temporal metrics (via Prometheus) integrate with Amazon Managed Grafana to track workflow SLAs.

---

## 🔮 Future Architecture (Microservices Evolution)

Currently, `travel_temporal` operates as a "Modular Monolith" for ease of local development. However, because Temporal natively supports decoupled distributed systems via Task Queues, we can easily break this down into independent microservices.

### When to Migrate to Microservices?
You should transition from the current Modular Monolith to this Microservices Architecture when:
1. **Independent Scaling is Required:** For example, if the AI Advisory Service receives heavy traffic and consumes large amounts of memory, it should be scaled independently without unnecessarily duplicating the Payment or Flight booking workers.
2. **Team Autonomy:** When your engineering team grows and different squads need to own, deploy, and maintain the Flight, Hotel, and Payment components separately without merge conflicts.
3. **Security Isolation:** When compliance (like PCI-DSS) dictates that payment processing code must live in a completely isolated, locked-down environment (separate subnets/VPCs) away from standard web APIs.
4. **Polyglot Environments:** If the Data Science team wants to write the `AI Advisory Service` in Python, while the core transactional logic remains in Java. Temporal handles the cross-language orchestration seamlessly.

### Component-Wise Microservices Diagram

```mermaid
flowchart TD
    classDef api fill:#059669,stroke:#047857,stroke-width:2px,color:#fff;
    classDef worker fill:#2563eb,stroke:#1d4ed8,stroke-width:2px,color:#fff;
    classDef temporal fill:#111827,stroke:#374151,stroke-width:2px,color:#fff;
    classDef secure fill:#be123c,stroke:#9f1239,stroke-width:2px,color:#fff;

    UI["📱 React UI"]
    API["⚡ API Gateway (Spring Cloud / ALB)<br/>🔒 OAuth2 JWT Validation"]
    TC["⏳ Temporal Server<br/>(Task Routing & Orchestration)"]
    
    subgraph Microservices ["Distributed Worker Fleet"]
        FW["✈️ Flight Service<br/>(Listens to 'FLIGHT_TASK_QUEUE')"]
        HW["🏨 Hotel Service<br/>(Listens to 'HOTEL_TASK_QUEUE')"]
        AW["🤖 AI Advisory Service<br/>(Python/Java - 'AI_TASK_QUEUE')"]
        PW["💳 Payment Service<br/>(PCI-DSS Isolated - 'PAYMENT_QUEUE')"]
    end
    
    class API api;
    class FW,HW,AW worker;
    class PW secure;
    class TC temporal;

    UI -->|"HTTP POST /book (OAuth2)"| API
    API -->|"WorkflowClient.start()"| TC
    TC -->|"Routes Task"| FW
    TC -->|"Routes Task"| HW
    TC -->|"Routes Task"| AW
    TC -->|"Routes Task"| PW
```

### Component Breakdown

1. **API Gateway Service:** A lightweight edge service handling HTTP REST/GraphQL queries, enforcing OAuth2 security, and proxying valid requests to Temporal as Workflow triggers.
2. **Flight Service (Worker):** A dedicated microservice responsible solely for `bookFlight` and `cancelFlight` activities. Scaled independently based on flight traffic.
3. **Hotel & Transport Services (Workers):** Dedicated microservices managing their respective inventory and bookings.
4. **Payment Service (Worker):** A highly secure, isolated microservice handling the `PaymentWorkflow`. Resides in a locked-down subnet for strict PCI-DSS compliance.
5. **AI Advisory Service (Worker):** A compute-heavy, memory-optimized worker dedicated to interacting with the Gemini API, separated so it doesn't starve the transactional booking workers of resources.

*Temporal acts as the central orchestrator, seamlessly invoking activities across these disparate microservices via task queues, ensuring eventual consistency through Saga compensations even when the services are physically distributed.*

### ⚖️ Architectural Trade-Offs (Monolith vs. Microservices)

While migrating to a distributed microservices architecture offers immense scalability, it introduces several critical trade-offs that must be considered:

#### 🟢 The Benefits (What We Gain)
*   **Targeted Scalability:** Scale only the components that need it (e.g., spin up 50 AI Advisory workers during high traffic, but keep only 2 Payment workers).
*   **Security & Compliance:** Hardened boundaries. The Payment Service can be completely isolated in a private, PCI-DSS compliant VPC without restricting the public-facing API Gateway.
*   **Blast Radius Reduction:** If the Hotel booking system crashes due to an out-of-memory error, the Flight and AI Advisory systems remain fully operational.

#### 🔴 The Costs (What We Pay)
*   **Operational Complexity:** Instead of deploying one Spring Boot application, DevOps must manage multiple CI/CD pipelines, Docker images, ECS clusters, and routing rules.
*   **Network Latency:** In a monolith, calling `bookFlight()` takes nanoseconds (in-memory). In microservices, Temporal must route the task over gRPC to an external worker, adding network latency (milliseconds) to every step.
*   **Distributed Data Consistency:** You can no longer rely on a single `@Transactional` database commit to save a Flight, Hotel, and Payment simultaneously. You are forced to rely on eventual consistency and Saga rollbacks (which Temporal handles, but developers must write the compensation logic carefully).
*   **Developer Experience (DX):** Running the entire architecture locally on a developer's laptop becomes heavier. It requires Docker Compose to spin up multiple distinct worker containers instead of just running one Java `main()` method.

---

## 🛡️ Infrastructure Resiliency & Fault Tolerance (The Temporal Advantage)

In a distributed cloud environment, infrastructure failures are inevitable (network partitions, container crashes, underlying EC2 termination). This architecture relies on Temporal's intrinsic Event Sourcing capabilities, which provides a paradigm shift in resiliency compared to traditional BPMN orchestration tools (like Camunda or Zeebe).

### 1. Catastrophic Worker Crashes (Event Sourcing vs. DB Polling)
The most critical advantage of this architecture is how it handles catastrophic infrastructure failure. If an AWS Fargate container running the `AI Advisory Service` or `Flight Service` runs out of memory or the EC2 node dies mid-execution:
*   **The Problem with Traditional Tools (e.g., Camunda):** Traditional workflow engines rely heavily on database row-locks and polling. If a worker crashes mid-task, the engine often leaves the task in a locked "stuck" state until a generic timeout is reached, leading to latency spikes and complex manual intervention to unlock the DB row.
*   **The Temporal Approach (Event Sourcing):** Temporal does not save "current state" in a row. It persists an **append-only Event History** (like a git log for your code execution) into Amazon RDS. 
*   **The Impact:** If a worker crashes, the task is seamlessly routed to another healthy worker. The new worker *replays* the exact event history from the top of the function. Because Temporal knows exactly which activities (like a credit card charge) have already completed, it skips over them and resumes execution *exactly* from the line of code where the previous worker crashed. **Zero data loss, zero duplicated API calls, and zero manual DB unlocking.**

### 2. Permanent Domain Failures (Distributed Sagas)
If an activity cannot recover natively (e.g., the user's credit card is definitively declined by the bank):
*   **How it works:** The system catches the final `ActivityFailureException` and automatically triggers the **Saga Compensation** logic.
*   **Impact:** The parent workflow safely invokes the `cancelFlight` and `cancelHotel` activities, guaranteeing the system returns to a consistent state rather than leaving orphaned, unpaid bookings in the database.

### 3. Third-Party Rate Limits (Circuit Breaking & Throttling)
When integrating with rate-limited AI models (like Amazon Bedrock or Gemini), hitting quota limits can quickly poison the worker queue in traditional architectures.
*   **How it works:** If a `429 Too Many Requests` is detected, Temporal intercepts the specific error and is configured to back off for a prolonged period (e.g., 5 minutes) rather than hammering the API violently or failing the workflow outright.

---

## 🧠 AI-Specific NFR & Governance (Amazon Bedrock)

When moving generative AI features to production, integrating directly with public APIs (like the public Gemini endpoint) introduces enterprise risk. **Amazon Bedrock** is the ideal solution to run these workloads securely within the AWS ecosystem.

By migrating the `AI Advisory Service` to use Amazon Bedrock, we address several critical AI-specific Non-Functional Requirements:

### AI Governance & Private Deployment Diagram

```mermaid
flowchart TD
    classDef worker fill:#2563eb,stroke:#1d4ed8,stroke-width:2px,color:#fff;
    classDef network fill:#8c4fff,stroke:#5c1aeb,stroke-width:2px,color:#fff;
    classDef security fill:#e11d48,stroke:#be123c,stroke-width:2px,color:#fff;
    classDef ai fill:#059669,stroke:#047857,stroke-width:2px,color:#fff;

    subgraph VPC ["Amazon VPC (Private Subnet)"]
        AW["🤖 AI Advisory Worker<br/>(Temporal Activity)"]
        AIGW["🛡️ AI Gateway<br/>(Token Quotas & Cost Tracking)"]
        PL["🔗 AWS PrivateLink<br/>(VPC Endpoint)"]
    end
    class AW worker;
    class AIGW security;
    class PL network;

    subgraph Bedrock ["Amazon Bedrock (Fully Managed)"]
        GR["🛑 Bedrock Guardrails<br/>(PII Masking & Toxicity Filter)"]
        
        subgraph Models ["Foundation Models"]
            Claude["🧠 Anthropic Claude 3"]
            Llama["🦙 Meta Llama 3"]
        end
    end
    class GR security;
    class Claude,Llama ai;

    AW -->|"Sends Prompt"| AIGW
    AIGW -->|"Enforces Rate Limits"| PL
    PL -->|"Private AWS Backbone"| GR
    GR -->|"Filtered Prompt"| Claude
    Claude -->|"Raw Response"| GR
    GR -->|"Redacted Response"| AW
```

### 1. Data Privacy & Compliance
*   **Zero Data Retention:** Amazon Bedrock guarantees that customer prompts and responses are **not** used to train the underlying foundation models.
*   **Private Connectivity:** Instead of routing traffic over the public internet via a NAT Gateway, the AI Advisory Worker uses **AWS PrivateLink** to communicate with Bedrock entirely within the private AWS network, ensuring strict compliance with GDPR, HIPAA, and corporate data policies.

### 2. AI Guardrails & Toxicity Filtering
*   **Amazon Bedrock Guardrails:** We can enforce enterprise policies natively before a prompt reaches the model and before the response is returned to the user.
*   **PII Masking:** Guardrails automatically redact Personally Identifiable Information (like a user's passport details in the Visa check) so it is never processed by the LLM.
*   **Content Filtering:** Automatically blocks prompt injections and filters out toxic, biased, or harmful travel advice.

### 3. AI Gateway & Token Governance
*   To manage AI spend, an **AI Gateway** (which can be implemented via Amazon API Gateway or an external proxy) sits between the Temporal Worker and Bedrock.
*   **Rate Limiting & Quotas:** Enforces token limits per user/tenant to prevent a single user from exhausting the AI budget.
*   **Cost Observability:** Tags and tracks token usage (input/output tokens) down to the specific Temporal workflow ID for precise cost attribution.

### 4. Model Agility (Token Switching)
*   **Vendor Lock-in Mitigation:** Amazon Bedrock provides a unified API for multiple models (Anthropic Claude, Amazon Titan, Meta Llama).
*   **Dynamic Switching:** If a specific model experiences degradation or price changes, the AI Advisory Service can dynamically swap the underlying foundation model by simply changing the Bedrock Model ID configuration, requiring zero code changes or redeployments.
