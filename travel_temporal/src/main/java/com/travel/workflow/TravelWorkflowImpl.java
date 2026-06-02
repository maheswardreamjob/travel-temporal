package com.travel.workflow;

import com.travel.activities.TravelActivities;
import com.travel.activities.AiAdvisoryActivities;
import com.travel.dto.TravelRequest;
import io.temporal.activity.ActivityOptions;
import io.temporal.common.RetryOptions;
import io.temporal.workflow.Async;
import io.temporal.workflow.Promise;
import io.temporal.workflow.Saga;
import io.temporal.workflow.SignalMethod;
import io.temporal.workflow.Workflow;
import lombok.extern.slf4j.Slf4j;

import java.time.Duration;

@Slf4j
public class TravelWorkflowImpl implements TravelWorkflow {

    private boolean isUserConfirmed = false;
    private boolean isUserCancelled = false;
    private String status = "PENDING_START";

    @SignalMethod
    public void sendConfirmationSignal() {
        log.info("📩 Received user confirmation signal.");
        isUserConfirmed = true;
    }

    @SignalMethod
    public void sendCancellationSignal() {
        log.info("🛑 Received user cancellation signal.");
        isUserCancelled = true;
    }

    @Override
    public String getStatus() {
        return this.status;
    }

    @Override
    public void bookTrip(TravelRequest travelRequest) {
        log.info("🚀 Starting parallel travel booking for user: {}", travelRequest.getUserId());

        TravelActivities activities = Workflow.newActivityStub(TravelActivities.class,
                ActivityOptions.newBuilder()
                        .setRetryOptions(RetryOptions.newBuilder()
                                .setMaximumAttempts(3)
                                .build())
                        .setStartToCloseTimeout(Duration.ofSeconds(10))
                        .build());

        Saga saga = new Saga(new Saga.Options.Builder().build());

        // Define parallel promises as functions to track completion states
        Promise<Boolean> flightPromise = null;
        Promise<Boolean> hotelPromise = null;
        Promise<Boolean> transportPromise = null;

        try {
            // Step 1: Initialize parent TripBooking in DB
            this.status = "INITIALIZING_TRIP";
            activities.initializeTripBooking(travelRequest);

            // Step 2: Book resources in Parallel
            this.status = "RESERVING_PARALLEL";
            log.info("⚡ Dispatching booking tasks in parallel...");

            flightPromise = Async.function(() -> {
                activities.bookFlight(travelRequest);
                return true;
            });

            hotelPromise = Async.function(() -> {
                activities.bookHotel(travelRequest);
                return true;
            });

            transportPromise = Async.function(() -> {
                activities.arrangeTransport(travelRequest);
                return true;
            });

            // Wait for all reservations to complete successfully
            try {
                Promise.allOf(flightPromise, hotelPromise, transportPromise).get();
            } catch (Exception e) {
                // Ensure all parallel activities finish (either pass/fail) before doing
                // compensation
                try {
                    flightPromise.get();
                } catch (Exception ignored) {
                }
                try {
                    hotelPromise.get();
                } catch (Exception ignored) {
                }
                try {
                    transportPromise.get();
                } catch (Exception ignored) {
                }
                throw e; // rethrow to trigger compensation registration
            }

            // Register compensations sequentially on the main workflow thread (thread-safe)
            saga.addCompensation(() -> {
                this.status = "COMPENSATING_FLIGHT";
                activities.cancelFlight(travelRequest);
            });
            saga.addCompensation(() -> {
                this.status = "COMPENSATING_HOTEL";
                activities.cancelHotel(travelRequest);
            });
            saga.addCompensation(() -> {
                this.status = "COMPENSATING_TRANSPORT";
                activities.cancelTransport(travelRequest);
            });

            log.info("🎉 All reservations successfully placed.");

            // Generate AI Advisory
            log.info("🤖 Executing AI Risk & Policy Advisor...");
            String bookingId = "travel_" + travelRequest.getUserId();
            
            AiAdvisoryActivities aiActivities = Workflow.newActivityStub(AiAdvisoryActivities.class,
                    ActivityOptions.newBuilder()
                            .setRetryOptions(RetryOptions.newBuilder()
                                    .setMaximumAttempts(3)
                                    .build())
                            .setStartToCloseTimeout(Duration.ofSeconds(20))
                            .build());

            String advisory = aiActivities.generateAiAdvisory(travelRequest);
            aiActivities.saveAiAdvisory(bookingId, advisory);

            // Step 3: Wait for user confirmation (120s timer)
            log.info("⏳ Waiting for user confirmation for 2 minutes...");
            this.status = "PENDING_USER_CONFIRMATION";

            boolean isConfirmed = Workflow.await(
                    Duration.ofMinutes(2),
                    () -> isUserConfirmed || isUserCancelled);

            if (!isConfirmed || isUserCancelled) {
                if (isUserCancelled) {
                    log.info("User cancelled the booking, initiating compensation for user: {}",
                            travelRequest.getUserId());
                } else {
                    log.info("User did not confirm within 2 minutes, initiating compensation for user: {}",
                            travelRequest.getUserId());
                }
                this.status = "COMPENSATING";
                saga.compensate();
                activities.cancelBooking(travelRequest);
                this.status = "CANCELLED";
            } else {
                log.info("✅ User confirmed booking. Initiating payment...");

                // Step 4: Call Child Workflow for Payments & Loyalty
                this.status = "PAYMENT_IN_PROGRESS";
                double totalAmount = calculateAmount(travelRequest);

                PaymentWorkflow childPayment = Workflow.newChildWorkflowStub(PaymentWorkflow.class);
                childPayment.processPayment(travelRequest, totalAmount);

                // Step 5: Finalize and Confirm bookings
                activities.confirmBooking(travelRequest);
                this.status = "CONFIRMED";
            }

        } catch (Exception e) {
            log.error("❌ Error during travel booking for user: {}. Initiating compensation.", travelRequest.getUserId(),
                    e);
            this.status = "COMPENSATING";

            // On failure, register compensations only for tasks that succeeded
            if (flightPromise != null && flightPromise.isCompleted()) {
                try {
                    flightPromise.get();
                    saga.addCompensation(() -> {
                        this.status = "COMPENSATING_FLIGHT";
                        activities.cancelFlight(travelRequest);
                    });
                } catch (Exception ignored) {
                }
            }
            if (hotelPromise != null && hotelPromise.isCompleted()) {
                try {
                    hotelPromise.get();
                    saga.addCompensation(() -> {
                        this.status = "COMPENSATING_HOTEL";
                        activities.cancelHotel(travelRequest);
                    });
                } catch (Exception ignored) {
                }
            }
            if (transportPromise != null && transportPromise.isCompleted()) {
                try {
                    transportPromise.get();
                    saga.addCompensation(() -> {
                        this.status = "COMPENSATING_TRANSPORT";
                        activities.cancelTransport(travelRequest);
                    });
                } catch (Exception ignored) {
                }
            }

            saga.compensate();
            activities.cancelBooking(travelRequest);
            this.status = "CANCELLED";
        }

        log.info("✅ Travel booking completed for user: {}", travelRequest.getUserId());
    }

