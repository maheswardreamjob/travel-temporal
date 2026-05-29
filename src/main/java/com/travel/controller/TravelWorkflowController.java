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

    public TravelWorkflowController(TravelBookingWorkflowStarter starter) {
        this.starter = starter;
    }

    // Endpoint to start the travel booking workflow
    @PostMapping("/book")
    public ResponseEntity<String> bookTravel(@RequestBody TravelRequest travelRequest) {
        starter.startWorkFlow(travelRequest);
        return ResponseEntity.ok("Travel booking workflow started for user: " + travelRequest.getUserId());
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

}
