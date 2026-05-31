# Premium Travel Booking Portal (Temporal Saga & Parallel Orchestration)

Welcome to the **Premium Travel Booking Portal**, a world-class demonstration of distributed transactions using the **Saga Pattern** with the **Temporal Java SDK**, a **Spring Boot** backend, and a modern, glassmorphic **React/Vite** frontend dashboard.

This monorepo contains two primary components:
1. **`travel_temporal`**: The Spring Boot Java backend that acts as the Temporal client/worker, manages JPA entities, and exposes REST APIs.
2. **`travel-approval-ui`**: The React UI dashboard that provides real-time state visualization, terminal worker logs, simulation controls, and user approvals.

---

## 🏗️ Tech Design & Architecture

The application demonstrates reliable transaction orchestration across multiple mock services (Flight, Hotel, and Local Transport). The booking stage dispatches reservations **in parallel**, and once confirmed, delegates billing to a **nested Child Workflow**. If any phase fails or times out, the workflow automatically runs compensation activities in reverse order (rollbacks) to guarantee eventual consistency.

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