    private double calculateAmount(TravelRequest travelRequest) {
        double total = 0.0;

        // Flight cost
        if ("First Class".equalsIgnoreCase(travelRequest.getTravelClass())) {
            total += 1500.0;
        } else if ("Business Class".equalsIgnoreCase(travelRequest.getTravelClass())) {
            total += 800.0;
        } else {
            total += 300.0;
        }

        // Hotel cost (per day * 7 days)
        double hotelRate = 120.0;
        if (travelRequest.getHotelRating() != null) {
            if (travelRequest.getHotelRating().contains("5-Star")) {
                hotelRate = 500.0;
            } else if (travelRequest.getHotelRating().contains("4-Star")) {
                hotelRate = 250.0;
            } else {
                hotelRate = 120.0;
            }
        }
        total += hotelRate * 7;

        // Transport cost
        if (travelRequest.getTransportVehicle() != null) {
            if (travelRequest.getTransportVehicle().contains("Mercedes")) {
                total += 300.0;
            } else if (travelRequest.getTransportVehicle().contains("Tesla")) {
                total += 150.0;
            } else {
                total += 80.0;
            }
        }

        // Travelers multiplier
        total *= travelRequest.getTravelersCount() > 0 ? travelRequest.getTravelersCount() : 1;

        // Insurance
        if (travelRequest.isIncludeInsurance()) {
            total += 50.0 * (travelRequest.getTravelersCount() > 0 ? travelRequest.getTravelersCount() : 1);
        }

        return total;
    }
}
