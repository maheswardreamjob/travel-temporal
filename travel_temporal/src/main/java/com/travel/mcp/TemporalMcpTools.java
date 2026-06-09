package com.travel.mcp;

import com.travel.dto.TravelRequest;
import com.travel.starter.TravelBookingWorkflowStarter;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.stereotype.Service;

/**
 * PROPER MCP SERVER IMPLEMENTATION (Spring AI)
 * 
 * This class exposes our Temporal workflows to external AI Agents using the 
 * official Model Context Protocol (MCP) over Server-Sent Events (SSE).
 * 
 * Under the hood, Spring AI automatically scans methods annotated with @Tool,
 * converts their method signatures into standard JSON-Schema, and exposes them 
 * on the /mcp/sse and /mcp/message endpoints natively.
 */
@Service
public class TemporalMcpTools {

    private final TravelBookingWorkflowStarter starter;

    public TemporalMcpTools(TravelBookingWorkflowStarter starter) {
        this.starter = starter;
    }

    /**
     * Tool to book a new trip.
     * The @Tool annotation automatically exposes this to the MCP Server.
     * The AI will read the Javadoc description to know when to use this tool,
     * and it will read the method parameters to know what data to pass.
     */
    @Tool(description = "Start a Temporal workflow to book a flight, hotel, and arrange transport for a user.")
    public String bookTrip(String userId, String origin, String destination, String departureDate, String returnDate) {
        
        TravelRequest request = new TravelRequest();
        request.setUserId(userId);
        request.setOrigin(origin);
        request.setDestination(destination);
        request.setDepartureDate(departureDate);
        request.setReturnDate(returnDate);
        
        // Defaulting omitted values for simplicity
        request.setTravelClass("Economy Class");
        request.setHotelRating("4-Star Premium Hotel");
        request.setTransportVehicle("Tesla Model Y (EV)");
        request.setTravelersCount(1);
        request.setIncludeInsurance(false);

        String runId = starter.startWorkFlow(request);
        return "Temporal workflow started autonomously. Run ID: " + runId;
    }

    /**
     * Tool to check the status of a trip.
     */
    @Tool(description = "Query the Temporal workflow to get the real-time status of a user's booking (e.g., flight booked, hotel pending).")
    public String getTripStatus(String userId) {
        return starter.getWorkflowStatus(userId);
    }
}
