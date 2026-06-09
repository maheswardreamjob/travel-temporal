package com.travel.mcp;

import com.travel.dto.TravelRequest;
import com.travel.starter.TravelBookingWorkflowStarter;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * INBOUND MCP (Model Context Protocol) SERVER ADAPTER
 * 
 * WHY IS THIS NECESSARY?
 * ----------------------
 * Traditional REST APIs (like our TravelWorkflowController) are designed for HUMANS and UIs (like React).
 * They expect highly specific JSON structures that frontends are hardcoded to send.
 * 
 * However, if we want an external AI Agent (like Claude Desktop, an OpenAI Agent, or an autonomous LangChain bot) 
 * to interact with our Travel Portal, the AI needs a standardized way to:
 *   1. Discover what actions are available (Tool Discovery).
 *   2. Understand the exact schema needed to trigger those actions without reading human API docs.
 *   3. Execute them using a standardized protocol.
 * 
 * This controller implements a lightweight Inbound MCP Server interface. By exposing our Temporal 
 * Workflows as "MCP Tools", any AI can natively understand how to book a trip or check status autonomously.
 */
@RestController
@RequestMapping("/mcp")
@CrossOrigin(origins = "*")
public class TravelMcpServerController {

    private final TravelBookingWorkflowStarter starter;

    public TravelMcpServerController(TravelBookingWorkflowStarter starter) {
        this.starter = starter;
    }

    /**
     * MCP TOOL DISCOVERY ENDPOINT
     * This endpoint tells connecting AI models exactly what this server can do.
     * Instead of a human reading Swagger docs, the AI reads this JSON schema to understand 
     * the tool names, descriptions, and required parameters.
     */
    @GetMapping("/tools")
    public ResponseEntity<Map<String, Object>> getMcpTools() {
        Map<String, Object> response = new HashMap<>();
        
        // Expose Tool 1: Book a Trip
        Map<String, Object> bookTripTool = new HashMap<>();
        bookTripTool.put("name", "book_trip");
        bookTripTool.put("description", "Start a Temporal workflow to book a flight, hotel, and arrange transport for a user.");
        
        Map<String, Object> bookTripSchema = new HashMap<>();
        bookTripSchema.put("type", "object");
        Map<String, Object> properties = new HashMap<>();
        properties.put("userId", Map.of("type", "string", "description", "Unique ID of the user"));
        properties.put("origin", Map.of("type", "string", "description", "City of departure (e.g. NYC)"));
        properties.put("destination", Map.of("type", "string", "description", "City of arrival (e.g. LHR)"));
        properties.put("departureDate", Map.of("type", "string", "description", "Format YYYY-MM-DD"));
        properties.put("returnDate", Map.of("type", "string", "description", "Format YYYY-MM-DD"));
        bookTripSchema.put("properties", properties);
        bookTripSchema.put("required", Arrays.asList("userId", "origin", "destination"));
        
        bookTripTool.put("inputSchema", bookTripSchema);

        // Expose Tool 2: Get Trip Status (Additional use case requested)
        Map<String, Object> getStatusTool = new HashMap<>();
        getStatusTool.put("name", "get_trip_status");
        getStatusTool.put("description", "Query the Temporal workflow to get the real-time status of a user's booking (e.g., flight booked, hotel pending).");
        
        Map<String, Object> getStatusSchema = new HashMap<>();
        getStatusSchema.put("type", "object");
        getStatusSchema.put("properties", Map.of("userId", Map.of("type", "string", "description", "Unique ID of the user")));
        getStatusSchema.put("required", Arrays.asList("userId"));
        
        getStatusTool.put("inputSchema", getStatusSchema);

        response.put("tools", Arrays.asList(bookTripTool, getStatusTool));
        return ResponseEntity.ok(response);
    }

    /**
     * MCP TOOL EXECUTION ENDPOINT
     * When the AI agent decides it needs to book a trip, it sends a standardized JSON-RPC payload here.
     * We act as the bridge, mapping the AI's generic tool call into our internal Temporal business logic.
     */
    @PostMapping("/execute")
    public ResponseEntity<Map<String, Object>> executeMcpTool(@RequestBody McpToolRequest request) {
        Map<String, Object> response = new HashMap<>();
        
        try {
            if ("book_trip".equals(request.getName())) {
                // The AI passes parameters dynamically in the 'arguments' map
                Map<String, Object> args = request.getArguments();
                
                TravelRequest travelRequest = new TravelRequest();
                travelRequest.setUserId((String) args.get("userId"));
                travelRequest.setOrigin((String) args.get("origin"));
                travelRequest.setDestination((String) args.get("destination"));
                travelRequest.setDepartureDate((String) args.get("departureDate"));
                travelRequest.setReturnDate((String) args.get("returnDate"));
                // Defaulting omitted values for simplicity
                travelRequest.setTravelClass("Economy Class");
                travelRequest.setHotelRating("4-Star Premium Hotel");
                travelRequest.setTransportVehicle("Tesla Model Y (EV)");
                travelRequest.setTravelersCount(1);
                travelRequest.setIncludeInsurance(false);

                // Bridge to Temporal
                String runId = starter.startWorkFlow(travelRequest);
                
                response.put("status", "success");
                response.put("message", "Temporal workflow started autonomously by AI.");
                response.put("workflowRunId", runId);

            } else if ("get_trip_status".equals(request.getName())) {
                String userId = (String) request.getArguments().get("userId");
                
                // Bridge to Temporal querying
                String status = starter.getWorkflowStatus(userId);
                
                response.put("status", "success");
                response.put("workflowStatus", status);
            } else {
                response.put("status", "error");
                response.put("message", "Unknown tool requested by AI: " + request.getName());
            }
        } catch (Exception e) {
            response.put("status", "error");
            response.put("message", "Failed to execute tool: " + e.getMessage());
        }
        
        return ResponseEntity.ok(response);
    }

    // Standard MCP payload structure
    public static class McpToolRequest {
        private String name;
        private Map<String, Object> arguments;

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public Map<String, Object> getArguments() { return arguments; }
        public void setArguments(Map<String, Object> arguments) { this.arguments = arguments; }
    }
}
