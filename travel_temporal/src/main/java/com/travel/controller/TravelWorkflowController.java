package com.travel.controller;

import com.travel.dto.TravelRequest;
import com.travel.starter.TravelBookingWorkflowStarter;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/travel")
@CrossOrigin(origins = "*")
public class TravelWorkflowController {

    private final TravelBookingWorkflowStarter starter;
    private final com.travel.repository.TripBookingRepository tripBookingRepository;

    public TravelWorkflowController(TravelBookingWorkflowStarter starter, com.travel.repository.TripBookingRepository tripBookingRepository) {
        this.starter = starter;
        this.tripBookingRepository = tripBookingRepository;
    }

    // Endpoint to start the travel booking workflow
    @PostMapping("/book")
    public ResponseEntity<java.util.Map<String, String>> bookTravel(@RequestBody TravelRequest travelRequest) {
        String runId = starter.startWorkFlow(travelRequest);
        java.util.Map<String, String> response = new java.util.HashMap<>();
        response.put("workflowId", "travel_" + travelRequest.getUserId());
        response.put("runId", runId);
        response.put("status", "Travel booking workflow started for user: " + travelRequest.getUserId());
        return ResponseEntity.ok(response);
    }

    // Endpoint to confirm the booking by sending a signal to the workflow
    @PostMapping("/confirm/{userId}")
    public ResponseEntity<String> confirmBooking(@PathVariable String userId) {
        starter.sendConfirmationSignal(userId);
        return ResponseEntity.ok("✅ Booking confirmed by user!");
    }

    // Endpoint to cancel the booking by sending a cancellation signal to the workflow
    @PostMapping("/cancel/{userId}")
    public ResponseEntity<String> cancelBooking(@PathVariable String userId) {
        starter.sendCancellationSignal(userId);
        return ResponseEntity.ok("🛑 Booking cancelled by user!");
    }

    // Endpoint to retrieve current workflow status
    @GetMapping("/status/{userId}")
    public ResponseEntity<String> getStatus(@PathVariable String userId) {
        String status = starter.getWorkflowStatus(userId);
        return ResponseEntity.ok(status);
    }

    // Endpoint to retrieve the AI advisory text
    @GetMapping("/advisory/{userId}")
    public ResponseEntity<java.util.Map<String, String>> getAdvisory(@PathVariable String userId) {
        String bookingId = "travel_" + userId;
        java.util.Map<String, String> response = new java.util.HashMap<>();
        tripBookingRepository.findById(bookingId).ifPresentOrElse(
            trip -> {
                response.put("advisory", trip.getAiAdvisory() != null ? trip.getAiAdvisory() : "");
            },
            () -> response.put("advisory", "")
        );
        return ResponseEntity.ok(response);
    }

    // Endpoint to terminate Spring Boot JVM (Chaos Switch simulation)
    @PostMapping("/kill")
    public ResponseEntity<String> killWorker() {
        new Thread(() -> {
            try {
                Thread.sleep(500);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            System.exit(0);
        }).start();
        return ResponseEntity.ok("JVM termination triggered. Spring Boot instance is shutting down!");
    }

}
